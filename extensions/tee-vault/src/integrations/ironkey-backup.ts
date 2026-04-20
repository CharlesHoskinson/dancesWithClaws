/**
 * IronKey disaster recovery backup via YubiHSM wrap key export.
 *
 * From mostlySecure.md:
 *   "The backup strategy uses a wrap key to encrypt all other keys for export.
 *    The wrap key itself cannot be self-wrapped. Instead, we generate the wrap
 *    key from known raw material, store that raw material on the IronKey, and
 *    use the wrap key to export everything else."
 *
 * Flow:
 *   1. Generate 32 random bytes (wrap key raw material)
 *   2. Import into HSM as a wrap key (ID 200, label "backup-wrap")
 *   3. Export each HSM key as a wrapped blob via yubihsm-shell
 *   4. Copy raw material + wrapped blobs to IronKey
 *   5. Securely delete raw material from PC
 *
 * Restore:
 *   1. Import raw material into new HSM as wrap key
 *   2. Import each wrapped blob
 */

import { execFile, spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const _execFileAsync = promisify(execFile);
const TIMEOUT_MS = 30_000;

const DEFAULT_WRAP_KEY_ID = 200;
const DEFAULT_WRAP_KEY_LABEL = "backup-wrap";

export interface BackupManifest {
  createdAt: string;
  wrapKeyId: number;
  wrapKeyLabel: string;
  wrappedObjects: WrappedObjectInfo[];
  hsmSerial?: string;
}

export interface WrappedObjectInfo {
  objectId: number;
  objectType: string;
  label: string;
  algorithm: string;
  filename: string;
}

function resolveYubihsmShell(): string {
  return process.platform === "win32"
    ? "C:\\Program Files\\Yubico\\YubiHSM Shell\\bin\\yubihsm-shell.exe"
    : "yubihsm-shell";
}

/** Run a yubihsm-shell command. Returns stdout. */
async function yubihsmShell(args: string[], pin: string, connectorUrl?: string): Promise<string> {
  const shellPath = resolveYubihsmShell();
  const fullArgs = [
    "--connector",
    connectorUrl ?? "http://localhost:12345",
    "--authkey",
    "0002", // admin auth key (not default)
    ...args,
  ];

  return new Promise((resolve, reject) => {
    const child = spawn(shellPath, fullArgs, {
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
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
        reject(new Error(`yubihsm-shell failed (${code}): ${stderr || stdout}`));
      } else {
        resolve(stdout);
      }
    });
    // Send password when prompted
    child.stdin?.write(`${pin}\n`);
    child.stdin?.end();

    setTimeout(() => {
      try {
        child.kill("SIGKILL");
      } catch {
        /* ignore */
      }
      reject(new Error("yubihsm-shell timed out"));
    }, TIMEOUT_MS);
  });
}

/**
 * Generate wrap key raw material and import it into the HSM.
 * Returns the raw key bytes (caller must store on IronKey and then zero).
 */
export async function createWrapKey(
  pin: string,
  opts?: {
    wrapKeyId?: number;
    label?: string;
    connectorUrl?: string;
    outputPath?: string;
  },
): Promise<{ rawKeyPath: string; wrapKeyId: number }> {
  const wrapKeyId = opts?.wrapKeyId ?? DEFAULT_WRAP_KEY_ID;
  const label = opts?.label ?? DEFAULT_WRAP_KEY_LABEL;

  // Generate 32 random bytes for the wrap key
  const rawKey = randomBytes(32);
  const rawKeyPath =
    opts?.outputPath ?? path.join(process.env.TEMP ?? "/tmp", `wrap-key-raw-${Date.now()}.bin`);

  await fs.writeFile(rawKeyPath, rawKey);

  try {
    // Import into HSM via yubihsm-shell
    // put wrapkey <session> <id> <label> <domains> <capabilities> <delegated-capabilities> <algorithm> <key-file>
    await yubihsmShell(
      [
        "-a",
        "put-wrap-key",
        "-i",
        String(wrapKeyId),
        "-l",
        label,
        "-d",
        "1",
        "-c",
        "export-wrapped,import-wrapped",
        "--delegated",
        "all",
        "-A",
        "aes256-ccm-wrap",
        "--in",
        rawKeyPath,
      ],
      pin,
      opts?.connectorUrl,
    );
  } catch (err) {
    // Clean up on failure
    await secureDelete(rawKeyPath);
    throw err;
  }

  return { rawKeyPath, wrapKeyId };
}

/**
 * Export a wrapped key blob from the HSM.
 * The blob is encrypted by the wrap key — safe to store on disk/IronKey.
 */
