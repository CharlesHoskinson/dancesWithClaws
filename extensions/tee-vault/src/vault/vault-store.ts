/**
 * Encrypted vault file I/O.
 *
 * Single file at <stateDir>/tee-vault/vault.enc containing:
 * - Sealed VMK blob
 * - Backend identifier
 * - Encrypted entry records
 * - HMAC-SHA256 integrity checksum
 */

import fs from "node:fs/promises";
import path from "node:path";
import type { VaultEnvelope, VaultEntry, BackendType } from "../types.js";
import { VAULT_DIR_NAME, VAULT_FILE_NAME } from "../constants.js";
import { computeHmac, verifyHmac } from "../crypto/key-hierarchy.js";

export function resolveVaultDir(stateDir: string): string {
  return path.join(stateDir, VAULT_DIR_NAME);
}

export function resolveVaultPath(stateDir: string): string {
  return path.join(resolveVaultDir(stateDir), VAULT_FILE_NAME);
}

/** Check if a vault file exists. */
export async function vaultExists(stateDir: string): Promise<boolean> {
  try {
    await fs.access(resolveVaultPath(stateDir));
    return true;
  } catch {
    return false;
  }
}

/** Read and parse the vault envelope from disk. */
export async function readVault(stateDir: string): Promise<VaultEnvelope> {
  const vaultPath = resolveVaultPath(stateDir);
  const raw = await fs.readFile(vaultPath, "utf8");
  const envelope = JSON.parse(raw) as VaultEnvelope;
  if (envelope.version !== 1) {
    throw new Error(`Unsupported vault version: ${envelope.version}`);
  }
  return envelope;
}

/** Write the vault envelope to disk atomically. */
export async function writeVault(stateDir: string, envelope: VaultEnvelope): Promise<void> {
  const vaultDir = resolveVaultDir(stateDir);
  await fs.mkdir(vaultDir, { recursive: true });
  const vaultPath = resolveVaultPath(stateDir);
  const tmpPath = `${vaultPath}.tmp`;
  const data = JSON.stringify(envelope, null, 2);
  await fs.writeFile(tmpPath, data, "utf8");
  await fs.rename(tmpPath, vaultPath);
}

/** Compute the HMAC over all entry ciphertexts for integrity verification. */
export function computeEnvelopeHmac(vmk: Buffer, entries: VaultEntry[]): string {
  const payload = entries
    .map((e) => `${e.id}:${e.version}:${e.ciphertext ?? ""}:${e.authTag ?? ""}`)
    .join("|");
  const hmacBuf = computeHmac(vmk, Buffer.from(payload, "utf8"));
  return hmacBuf.toString("hex");
}

/** Verify the HMAC integrity of the vault envelope. */
export function verifyEnvelopeHmac(
  vmk: Buffer,
  entries: VaultEntry[],
  expectedHmac: string,
): boolean {
  const payload = entries
    .map((e) => `${e.id}:${e.version}:${e.ciphertext ?? ""}:${e.authTag ?? ""}`)
    .join("|");
  const expected = Buffer.from(expectedHmac, "hex");
  return verifyHmac(vmk, Buffer.from(payload, "utf8"), expected);
}

/** Create a new empty vault envelope. */
export function createEmptyEnvelope(
  sealedVmk: string,
  backend: BackendType,
  vmk: Buffer,
): VaultEnvelope {
  const now = new Date().toISOString();
  const entries: VaultEntry[] = [];
  const hmac = computeEnvelopeHmac(vmk, entries);
  return {
    version: 1,
    metadata: {
      backend,
      createdAt: now,
      lastModifiedAt: now,
      vmkVersion: 1,
      entryCount: 0,
    },
    sealedVmk,
    entries,
    hmac,
  };
}

/** Update envelope metadata after a mutation. */
export function touchEnvelope(envelope: VaultEnvelope, vmk: Buffer): VaultEnvelope {
  return {
    ...envelope,
    metadata: {
      ...envelope.metadata,
      lastModifiedAt: new Date().toISOString(),
      entryCount: envelope.entries.length,
    },
    hmac: computeEnvelopeHmac(vmk, envelope.entries),
  };
}
