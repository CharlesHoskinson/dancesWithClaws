import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { generateVmk, sealVmkWithPassphrase } from "../../src/crypto/key-hierarchy.js";
import * as vaultEntries from "../../src/vault/vault-entries.js";
import * as vaultLock from "../../src/vault/vault-lock.js";
import * as vaultStore from "../../src/vault/vault-store.js";

describe("tee-cli", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "tee-cli-test-"));
  });

  afterEach(async () => {
    vaultLock.lock();
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("vault init creates a vault file", async () => {
    const vmk = generateVmk();
    const passphrase = "test-pass";
    const sealed = await sealVmkWithPassphrase(vmk, passphrase);
    const envelope = vaultStore.createEmptyEnvelope(
      sealed.toString("base64"),
      "openssl-pbkdf2",
      vmk,
    );
    await vaultStore.writeVault(tmpDir, envelope);

    expect(await vaultStore.vaultExists(tmpDir)).toBe(true);
    const read = await vaultStore.readVault(tmpDir);
    expect(read.metadata.backend).toBe("openssl-pbkdf2");
    expect(read.metadata.entryCount).toBe(0);
  });

  it("full lifecycle: init -> unlock -> store -> list -> export -> lock", async () => {
    // Init
    const vmk = generateVmk();
    const passphrase = "test-pass";
    const sealed = await sealVmkWithPassphrase(vmk, passphrase);
    let envelope = vaultStore.createEmptyEnvelope(sealed.toString("base64"), "openssl-pbkdf2", vmk);
    await vaultStore.writeVault(tmpDir, envelope);

    // Unlock
    vaultLock.unlock(vmk, "openssl-pbkdf2");
    expect(vaultLock.isUnlocked()).toBe(true);

    // Store
    envelope = await vaultStore.readVault(tmpDir);
    const { envelope: updated } = await vaultEntries.addEntry(envelope, vmk, {
      label: "test-secret",
      type: "secret",
      value: Buffer.from("my-value-123"),
      tags: ["test"],
    });
    await vaultStore.writeVault(tmpDir, updated);

    // List
    const list = vaultEntries.listEntries(updated);
    expect(list.length).toBe(1);
    expect(list[0].label).toBe("test-secret");
    expect(list[0].type).toBe("secret");

    // Export (retrieve)
    const { value } = await vaultEntries.retrieveEntry(updated, vmk, "test-secret");
    expect(value.toString("utf8")).toBe("my-value-123");

    // Lock
    vaultLock.lock();
    expect(vaultLock.isUnlocked()).toBe(false);
    expect(() => vaultLock.getVmk()).toThrow("locked");
  });

  it("vault lock zeros VMK from memory", async () => {
    const vmk = generateVmk();
    vaultLock.unlock(vmk, "openssl-pbkdf2");

    const vmkRef = vaultLock.getVmk();
    expect(vmkRef.every((b) => b === 0)).toBe(false);

    vaultLock.lock();
    // After lock, the internal VMK buffer should be zeroed
    // (vmkRef was a reference to the internal buffer)
    expect(vmkRef.every((b) => b === 0)).toBe(true);
  });
});
