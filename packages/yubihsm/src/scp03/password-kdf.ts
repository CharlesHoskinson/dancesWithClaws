import { pbkdf2Sync } from "node:crypto";

const SALT = "Yubico";
const ITERATIONS = 10_000;
const KEY_LEN = 32;
const HALF_LEN = 16;

export interface DerivedPasswordKeys {
  readonly encKey: Uint8Array;
  readonly macKey: Uint8Array;
}

/**
 * Derives the SCP03 enc/mac key pair from an ASCII password using the
 * YubiHSM2 factory recipe: PBKDF2-HMAC-SHA256(password, "Yubico", 10_000, 32).
 * The 32-byte output splits into encKey = first 16 bytes, macKey = last 16.
 *
 * Matches the keys burned into a factory-fresh device when its default
 * password is "password"; this is how `yubihsm-shell connect` authenticates
 * against a device that has never been rotated.
 */
export function derivePasswordKeys(password: string): DerivedPasswordKeys {
  if (password.length === 0) {
    throw new Error("password must be non-empty");
  }
  const out = pbkdf2Sync(password, SALT, ITERATIONS, KEY_LEN, "sha256");
  return {
    encKey: new Uint8Array(out.subarray(0, HALF_LEN)),
    macKey: new Uint8Array(out.subarray(HALF_LEN, KEY_LEN)),
  };
}
