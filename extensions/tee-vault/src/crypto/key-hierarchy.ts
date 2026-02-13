/**
 * Key hierarchy management: VMK generation, HKDF derivation, AES-256-GCM.
 *
 * Layer 1: Vault Master Key (VMK) — 256-bit AES key
 * Layer 2: Per-Entry Encryption Keys (EEK) via HKDF-SHA256(VMK, entry_id || version)
 */

import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  hkdf,
  pbkdf2,
  randomBytes,
} from "node:crypto";
import { promisify } from "node:util";
import {
  VMK_KEY_LENGTH,
  GCM_IV_LENGTH,
  GCM_AUTH_TAG_LENGTH,
  HKDF_HASH,
  PBKDF2_ITERATIONS,
  PBKDF2_SALT_LENGTH,
} from "../constants.js";

const hkdfAsync = promisify(hkdf);
const pbkdf2Async = promisify(pbkdf2);

/** Generate a new random 256-bit VMK. */
export function generateVmk(): Buffer {
  return randomBytes(VMK_KEY_LENGTH);
}

/** Derive a per-entry encryption key from VMK using HKDF-SHA256. */
export async function deriveEntryKey(
  vmk: Buffer,
  entryId: string,
  version: number,
): Promise<Buffer> {
  const info = Buffer.from(`${entryId}||${version}`, "utf8");
  const derived = await hkdfAsync(HKDF_HASH, vmk, Buffer.alloc(0), info, VMK_KEY_LENGTH);
  return Buffer.from(derived);
}

/** Encrypt plaintext with AES-256-GCM. */
export function aesGcmEncrypt(
  key: Buffer,
  plaintext: Buffer,
): { iv: Buffer; ciphertext: Buffer; authTag: Buffer } {
  const iv = randomBytes(GCM_IV_LENGTH);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return { iv, ciphertext, authTag };
}

/** Decrypt AES-256-GCM ciphertext. */
export function aesGcmDecrypt(
  key: Buffer,
  iv: Buffer,
  ciphertext: Buffer,
  authTag: Buffer,
): Buffer {
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

/** Compute HMAC-SHA256. */
export function computeHmac(key: Buffer, data: Buffer): Buffer {
  return createHmac("sha256", key).update(data).digest();
}

/** Constant-time HMAC-SHA256 verification. */
export function verifyHmac(key: Buffer, data: Buffer, expected: Buffer): boolean {
  const actual = computeHmac(key, data);
  if (actual.length !== expected.length) {
    return false;
  }
  let diff = 0;
  for (let i = 0; i < actual.length; i++) {
    diff |= (actual[i] ?? 0) ^ (expected[i] ?? 0);
  }
  return diff === 0;
}

/** Zero a buffer to scrub sensitive data from memory. */
export function zeroBuffer(buf: Buffer): void {
  buf.fill(0);
}

/** Derive key from passphrase via PBKDF2 (for openssl-pbkdf2 backend). */
export async function deriveKeyFromPassphrase(
  passphrase: string,
  salt?: Buffer,
): Promise<{ key: Buffer; salt: Buffer }> {
  const actualSalt = salt ?? randomBytes(PBKDF2_SALT_LENGTH);
  const key = await pbkdf2Async(
    passphrase,
    actualSalt,
    PBKDF2_ITERATIONS,
    VMK_KEY_LENGTH,
    "sha256",
  );
  return { key, salt: actualSalt };
}

/**
 * Seal VMK with a passphrase (openssl-pbkdf2 backend).
 * Returns: salt(32) || iv(12) || ciphertext || authTag(16)
 */
export async function sealVmkWithPassphrase(vmk: Buffer, passphrase: string): Promise<Buffer> {
  const { key, salt } = await deriveKeyFromPassphrase(passphrase);
  try {
    const { iv, ciphertext, authTag } = aesGcmEncrypt(key, vmk);
    return Buffer.concat([salt, iv, ciphertext, authTag]);
  } finally {
    zeroBuffer(key);
  }
}

/** Unseal VMK from a passphrase-sealed blob. */
export async function unsealVmkWithPassphrase(sealed: Buffer, passphrase: string): Promise<Buffer> {
  const salt = sealed.subarray(0, PBKDF2_SALT_LENGTH);
  const iv = sealed.subarray(PBKDF2_SALT_LENGTH, PBKDF2_SALT_LENGTH + GCM_IV_LENGTH);
  const authTag = sealed.subarray(sealed.length - GCM_AUTH_TAG_LENGTH);
  const ciphertext = sealed.subarray(
    PBKDF2_SALT_LENGTH + GCM_IV_LENGTH,
    sealed.length - GCM_AUTH_TAG_LENGTH,
  );
  const { key } = await deriveKeyFromPassphrase(passphrase, salt);
  try {
    return aesGcmDecrypt(key, iv, ciphertext, authTag);
  } finally {
    zeroBuffer(key);
  }
}