export async function exportWrappedObject(
  pin: string,
  wrapKeyId: number,
  objectId: number,
  objectType: string,
  outputPath: string,
  connectorUrl?: string,
): Promise<void> {
  await yubihsmShell(
    [
      "-a",
      "get-wrapped",
      "--wrap-id",
      String(wrapKeyId),
      "--object-id",
      String(objectId),
      "--object-type",
      objectType,
      "--out",
      outputPath,
    ],
    pin,
    connectorUrl,
  );
}

/**
 * Import a wrapped key blob into the HSM.
 * The HSM must have the matching wrap key installed.
 */
export async function importWrappedObject(
  pin: string,
  wrapKeyId: number,
  inputPath: string,
  connectorUrl?: string,
): Promise<void> {
  await yubihsmShell(
    ["-a", "put-wrapped", "--wrap-id", String(wrapKeyId), "--in", inputPath],
    pin,
    connectorUrl,
  );
}

/** Import raw wrap key material into a new HSM (disaster recovery). */
export async function importRawWrapKey(
  pin: string,
  rawKeyPath: string,
  opts?: {
    wrapKeyId?: number;
    label?: string;
    connectorUrl?: string;
  },
): Promise<void> {
  const wrapKeyId = opts?.wrapKeyId ?? DEFAULT_WRAP_KEY_ID;
  const label = opts?.label ?? DEFAULT_WRAP_KEY_LABEL;

  await yubihsmShell(
    [
      "-a",
      "put-wrap-key",
      "-i",
      String(wrapKeyId),
      "-l",
      label,
      "-d",
      "1",
      "-c",
      "export-wrapped,import-wrapped",
      "--delegated",
      "all",
      "-A",
      "aes256-ccm-wrap",
      "--in",
      rawKeyPath,
    ],
    pin,
    opts?.connectorUrl,
  );
}

/**
 * Full backup: export all HSM objects as wrapped blobs + manifest.
 * The output directory should be on the IronKey.
 */
export async function createFullBackup(
  pin: string,
  outputDir: string,
  opts?: {
    wrapKeyId?: number;
    connectorUrl?: string;
    objectIds?: Array<{
      id: number;
      type: string;
      label: string;
      algorithm: string;
    }>;
  },
): Promise<BackupManifest> {
  const wrapKeyId = opts?.wrapKeyId ?? DEFAULT_WRAP_KEY_ID;
  await fs.mkdir(outputDir, { recursive: true });

  const manifest: BackupManifest = {
    createdAt: new Date().toISOString(),
    wrapKeyId,
    wrapKeyLabel: DEFAULT_WRAP_KEY_LABEL,
    wrappedObjects: [],
  };

  // Export each object
  const objects = opts?.objectIds ?? [];
  for (const obj of objects) {
    const filename = `${obj.label}-${obj.id}.wrap`;
    const outPath = path.join(outputDir, filename);
    await exportWrappedObject(pin, wrapKeyId, obj.id, obj.type, outPath, opts?.connectorUrl);
    manifest.wrappedObjects.push({
      objectId: obj.id,
      objectType: obj.type,
      label: obj.label,
      algorithm: obj.algorithm,
      filename,
    });
  }

  // Write manifest
  const manifestPath = path.join(outputDir, "backup-manifest.json");
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2), "utf8");

  return manifest;
}

/**
 * Full restore: import wrap key + all wrapped blobs from a backup directory.
 * The backup directory should be on the IronKey.
 */
export async function restoreFullBackup(
  pin: string,
  backupDir: string,
  rawKeyPath: string,
  opts?: { connectorUrl?: string },
): Promise<BackupManifest> {
  // Read manifest
  const manifestPath = path.join(backupDir, "backup-manifest.json");
  const raw = await fs.readFile(manifestPath, "utf8");
  const manifest = JSON.parse(raw) as BackupManifest;

  // Import raw wrap key
  await importRawWrapKey(pin, rawKeyPath, {
    wrapKeyId: manifest.wrapKeyId,
    label: manifest.wrapKeyLabel,
    connectorUrl: opts?.connectorUrl,
  });

  // Import each wrapped blob
  for (const obj of manifest.wrappedObjects) {
    const blobPath = path.join(backupDir, obj.filename);
    await importWrappedObject(pin, manifest.wrapKeyId, blobPath, opts?.connectorUrl);
  }

  return manifest;
}

/** Securely delete a file by overwriting with random data before unlinking. */
async function secureDelete(filePath: string): Promise<void> {
  try {
    const stat = await fs.stat(filePath);
    const noise = randomBytes(stat.size);
    await fs.writeFile(filePath, noise);
    await fs.unlink(filePath);
  } catch {
    // Best-effort; try plain delete
    try {
      await fs.unlink(filePath);
    } catch {
      /* ignore */
    }
  }
}

export { secureDelete };
