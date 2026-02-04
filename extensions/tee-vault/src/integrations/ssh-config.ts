/**
 * SSH PKCS#11 configuration management.
 *
 * From mostlySecure.md:
 *   - SSH config uses PKCS11Provider pointing to yubihsm_pkcs11.dll
 *   - ssh-agent loads the PKCS#11 provider at session start
 *   - No key file paths — authentication is via HSM
 *
 * This module generates SSH config entries and manages ssh-agent
 * PKCS#11 provider loading for HSM-backed SSH authentication.
 */

import { execFile, spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { YUBIHSM_DEFAULT_PKCS11_PATH } from "../constants.js";

const execFileAsync = promisify(execFile);
const TIMEOUT_MS = 15_000;

export interface SshHostConfig {
  hostAlias: string;
  hostname: string;
  user: string;
  port?: number;
  pkcs11Provider?: string;
  extraOptions?: Record<string, string>;
}

/**
 * Generate an SSH config block for HSM-backed authentication.
 * From mostlySecure.md, Step 5:
 *   Host logan
 *     HostName 20.245.79.3
 *     User hoskinson
 *     PKCS11Provider C:\Program Files\Yubico\YubiHSM2\bin\yubihsm_pkcs11.dll
 */
export function generateSshConfigBlock(host: SshHostConfig): string {
  const pkcs11 = host.pkcs11Provider ?? YUBIHSM_DEFAULT_PKCS11_PATH;
  const lines = [
    `Host ${host.hostAlias}`,
    `    HostName ${host.hostname}`,
    `    User ${host.user}`,
  ];
  if (host.port && host.port !== 22) {
    lines.push(`    Port ${host.port}`);
  }
  lines.push(`    PKCS11Provider ${pkcs11}`);
  // No IdentityFile — HSM handles auth
  lines.push(`    # Key is HSM-resident; no IdentityFile needed`);
  if (host.extraOptions) {
    for (const [key, value] of Object.entries(host.extraOptions)) {
      lines.push(`    ${key} ${value}`);
    }
  }
  return lines.join("\n");
}

/** Get the path to the user's SSH config file. */
export function getSshConfigPath(): string {
  return path.join(os.homedir(), ".ssh", "config");
}

/** Read the current SSH config file. Returns empty string if not found. */
export async function readSshConfig(): Promise<string> {
  try {
    return await fs.readFile(getSshConfigPath(), "utf8");
  } catch {
    return "";
  }
}

/**
 * Add or update a host block in the SSH config.
 * Replaces existing block for the same host alias if present.
 */
export async function upsertSshHostConfig(host: SshHostConfig): Promise<void> {
  const configPath = getSshConfigPath();
  const sshDir = path.dirname(configPath);

  // Ensure .ssh directory exists with proper permissions
  await fs.mkdir(sshDir, { recursive: true });
  if (process.platform !== "win32") {
    await fs.chmod(sshDir, 0o700);
  }

  const existing = await readSshConfig();
  const newBlock = generateSshConfigBlock(host);

  // Parse existing config and replace matching host block
  const updated = replaceHostBlock(existing, host.hostAlias, newBlock);
  await fs.writeFile(configPath, updated, "utf8");

  // Set permissions
  if (process.platform !== "win32") {
    await fs.chmod(configPath, 0o600);
  }
}

/**
 * Remove a host block from the SSH config.
 */
export async function removeSshHostConfig(hostAlias: string): Promise<boolean> {
  const configPath = getSshConfigPath();
  const existing = await readSshConfig();
  if (!existing) {
    return false;
  }

  const updated = replaceHostBlock(existing, hostAlias, "");
  if (updated === existing) {
    return false;
  }

  await fs.writeFile(configPath, updated, "utf8");
  return true;
}

/** Replace a host block in SSH config content. */
function replaceHostBlock(config: string, hostAlias: string, replacement: string): string {
  const lines = config.split("\n");
  const result: string[] = [];
  let inTargetBlock = false;
  let found = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed.startsWith("Host ") && !trimmed.startsWith("Host *")) {
      const alias = trimmed.slice(5).trim().split(/\s+/)[0];
      if (alias === hostAlias) {
        inTargetBlock = true;
        found = true;
        if (replacement) {
          result.push(replacement);
        }
        continue;
      } else {
        inTargetBlock = false;
      }
    }

    if (inTargetBlock) {
      // Skip lines belonging to the target block (indented lines)
      if (trimmed === "" || line.startsWith(" ") || line.startsWith("\t")) {
        continue;
      }
      // Non-indented, non-empty line = new block
      inTargetBlock = false;
    }

    result.push(line);
  }

  // If not found, append the new block
  if (!found && replacement) {
    if (result.length > 0 && result[result.length - 1] !== "") {
      result.push("");
    }
    result.push(replacement);
  }

  return result.join("\n");
}

