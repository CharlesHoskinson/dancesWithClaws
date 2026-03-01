import { describe, it, expect } from "vitest";

describe("tpm", () => {
  it.skipIf(process.platform !== "win32")("isTpmAvailable returns boolean", async () => {
    const { isTpmAvailable } = await import("../../src/crypto/tpm.js");
    const result = await isTpmAvailable();
    expect(typeof result).toBe("boolean");
  });

  it.skipIf(process.platform === "win32")(
    "isTpmAvailable returns false on non-Windows",
    async () => {
      const { isTpmAvailable } = await import("../../src/crypto/tpm.js");
      const result = await isTpmAvailable();
      expect(result).toBe(false);
    },
  );
});
