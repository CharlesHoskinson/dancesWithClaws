import { describe, it, expect } from "vitest";
import { deriveSessionKeys } from "../../src/scp03/kdf.js";

describe("SCP03 KDF (SP 800-108 counter mode with AES-CMAC)", () => {
  const authEnc = new Uint8Array(16).fill(0x40);
  const authMac = new Uint8Array(16).fill(0x41);
  const hostChallenge = new Uint8Array(8).fill(0x10);
  const cardChallenge = new Uint8Array(8).fill(0x20);

  it("derives S-ENC, S-MAC, S-RMAC as distinct 16-byte keys", () => {
    const keys = deriveSessionKeys(authEnc, authMac, hostChallenge, cardChallenge);
    expect(keys.sEnc.length).toBe(16);
    expect(keys.sMac.length).toBe(16);
    expect(keys.sRmac.length).toBe(16);
    expect(Buffer.from(keys.sEnc).equals(Buffer.from(keys.sMac))).toBe(false);
    expect(Buffer.from(keys.sEnc).equals(Buffer.from(keys.sRmac))).toBe(false);
    expect(Buffer.from(keys.sMac).equals(Buffer.from(keys.sRmac))).toBe(false);
  });

  it("is deterministic given the same inputs", () => {
    const a = deriveSessionKeys(authEnc, authMac, hostChallenge, cardChallenge);
    const b = deriveSessionKeys(authEnc, authMac, hostChallenge, cardChallenge);
    expect(Buffer.from(a.sEnc).equals(Buffer.from(b.sEnc))).toBe(true);
    expect(Buffer.from(a.sMac).equals(Buffer.from(b.sMac))).toBe(true);
    expect(Buffer.from(a.sRmac).equals(Buffer.from(b.sRmac))).toBe(true);
  });

  it("changes when the card challenge changes", () => {
    const a = deriveSessionKeys(authEnc, authMac, hostChallenge, cardChallenge);
    const other = new Uint8Array(8).fill(0x21);
    const b = deriveSessionKeys(authEnc, authMac, hostChallenge, other);
    expect(Buffer.from(a.sEnc).equals(Buffer.from(b.sEnc))).toBe(false);
  });

  it("rejects wrong auth-key lengths", () => {
    expect(() =>
      deriveSessionKeys(new Uint8Array(15), authMac, hostChallenge, cardChallenge),
    ).toThrow();
    expect(() =>
      deriveSessionKeys(authEnc, new Uint8Array(17), hostChallenge, cardChallenge),
    ).toThrow();
  });

  it("rejects wrong challenge lengths", () => {
    expect(() => deriveSessionKeys(authEnc, authMac, new Uint8Array(7), cardChallenge)).toThrow();
    expect(() => deriveSessionKeys(authEnc, authMac, hostChallenge, new Uint8Array(9))).toThrow();
  });
});