/**
 * Load the PKCS#11 provider into ssh-agent.
 * From mostlySecure.md:
 *   ssh-add -s "C:\Program Files\Yubico\YubiHSM2\bin\yubihsm_pkcs11.dll"
 */
export async function loadPkcs11IntoAgent(pkcs11Library?: string): Promise<void> {
  const lib = pkcs11Library ?? YUBIHSM_DEFAULT_PKCS11_PATH;
  const sshAdd = process.platform === "win32" ? "ssh-add.exe" : "ssh-add";

  try {
    await execFileAsync(sshAdd, ["-s", lib], {
      timeout: TIMEOUT_MS,
      encoding: "utf8",
    });
  } catch (err) {
    throw new Error(
      `Failed to load PKCS#11 into ssh-agent: ${err instanceof Error ? err.message : err}. ` +
        `Ensure ssh-agent is running and yubihsm-connector is active.`,
      { cause: err },
    );
  }
}

/** Remove the PKCS#11 provider from ssh-agent. */
export async function unloadPkcs11FromAgent(pkcs11Library?: string): Promise<void> {
  const lib = pkcs11Library ?? YUBIHSM_DEFAULT_PKCS11_PATH;
  const sshAdd = process.platform === "win32" ? "ssh-add.exe" : "ssh-add";

  try {
    await execFileAsync(sshAdd, ["-e", lib], {
      timeout: TIMEOUT_MS,
      encoding: "utf8",
    });
  } catch {
    // Best-effort; might not be loaded
  }
}

/** List keys currently in ssh-agent. */
export async function listAgentKeys(): Promise<string[]> {
  const sshAdd = process.platform === "win32" ? "ssh-add.exe" : "ssh-add";
  try {
    const { stdout } = await execFileAsync(sshAdd, ["-l"], {
      timeout: TIMEOUT_MS,
      encoding: "utf8",
    });
    return stdout.trim().split("\n").filter(Boolean);
  } catch {
    return [];
  }
}

/** Check if yubihsm-connector is running. */
export async function isConnectorRunning(connectorUrl?: string): Promise<boolean> {
  const url = connectorUrl ?? "http://localhost:12345";
  const { request: httpReq } = await import("node:http");

  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), 3_000);
    const req = httpReq(`${url}/connector/status`, (res) => {
      clearTimeout(timer);
      resolve(res.statusCode === 200);
    });
    req.on("error", () => {
      clearTimeout(timer);
      resolve(false);
    });
    req.end();
  });
}

/**
 * Generate a MCP server config entry that uses ssh-agent (no key file).
 * From mostlySecure.md, Step 11:
 *   SSH auth is handled by the agent, which uses the HSM. No key path needed.
 */
export function generateMcpSshConfig(opts: {
  host: string;
  port?: number;
  username: string;
}): Record<string, unknown> {
  return {
    type: "stdio",
    command: "cmd",
    args: [
      "/c",
      "npx",
      "-y",
      "@fangjunjie/ssh-mcp-server",
      "--host",
      opts.host,
      "--port",
      String(opts.port ?? 22),
      "--username",
      opts.username,
      // No --privateKey — ssh-agent handles auth via PKCS#11
    ],
    env: {},
  };
}

/** Extract the public key from the HSM in SSH authorized_keys format. */
export async function getHsmPublicKeySsh(
  objectId: number,
  connectorUrl?: string,
  _pin?: string,
): Promise<string> {
  const shellPath =
    process.platform === "win32"
      ? "C:\\Program Files\\Yubico\\YubiHSM Shell\\bin\\yubihsm-shell.exe"
      : "yubihsm-shell";

  const { stdout } = await execFileAsync(
    shellPath,
    [
      "--connector",
      connectorUrl ?? "http://localhost:12345",
      "-a",
      "get-public-key",
      "-i",
      String(objectId),
      "--outformat",
      "PEM",
    ],
    { timeout: TIMEOUT_MS, encoding: "utf8" },
  );
  // The PEM output can be converted to SSH format via ssh-keygen
  const pemKey = stdout.trim();
  const sshKeygen = process.platform === "win32" ? "ssh-keygen.exe" : "ssh-keygen";

  return new Promise((resolve, _reject) => {
    const child = spawn(sshKeygen, ["-i", "-m", "PKCS8", "-f", "/dev/stdin"], {
      stdio: ["pipe", "pipe", "pipe"],
    });
    let out = "";
    child.stdout?.on("data", (d) => {
      out += d.toString();
    });
    child.on("close", (code) => {
      if (code !== 0) {
        // Return the PEM key as fallback
        resolve(pemKey);
      } else {
        resolve(out.trim());
      }
    });
    child.stdin?.write(pemKey);
    child.stdin?.end();
  });
}
