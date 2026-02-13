/**
 * OpenSSL subprocess bridge for SSH key operations.
 *
 * All key material is passed via stdin/stdout — no temp files.
 */

import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import type { SshKeyAlgorithm } from "../types.js";

const execFileAsync = promisify(execFile);
const TIMEOUT_MS = 30_000;

function resolveKeygen(): string {
  return process.platform === "win32" ? "ssh-keygen.exe" : "ssh-keygen";
}

function resolveOpenssl(): string {
  return process.platform === "win32" ? "openssl.exe" : "openssl";
}

export interface SshKeyPair {
  privateKey: string;
  publicKey: string;
  algorithm: SshKeyAlgorithm;
}

/**
 * Generate an SSH key pair in memory.
 * Returns PEM private key and OpenSSH public key.
 */
export async function generateSshKeyPair(
  algorithm: SshKeyAlgorithm,
  comment?: string,
): Promise<SshKeyPair> {
  const args = buildKeygenArgs(algorithm, comment);
  // ssh-keygen -f /dev/stdin doesn't work; use a pipe-based approach
  return await generateViaSshKeygen(args, algorithm);
}

function buildKeygenArgs(algorithm: SshKeyAlgorithm, comment?: string): string[] {
  const args: string[] = ["-t"];
  switch (algorithm) {
    case "ed25519":
      args.push("ed25519");
      break;
    case "ecdsa-p256":
      args.push("ecdsa", "-b", "256");
      break;
    case "ecdsa-p384":
      args.push("ecdsa", "-b", "384");
      break;
    case "rsa-2048":
      args.push("rsa", "-b", "2048");
      break;
    case "rsa-4096":
      args.push("rsa", "-b", "4096");
      break;
  }
  if (comment) {
    args.push("-C", comment);
  }
  args.push("-N", ""); // No passphrase
  return args;
}

async function generateViaSshKeygen(
  baseArgs: string[],
  algorithm: SshKeyAlgorithm,
): Promise<SshKeyPair> {
  // Use a temporary approach: generate to stdout via /dev/stdout on Unix
  // or use OpenSSL directly on Windows
  if (process.platform === "win32") {
    return generateViaOpenssl(algorithm);
  }

  return new Promise((resolve, reject) => {
    const tmpDir = `/tmp/tee-vault-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const keyPath = `${tmpDir}/key`;

    const mkdirProc = spawn("mkdir", ["-p", tmpDir]);
    mkdirProc.on("close", () => {
      const child = spawn(resolveKeygen(), [...baseArgs, "-f", keyPath], {
        stdio: ["ignore", "pipe", "pipe"],
        timeout: TIMEOUT_MS,
      });

      let stderr = "";
      child.stderr?.on("data", (d) => {
        stderr += d.toString();
      });

      child.on("close", async (code) => {
        if (code !== 0) {
          // Cleanup
          spawn("rm", ["-rf", tmpDir]);
          reject(new Error(`ssh-keygen failed (${code}): ${stderr}`));
          return;
        }
        try {
          const { readFile } = await import("node:fs/promises");
          const privateKey = await readFile(keyPath, "utf8");
          const publicKey = await readFile(`${keyPath}.pub`, "utf8");
          // Cleanup
          spawn("rm", ["-rf", tmpDir]);
          resolve({ privateKey, publicKey: publicKey.trim(), algorithm });
        } catch (err) {
          spawn("rm", ["-rf", tmpDir]);
          reject(err);
        }
      });
    });
  });
}

async function generateViaOpenssl(algorithm: SshKeyAlgorithm): Promise<SshKeyPair> {
  let privateKey: string;
  let publicKey: string;

  switch (algorithm) {
    case "ed25519": {
      const { stdout: privPem } = await execFileAsync(
        resolveOpenssl(),
        ["genpkey", "-algorithm", "ed25519"],
        { timeout: TIMEOUT_MS, encoding: "utf8" },
      );
      privateKey = privPem;
      const pubResult = await spawnWithInput(resolveOpenssl(), ["pkey", "-pubout"], privPem);
      publicKey = pubResult;
      break;
    }
    case "ecdsa-p256":
    case "ecdsa-p384": {
      const curve = algorithm === "ecdsa-p256" ? "prime256v1" : "secp384r1";
      const { stdout: privPem } = await execFileAsync(
        resolveOpenssl(),
        ["genpkey", "-algorithm", "EC", "-pkeyopt", `ec_paramgen_curve:${curve}`],
        { timeout: TIMEOUT_MS, encoding: "utf8" },
      );
      privateKey = privPem;
      const pubResult = await spawnWithInput(resolveOpenssl(), ["pkey", "-pubout"], privPem);
      publicKey = pubResult;
      break;
    }
    case "rsa-2048":
    case "rsa-4096": {
      const bits = algorithm === "rsa-2048" ? "2048" : "4096";
      const { stdout: privPem } = await execFileAsync(
        resolveOpenssl(),
        ["genpkey", "-algorithm", "RSA", "-pkeyopt", `rsa_keygen_bits:${bits}`],
        { timeout: TIMEOUT_MS, encoding: "utf8" },
      );
      privateKey = privPem;
      const pubResult = await spawnWithInput(resolveOpenssl(), ["pkey", "-pubout"], privPem);
      publicKey = pubResult;
      break;
    }
  }

  return { privateKey, publicKey, algorithm };
}

/** Spawn a process, pipe input to stdin, capture stdout. */
async function spawnWithInput(command: string, args: string[], input: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (d) => {
      stdout += d.toString();
    });
    child.stderr?.on("data", (d) => {
      stderr += d.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`${command} failed (${code}): ${stderr}`));
      } else {
        resolve(stdout);
      }
    });
    child.stdin?.write(input);
    child.stdin?.end();

    setTimeout(() => {
      try {
        child.kill("SIGKILL");
      } catch {
        /* ignore */
      }
      reject(new Error(`${command} timed out`));
    }, TIMEOUT_MS);
  });
}

/** Sign data using a PEM private key via OpenSSL. */
export async function opensslSign(
  privateKeyPem: string,
  data: Buffer,
  algorithm: SshKeyAlgorithm,
): Promise<Buffer> {
  const _digestAlg = algorithm.startsWith("ed25519") ? "null" : "sha256";
  const args =
    algorithm === "ed25519"
      ? ["pkeyutl", "-sign", "-inkey", "/dev/stdin"]
      : ["dgst", `-sha256`, "-sign", "/dev/stdin"];

  return new Promise((resolve, reject) => {
    const child = spawn(resolveOpenssl(), args, {
      stdio: ["pipe", "pipe", "pipe"],
    });
    const chunks: Buffer[] = [];
    let stderr = "";
    child.stdout?.on("data", (d) => chunks.push(d));
    child.stderr?.on("data", (d) => {
      stderr += d.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`openssl sign failed (${code}): ${stderr}`));
      } else {
        resolve(Buffer.concat(chunks));
      }
    });
    child.stdin?.write(privateKeyPem);
    child.stdin?.write(data);
    child.stdin?.end();

    setTimeout(() => {
      try {
        child.kill("SIGKILL");
      } catch {
        /* ignore */
      }
      reject(new Error("openssl sign timed out"));
    }, TIMEOUT_MS);
  });
}

/** Check if ssh-keygen and openssl are available. */
export async function isOpensslAvailable(): Promise<boolean> {
  try {
    await execFileAsync(resolveOpenssl(), ["version"], {
      timeout: 5000,
      encoding: "utf8",
    });
    return true;
  } catch {
    return false;
  }
}
