import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { generateVmk, sealVmkWithPassphrase } from "../../src/crypto/key-hierarchy.js";
import { isOpensslAvailable } from "../../src/crypto/openssl-bridge.js";
import { createSshKeygenTool } from "../../src/tools/tee-ssh-tool.js";
import * as vaultLock from "../../src/vault/vault-lock.js";
import * as vaultStore from "../../src/vault/vault-store.js";

const mockApi = {
  id: "tee-vault",
  name: "TEE Vault",
  source: "test",
  config: {},
  logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
} as unknown;

describe("tee-ssh-tool", () => {
  let tmpDir: string;
  let vmk: Buffer;
  let opensslOk: boolean;

  beforeEach(async () => {
    opensslOk = await isOpensslAvailable();
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "tee-ssh-tool-test-"));
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

  it.skipIf(!true)("ssh_keygen generates a key and returns public key", async () => {
    if (!opensslOk) {
      return;
    } // Skip if OpenSSL not available

    const tool = createSshKeygenTool(mockApi, tmpDir);
    const result = await tool.execute("test-id", {
      label: "test-ssh-key",
      algorithm: "ed25519",
      comment: "test@example.com",
    });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.status).toBe("generated");
    expect(parsed.label).toBe("test-ssh-key");
    expect(parsed.algorithm).toBe("ed25519");
    expect(parsed.publicKey).toBeTruthy();
  });

  it("rejects when vault is locked", async () => {
    vaultLock.lock();
    const tool = createSshKeygenTool(mockApi, tmpDir);
    await expect(tool.execute("test-id", { label: "x", algorithm: "ed25519" })).rejects.toThrow(
      "locked",
    );
  });
});
