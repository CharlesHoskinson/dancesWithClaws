import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { generateVmk, sealVmkWithPassphrase } from "../../src/crypto/key-hierarchy.js";
import { createVaultStoreTool, createVaultRetrieveTool } from "../../src/tools/tee-vault-tool.js";
import * as vaultLock from "../../src/vault/vault-lock.js";
import * as vaultStore from "../../src/vault/vault-store.js";

const mockApi = {
  id: "tee-vault",
  name: "TEE Vault",
  source: "test",
  config: {},
  logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
} as unknown;

describe("tee-vault-tool", () => {
  let tmpDir: string;
  let vmk: Buffer;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "tee-vault-tool-test-"));
    vmk = generateVmk();
    const sealed = await sealVmkWithPassphrase(vmk, "test");
    const envelope = vaultStore.createEmptyEnvelope(
      sealed.toString("base64"),
      "openssl-pbkdf2",
      vmk,
    );
    await vaultStore.writeVault(tmpDir, envelope);
    vaultLock.unlock(vmk, "openssl-pbkdf2");
  });

  afterEach(async () => {
    vaultLock.lock();
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  describe("vault_store", () => {
    it("stores a secret and returns metadata", async () => {
      const tool = createVaultStoreTool(mockApi, tmpDir);
      const result = await tool.execute("test-id", {
        label: "my-api-key",
        type: "api_token",
        value: "sk-12345",
        tags: ["openai"],
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.status).toBe("stored");
      expect(parsed.label).toBe("my-api-key");
      expect(parsed.type).toBe("api_token");
    });

    it("rejects when vault is locked", async () => {
      vaultLock.lock();
      const tool = createVaultStoreTool(mockApi, tmpDir);
      await expect(
        tool.execute("test-id", { label: "x", type: "secret", value: "v" }),
      ).rejects.toThrow("locked");
    });
  });

  describe("vault_retrieve", () => {
    it("lists entries (metadata only)", async () => {
      const storeTool = createVaultStoreTool(mockApi, tmpDir);
      await storeTool.execute("1", {
        label: "key1",
        type: "secret",
        value: "val1",
      });
      await storeTool.execute("2", {
        label: "key2",
        type: "api_token",
        value: "val2",
      });

      const retrieveTool = createVaultRetrieveTool(mockApi, tmpDir);
      const result = await retrieveTool.execute("3", { action: "list" });
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.entries.length).toBe(2);
      // List should NOT contain plaintext values
      expect(JSON.stringify(parsed)).not.toContain("val1");
      expect(JSON.stringify(parsed)).not.toContain("val2");
    });

    it("retrieves a decrypted value", async () => {
      const storeTool = createVaultStoreTool(mockApi, tmpDir);
      await storeTool.execute("1", {
        label: "my-key",
        type: "secret",
        value: "secret-123",
      });

      const retrieveTool = createVaultRetrieveTool(mockApi, tmpDir);
      const result = await retrieveTool.execute("2", {
        action: "get",
        label: "my-key",
      });
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.value).toBe("secret-123");
    });

    it("deletes an entry", async () => {
      const storeTool = createVaultStoreTool(mockApi, tmpDir);
      await storeTool.execute("1", {
        label: "temp",
        type: "secret",
        value: "v",
      });

      const retrieveTool = createVaultRetrieveTool(mockApi, tmpDir);
      await retrieveTool.execute("2", { action: "delete", label: "temp" });

      const result = await retrieveTool.execute("3", { action: "list" });
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.entries.length).toBe(0);
    });
  });
});
