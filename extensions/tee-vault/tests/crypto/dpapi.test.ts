import { describe, it, expect } from "vitest";

// DPAPI tests are platform-specific (Windows only). These tests mock PowerShell.
describe("dpapi", () => {
  it.skipIf(process.platform !== "win32")("protect and unprotect roundtrip", async () => {
    const { dpapiProtect, dpapiUnprotect } = await import("../../src/crypto/dpapi.js");
    const plaintext = Buffer.from("test secret for dpapi");
    const protectedData = await dpapiProtect(plaintext);
    expect(protectedData).toBeInstanceOf(Buffer);
    expect(protectedData.length).toBeGreaterThan(0);
    expect(protectedData.equals(plaintext)).toBe(false);

    const unprotected = await dpapiUnprotect(protectedData);
    expect(unprotected.equals(plaintext)).toBe(true);
  });

  it.skipIf(process.platform !== "win32")("isDpapiAvailable returns boolean", async () => {
    const { isDpapiAvailable } = await import("../../src/crypto/dpapi.js");
    const result = await isDpapiAvailable();
    expect(typeof result).toBe("boolean");
  });

  it.skipIf(process.platform === "win32")(
    "isDpapiAvailable returns false on non-Windows",
    async () => {
      const { isDpapiAvailable } = await import("../../src/crypto/dpapi.js");
      const result = await isDpapiAvailable();
      expect(result).toBe(false);
    },
  );
});
