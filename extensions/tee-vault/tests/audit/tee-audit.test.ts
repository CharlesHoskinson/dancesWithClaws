import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { collectTeeVaultFindings, appendAuditLog } from "../../src/audit/tee-audit.js";
import { generateVmk, sealVmkWithPassphrase } from "../../src/crypto/key-hierarchy.js";
import * as vaultLock from "../../src/vault/vault-lock.js";
import * as vaultStore from "../../src/vault/vault-store.js";

describe("tee-audit", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "tee-audit-test-"));
  });

  afterEach(async () => {
    vaultLock.lock();
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  describe("collectTeeVaultFindings", () => {
    it("reports vault_not_initialized when no vault exists", async () => {
      const findings = await collectTeeVaultFindings(tmpDir);
      expect(findings.length).toBeGreaterThan(0);
      expect(findings.some((f) => f.checkId === "tee.vault_not_initialized")).toBe(true);
    });

    it("reports backend_weak for openssl-pbkdf2 on Windows", async () => {
      const vmk = generateVmk();
      const sealed = await sealVmkWithPassphrase(vmk, "test");
      const envelope = vaultStore.createEmptyEnvelope(
        sealed.toString("base64"),
        "openssl-pbkdf2",
        vmk,
      );
      await vaultStore.writeVault(tmpDir, envelope);

      const findings = await collectTeeVaultFindings(tmpDir);
      if (process.platform === "win32") {
        expect(findings.some((f) => f.checkId === "tee.vault_backend_weak")).toBe(true);
      }
    });

    it("reports no_auto_lock when timeout is 0", async () => {
      const vmk = generateVmk();
      const sealed = await sealVmkWithPassphrase(vmk, "test");
      const envelope = vaultStore.createEmptyEnvelope(
        sealed.toString("base64"),
        "openssl-pbkdf2",
        vmk,
      );
      await vaultStore.writeVault(tmpDir, envelope);

      vaultLock.setAutoLockTimeout(0);
      vaultLock.unlock(vmk, "openssl-pbkdf2");

      const findings = await collectTeeVaultFindings(tmpDir);
      expect(findings.some((f) => f.checkId === "tee.vault_no_auto_lock")).toBe(true);
    });

    it("reports yubihsm_default_pin", async () => {
      const vmk = generateVmk();
      const envelope = vaultStore.createEmptyEnvelope("sealed", "yubihsm", vmk);
      await vaultStore.writeVault(tmpDir, envelope);

      const findings = await collectTeeVaultFindings(tmpDir, {
        checkYubiHsm: true,
        yubiHsmConfig: {
          authKeyId: "0001",
          connectorUrl: "http://localhost:12345",
        },
      });
      expect(findings.some((f) => f.checkId === "tee.yubihsm_default_pin")).toBe(true);
    });

    it("reports yubihsm_connector_remote", async () => {
      const vmk = generateVmk();
      const envelope = vaultStore.createEmptyEnvelope("sealed", "yubihsm", vmk);
      await vaultStore.writeVault(tmpDir, envelope);

      const findings = await collectTeeVaultFindings(tmpDir, {
        checkYubiHsm: true,
        yubiHsmConfig: { connectorUrl: "http://192.168.1.100:12345" },
      });
      expect(findings.some((f) => f.checkId === "tee.yubihsm_connector_remote")).toBe(true);
    });
  });

  describe("appendAuditLog", () => {
    it("appends JSONL entries to the audit log", async () => {
      await appendAuditLog(tmpDir, {
        timestamp: "2026-01-01T00:00:00Z",
        action: "store",
        entryLabel: "test-key",
        entryType: "secret",
        tool: "vault_store",
        success: true,
      });

      await appendAuditLog(tmpDir, {
        timestamp: "2026-01-01T00:01:00Z",
        action: "retrieve",
        entryLabel: "test-key",
        tool: "vault_retrieve",
        success: true,
      });

      const logPath = path.join(tmpDir, "tee-vault", "audit.jsonl");
      const content = await fs.readFile(logPath, "utf8");
      const lines = content.trim().split("\n");
      expect(lines.length).toBe(2);

      const entry1 = JSON.parse(lines[0]);
      expect(entry1.action).toBe("store");
      expect(entry1.entryLabel).toBe("test-key");
      expect(entry1.success).toBe(true);

      const entry2 = JSON.parse(lines[1]);
      expect(entry2.action).toBe("retrieve");
    });
  });
});
