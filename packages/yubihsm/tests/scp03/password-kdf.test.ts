import { describe, expect, it } from "vitest";
import { derivePasswordKeys } from "../../src/scp03/password-kdf.js";

// Known-answer vector for PBKDF2-HMAC-SHA256("password", "Yubico", 10000, 32).
// This is the exact 32-byte output Yubico's libyubihsm derives from the
// factory-default password "password" under salt "Yubico" with 10000 iters.
// First 16 bytes = encKey, last 16 bytes = macKey.
const EXPECTED_FULL_HEX = "090b47dbed595654901dee1cc655e420592fd483f759e29909a04c4505d2ce0a";

function hex(u: Uint8Array): string {
  return Buffer.from(u).toString("hex");
}

describe("derivePasswordKeys", () => {
  it("derives the known-answer factory keys for password='password'", () => {
    const full = Buffer.from(EXPECTED_FULL_HEX, "hex");
    expect(full.length).toBe(32);

    const { encKey, macKey } = derivePasswordKeys("password");
    expect(encKey.length).toBe(16);
    expect(macKey.length).toBe(16);
    expect(hex(encKey)).toBe(full.subarray(0, 16).toString("hex"));
    expect(hex(macKey)).toBe(full.subarray(16, 32).toString("hex"));
  });

  it("throws on empty password", () => {
    expect(() => derivePasswordKeys("")).toThrow(/non-empty/);
  });
});
