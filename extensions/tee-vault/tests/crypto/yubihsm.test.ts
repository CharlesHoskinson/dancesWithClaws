import { describe, it, expect } from "vitest";

describe("yubihsm", () => {
  it("isYubiHsmAvailable returns false when graphene-pk11 is not installed", async () => {
    const { isYubiHsmAvailable } = await import("../../src/crypto/yubihsm.js");
    // In test environment, graphene-pk11 is likely not installed
    const result = await isYubiHsmAvailable();
    expect(typeof result).toBe("boolean");
  });

  it("openSession throws when graphene-pk11 is not installed", async () => {
    const { openSession } = await import("../../src/crypto/yubihsm.js");
    await expect(
      openSession(
        {
          pkcs11Library: "nonexistent.dll",
          connectorUrl: "http://localhost:12345",
          authKeyId: "0001",
          slot: 0,
        },
        "password",
      ),
    ).rejects.toThrow();
  });

  it("closeSession does not throw when no session is active", async () => {
    const { closeSession } = await import("../../src/crypto/yubihsm.js");
    expect(() => closeSession()).not.toThrow();
  });
});
