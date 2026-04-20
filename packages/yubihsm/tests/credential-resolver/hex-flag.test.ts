import { describe, expect, it } from "vitest";
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
});
