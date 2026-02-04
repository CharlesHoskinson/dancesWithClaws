import { describe, it, expect, beforeEach } from "vitest";
import type { VaultEnvelope } from "../../src/types.js";
import { generateVmk, zeroBuffer } from "../../src/crypto/key-hierarchy.js";
import {
  addEntry,
  retrieveEntry,
  listEntries,
  deleteEntry,
  rotateEntry,
  rotateAllEntries,
} from "../../src/vault/vault-entries.js";
import { createEmptyEnvelope } from "../../src/vault/vault-store.js";

describe("vault-entries", () => {
  let vmk: Buffer;
  let envelope: VaultEnvelope;

  beforeEach(() => {
    vmk = generateVmk();
    envelope = createEmptyEnvelope("sealed", "openssl-pbkdf2", vmk);
  });

  describe("addEntry", () => {
    it("adds a secret entry", async () => {
      const { envelope: updated, entry } = await addEntry(envelope, vmk, {
        label: "my-secret",
        type: "secret",
        tags: ["production"],
        value: Buffer.from("super-secret-value"),
      });

      expect(entry.label).toBe("my-secret");
      expect(entry.type).toBe("secret");
      expect(entry.tags).toEqual(["production"]);
      expect(entry.version).toBe(1);
      expect(entry.hsmResident).toBe(false);
      expect(entry.iv).toBeTruthy();
      expect(entry.ciphertext).toBeTruthy();
      expect(entry.authTag).toBeTruthy();
      expect(updated.entries.length).toBe(1);
      expect(updated.metadata.entryCount).toBe(1);
    });

    it("rejects duplicate labels", async () => {
      const { envelope: updated } = await addEntry(envelope, vmk, {
        label: "dup",
        type: "secret",
        value: Buffer.from("value1"),
      });
      await expect(
        addEntry(updated, vmk, {
          label: "dup",
          type: "secret",
          value: Buffer.from("value2"),
        }),
      ).rejects.toThrow("already exists");
    });

    it("adds an HSM-resident entry", async () => {
      const { entry } = await addEntry(envelope, vmk, {
        label: "hsm-key",
        type: "ssh_key",
        value: Buffer.alloc(0),
        hsmResident: true,
        hsmObjectId: 42,
      });
      expect(entry.hsmResident).toBe(true);
      expect(entry.hsmObjectId).toBe(42);
      expect(entry.ciphertext).toBeUndefined();
    });
  });

  describe("retrieveEntry", () => {
    it("decrypts and returns the value", async () => {
      const secret = "my-api-key-12345";
      const { envelope: updated } = await addEntry(envelope, vmk, {
        label: "test-key",
        type: "api_token",
        value: Buffer.from(secret),
      });

      const { value } = await retrieveEntry(updated, vmk, "test-key");
      expect(value.toString("utf8")).toBe(secret);
    });

    it("throws for nonexistent entry", async () => {
      await expect(retrieveEntry(envelope, vmk, "nope")).rejects.toThrow("not found");
    });

    it("throws for HSM-resident entries", async () => {
      const { envelope: updated } = await addEntry(envelope, vmk, {
        label: "hsm",
        type: "ssh_key",
        value: Buffer.alloc(0),
        hsmResident: true,
        hsmObjectId: 1,
      });
      await expect(retrieveEntry(updated, vmk, "hsm")).rejects.toThrow("HSM-resident");
    });
  });

  describe("listEntries", () => {
    it("returns metadata without decrypting", async () => {
      let env = envelope;
      ({ envelope: env } = await addEntry(env, vmk, {
        label: "key1",
        type: "secret",
        tags: ["dev"],
        value: Buffer.from("v1"),
      }));
      ({ envelope: env } = await addEntry(env, vmk, {
        label: "key2",
        type: "api_token",
        tags: ["prod"],
        value: Buffer.from("v2"),
      }));

      const all = listEntries(env);
      expect(all.length).toBe(2);
      expect(all[0].label).toBe("key1");
      expect(all[1].label).toBe("key2");

      // Filter by type
      const tokens = listEntries(env, { type: "api_token" });
      expect(tokens.length).toBe(1);
      expect(tokens[0].label).toBe("key2");

      // Filter by tag
      const dev = listEntries(env, { tag: "dev" });
      expect(dev.length).toBe(1);
      expect(dev[0].label).toBe("key1");
    });
  });

  describe("deleteEntry", () => {
    it("removes an entry", async () => {
      const { envelope: updated } = await addEntry(envelope, vmk, {
        label: "to-delete",
        type: "secret",
        value: Buffer.from("gone"),
      });
      expect(updated.entries.length).toBe(1);

      const after = deleteEntry(updated, vmk, "to-delete");
      expect(after.entries.length).toBe(0);
    });

    it("throws for nonexistent entry", () => {
      expect(() => deleteEntry(envelope, vmk, "nope")).toThrow("not found");
    });
  });

  describe("rotateEntry", () => {
    it("re-encrypts with incremented version", async () => {
      const { envelope: env1 } = await addEntry(envelope, vmk, {
        label: "rotate-me",
        type: "secret",
        value: Buffer.from("original"),
      });
      expect(env1.entries[0].version).toBe(1);

      const env2 = await rotateEntry(env1, vmk, "rotate-me");
      expect(env2.entries[0].version).toBe(2);

      // Value should still decrypt correctly
      const { value } = await retrieveEntry(env2, vmk, "rotate-me");
      expect(value.toString("utf8")).toBe("original");
    });
  });

  describe("rotateAllEntries", () => {
    it("re-encrypts all entries with a new VMK", async () => {
      let env = envelope;
      ({ envelope: env } = await addEntry(env, vmk, {
        label: "s1",
        type: "secret",
        value: Buffer.from("val1"),
      }));
      ({ envelope: env } = await addEntry(env, vmk, {
        label: "s2",
        type: "api_token",
        value: Buffer.from("val2"),
      }));

      const newVmk = generateVmk();
      const rotated = await rotateAllEntries(env, vmk, newVmk);

      // Old VMK should NOT decrypt
      await expect(retrieveEntry(rotated, vmk, "s1")).rejects.toThrow();

      // New VMK should decrypt
      const { value: v1 } = await retrieveEntry(rotated, newVmk, "s1");
      expect(v1.toString("utf8")).toBe("val1");

      const { value: v2 } = await retrieveEntry(rotated, newVmk, "s2");
      expect(v2.toString("utf8")).toBe("val2");

      // Versions reset to 1
      expect(rotated.entries[0].version).toBe(1);
      expect(rotated.metadata.vmkVersion).toBe(2);

      zeroBuffer(newVmk);
    });
  });
});
