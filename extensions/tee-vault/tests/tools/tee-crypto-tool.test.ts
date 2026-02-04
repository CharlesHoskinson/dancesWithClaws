import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { generateVmk, sealVmkWithPassphrase } from "../../src/crypto/key-hierarchy.js";
import { createTeeCryptoTool } from "../../src/tools/tee-crypto-tool.js";
import { createVaultStoreTool } from "../../src/tools/tee-vault-tool.js";
import * as vaultLock from "../../src/vault/vault-lock.js";
import * as vaultStore from "../../src/vault/vault-store.js";

const mockApi = {
  id: "tee-vault",
  name: "TEE Vault",
  source: "test",
  config: {},
  logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
} as any;

describe("tee-crypto-tool", () => {
  let tmpDir: string;
  let vmk: Buffer;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "tee-crypto-tool-test-"));
    vmk = generateVmk();
    const sealed = await sealVmkWithPassphrase(vmk, "test");
    const envelope = vaultStore.createEmptyEnvelope(
      sealed.toString("base64"),
      "openssl-pbkdf2",
      vmk,
    );
    await vaultStore.writeVault(tmpDir, envelope);
    vaultLock.unlock(vmk, "openssl-pbkdf2");

    // Add an entry to encrypt against
    const storeTool = createVaultStoreTool(mockApi, tmpDir);
    await storeTool.execute("setup", {
      label: "crypto-key",
      type: "secret",
      value: "the-secret-key",
    });
  });

  afterEach(async () => {
    vaultLock.lock();
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("encrypts and decrypts data roundtrip", async () => {
    const tool = createTeeCryptoTool(mockApi, tmpDir);

    // Encrypt
    const plaintext = Buffer.from("hello encrypted world").toString("base64");
    const encResult = await tool.execute("enc", {
      operation: "encrypt",
      label: "crypto-key",
      data: plaintext,
    });
    const encParsed = JSON.parse(encResult.content[0].text);
    expect(encParsed.iv).toBeTruthy();
    expect(encParsed.ciphertext).toBeTruthy();
    expect(encParsed.authTag).toBeTruthy();

    // Decrypt
    const encJson = JSON.stringify(encParsed);
    const decResult = await tool.execute("dec", {
      operation: "decrypt",
      label: "crypto-key",
      data: Buffer.from(encJson).toString("base64"),
    });
    const decParsed = JSON.parse(decResult.content[0].text);
    const recovered = Buffer.from(decParsed.plaintext, "base64").toString("utf8");
    expect(recovered).toBe("hello encrypted world");
  });

  it("rejects when vault is locked", async () => {
    vaultLock.lock();
    const tool = createTeeCryptoTool(mockApi, tmpDir);
    await expect(
      tool.execute("test", {
        operation: "encrypt",
        label: "x",
        data: "dGVzdA==",
      }),
    ).rejects.toThrow("locked");
  });
});
