import { describe, expect, it, vi } from "vitest";
import { hexFlagResolver } from "../../src/credential-resolver/hex-flag.js";

const ENC = "40".repeat(16);
const MAC = "41".repeat(16);

describe("hexFlagResolver", () => {
  it("returns keys when both hex values are set", async () => {
    const r = hexFlagResolver({ encHex: ENC, macHex: MAC });
    const hit = await r.resolve("admin", 1);
    expect(hit).not.toBeNull();
    expect(hit?.encKey.length).toBe(16);
    expect(hit?.macKey.length).toBe(16);
    expect(Array.from(hit?.encKey ?? [])).toEqual(Array.from({ length: 16 }, () => 0x40));
    expect(Array.from(hit?.macKey ?? [])).toEqual(Array.from({ length: 16 }, () => 0x41));
  });

  it("returns null when encHex is missing", async () => {
    const r = hexFlagResolver({ macHex: MAC });
    expect(await r.resolve("admin", 1)).toBeNull();
  });

  it("returns null when macHex is missing", async () => {
    const r = hexFlagResolver({ encHex: ENC });
    expect(await r.resolve("admin", 1)).toBeNull();
  });

  it("returns null when both missing", async () => {
    const r = hexFlagResolver({});
    expect(await r.resolve("admin", 1)).toBeNull();
  });

  it("throws on malformed enc hex", async () => {
    const r = hexFlagResolver({ encHex: "not-hex", macHex: MAC });
    await expect(r.resolve("admin", 1)).rejects.toThrow(/32 hex chars/);
  });

  it("throws on malformed mac hex", async () => {
    const r = hexFlagResolver({ encHex: ENC, macHex: "zz".repeat(16) });
    await expect(r.resolve("admin", 1)).rejects.toThrow(/32 hex chars/);
  });

  it("respects roleBinding — answers for the bound role only", async () => {
    const r = hexFlagResolver({ encHex: ENC, macHex: MAC, roleBinding: "admin" });
    expect(await r.resolve("admin", 1)).not.toBeNull();
    expect(await r.resolve("ssh-signer", 2)).toBeNull();
  });

  it("describe() includes role binding when set", () => {
    expect(hexFlagResolver({}).describe()).toBe("hex-flag");
    expect(hexFlagResolver({ roleBinding: "admin" }).describe()).toBe("hex-flag(admin)");
  });

  it("exposes write() only when both hex flags are set", () => {
    expect(typeof hexFlagResolver({}).write).toBe("undefined");
    expect(typeof hexFlagResolver({ encHex: ENC }).write).toBe("undefined");
    expect(typeof hexFlagResolver({ macHex: MAC }).write).toBe("undefined");
    expect(typeof hexFlagResolver({ encHex: ENC, macHex: MAC }).write).toBe("function");
  });

  it("write() is a no-op but warns the operator that hex flags are transient", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const r = hexFlagResolver({ encHex: ENC, macHex: MAC });
      expect(typeof r.write).toBe("function");
      const encKey = new Uint8Array(16).fill(0x11);
      const macKey = new Uint8Array(16).fill(0x22);
      await r.write!("admin", 1, { encKey, macKey });
      expect(warn).toHaveBeenCalledTimes(1);
      const msg = String(warn.mock.calls[0]?.[0] ?? "");
      expect(msg).toMatch(/hex-flag resolver/);
      expect(msg).toMatch(/refusing to rotate key for admin/);
      expect(msg).toMatch(/--creds-file/);
    } finally {
      warn.mockRestore();
    }
  });
});
