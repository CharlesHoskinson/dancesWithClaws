import { describe, it, expect } from "vitest";
import {
  generateVmk,
  deriveEntryKey,
  aesGcmEncrypt,
  aesGcmDecrypt,
  computeHmac,
  verifyHmac,
  zeroBuffer,
  sealVmkWithPassphrase,
  unsealVmkWithPassphrase,
} from "../../src/crypto/key-hierarchy.js";

describe("key-hierarchy", () => {
  describe("generateVmk", () => {
    it("generates a 32-byte random key", () => {
      const vmk = generateVmk();
      expect(vmk).toBeInstanceOf(Buffer);
      expect(vmk.length).toBe(32);
    });

    it("generates unique keys each time", () => {
      const a = generateVmk();
      const b = generateVmk();
      expect(a.equals(b)).toBe(false);
    });
  });

  describe("deriveEntryKey", () => {
    it("derives a 32-byte key from VMK + entry ID + version", async () => {
      const vmk = generateVmk();
      const eek = await deriveEntryKey(vmk, "entry-1", 1);
      expect(eek).toBeInstanceOf(Buffer);
      expect(eek.length).toBe(32);
    });

    it("produces different keys for different entry IDs", async () => {
      const vmk = generateVmk();
      const a = await deriveEntryKey(vmk, "entry-1", 1);
      const b = await deriveEntryKey(vmk, "entry-2", 1);
      expect(a.equals(b)).toBe(false);
    });

    it("produces different keys for different versions", async () => {
      const vmk = generateVmk();
      const a = await deriveEntryKey(vmk, "entry-1", 1);
      const b = await deriveEntryKey(vmk, "entry-1", 2);
      expect(a.equals(b)).toBe(false);
    });

    it("is deterministic for same inputs", async () => {
      const vmk = generateVmk();
      const a = await deriveEntryKey(vmk, "entry-1", 1);
      const b = await deriveEntryKey(vmk, "entry-1", 1);
      expect(a.equals(b)).toBe(true);
    });
  });

  describe("AES-256-GCM", () => {
    it("encrypts and decrypts roundtrip", () => {
      const key = generateVmk();
      const plaintext = Buffer.from("hello secret world", "utf8");
      const { iv, ciphertext, authTag } = aesGcmEncrypt(key, plaintext);

      expect(ciphertext.equals(plaintext)).toBe(false);
      expect(iv.length).toBe(12);
      expect(authTag.length).toBe(16);

      const decrypted = aesGcmDecrypt(key, iv, ciphertext, authTag);
      expect(decrypted.toString("utf8")).toBe("hello secret world");
    });

    it("fails with wrong key", () => {
      const key1 = generateVmk();
      const key2 = generateVmk();
      const { iv, ciphertext, authTag } = aesGcmEncrypt(key1, Buffer.from("test"));

      expect(() => aesGcmDecrypt(key2, iv, ciphertext, authTag)).toThrow();
    });

    it("fails with tampered ciphertext", () => {
      const key = generateVmk();
      const { iv, ciphertext, authTag } = aesGcmEncrypt(key, Buffer.from("test"));

      ciphertext[0] ^= 0xff;
      expect(() => aesGcmDecrypt(key, iv, ciphertext, authTag)).toThrow();
    });

    it("fails with tampered auth tag", () => {
      const key = generateVmk();
      const { iv, ciphertext, authTag } = aesGcmEncrypt(key, Buffer.from("test"));

      authTag[0] ^= 0xff;
      expect(() => aesGcmDecrypt(key, iv, ciphertext, authTag)).toThrow();
    });
  });

  describe("HMAC-SHA256", () => {
    it("computes and verifies correctly", () => {
      const key = generateVmk();
      const data = Buffer.from("some data to authenticate");
      const hmac = computeHmac(key, data);
      expect(hmac.length).toBe(32);
      expect(verifyHmac(key, data, hmac)).toBe(true);
    });

    it("fails with wrong data", () => {
      const key = generateVmk();
      const hmac = computeHmac(key, Buffer.from("data1"));
      expect(verifyHmac(key, Buffer.from("data2"), hmac)).toBe(false);
    });

    it("fails with wrong key", () => {
      const key1 = generateVmk();
      const key2 = generateVmk();
      const hmac = computeHmac(key1, Buffer.from("data"));
      expect(verifyHmac(key2, Buffer.from("data"), hmac)).toBe(false);
    });
  });

  describe("zeroBuffer", () => {
    it("fills buffer with zeros", () => {
      const buf = Buffer.from("sensitive data here");
      zeroBuffer(buf);
      expect(buf.every((b) => b === 0)).toBe(true);
    });
  });

  describe("passphrase sealing", () => {
    it("seals and unseals VMK roundtrip", async () => {
      const vmk = generateVmk();
      const sealed = await sealVmkWithPassphrase(vmk, "test-passphrase");

      expect(sealed.length).toBeGreaterThan(32);
      expect(sealed.equals(vmk)).toBe(false);

      const unsealed = await unsealVmkWithPassphrase(sealed, "test-passphrase");
      expect(unsealed.equals(vmk)).toBe(true);
    });

    it("fails with wrong passphrase", async () => {
      const vmk = generateVmk();
      const sealed = await sealVmkWithPassphrase(vmk, "correct");
      await expect(unsealVmkWithPassphrase(sealed, "wrong")).rejects.toThrow();
    });
  });
});
