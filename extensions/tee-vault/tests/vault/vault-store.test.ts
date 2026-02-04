import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { generateVmk } from "../../src/crypto/key-hierarchy.js";
import {
  vaultExists,
  readVault,
  writeVault,
  createEmptyEnvelope,
  computeEnvelopeHmac,
  verifyEnvelopeHmac,
} from "../../src/vault/vault-store.js";

describe("vault-store", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "tee-vault-test-"));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("vaultExists returns false when no vault file", async () => {
    expect(await vaultExists(tmpDir)).toBe(false);
  });

  it("creates and reads an empty vault", async () => {
    const vmk = generateVmk();
    const envelope = createEmptyEnvelope("sealed-vmk-b64", "openssl-pbkdf2", vmk);

    await writeVault(tmpDir, envelope);
    expect(await vaultExists(tmpDir)).toBe(true);

    const read = await readVault(tmpDir);
    expect(read.version).toBe(1);
    expect(read.metadata.backend).toBe("openssl-pbkdf2");
    expect(read.metadata.entryCount).toBe(0);
    expect(read.entries).toEqual([]);
    expect(read.sealedVmk).toBe("sealed-vmk-b64");
  });

  it("HMAC computation and verification", () => {
    const vmk = generateVmk();
    const envelope = createEmptyEnvelope("test", "dpapi", vmk);

    const hmac = computeEnvelopeHmac(vmk, envelope.entries);
    expect(typeof hmac).toBe("string");
    expect(hmac.length).toBe(64); // hex-encoded 32 bytes

    expect(verifyEnvelopeHmac(vmk, envelope.entries, hmac)).toBe(true);
    expect(verifyEnvelopeHmac(vmk, envelope.entries, "0".repeat(64))).toBe(false);
  });

  it("atomic write creates a valid JSON file", async () => {
    const vmk = generateVmk();
    const envelope = createEmptyEnvelope("test", "dpapi", vmk);
    await writeVault(tmpDir, envelope);

    const raw = await fs.readFile(path.join(tmpDir, "tee-vault", "vault.enc"), "utf8");
    const parsed = JSON.parse(raw);
    expect(parsed.version).toBe(1);
  });
});
