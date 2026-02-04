/**
 * Tests for Windows Credential Manager integration.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("credential-manager", () => {
  it("CREDENTIAL_TARGETS has expected keys", async () => {
    const { CREDENTIAL_TARGETS } = await import("../../src/integrations/credential-manager.js");
    expect(CREDENTIAL_TARGETS.hsmPin).toBe("TeeVault-YubiHSM-PIN");
    expect(CREDENTIAL_TARGETS.openbaoToken).toBe("TeeVault-OpenBao-Token");
    expect(CREDENTIAL_TARGETS.openbaoUnsealPin).toBe("TeeVault-OpenBao-UnsealPIN");
    expect(CREDENTIAL_TARGETS.hsmAdmin).toBe("TeeVault-YubiHSM-Admin");
    expect(CREDENTIAL_TARGETS.hsmSshSigner).toBe("TeeVault-YubiHSM-SSHSigner");
    expect(CREDENTIAL_TARGETS.hsmDbCrypto).toBe("TeeVault-YubiHSM-DBCrypto");
    expect(CREDENTIAL_TARGETS.hsmBackup).toBe("TeeVault-YubiHSM-Backup");
  });

  describe("resolveHsmPin (env var path, no PowerShell)", () => {
    let origPin: string | undefined;
    let origVault: string | undefined;

    beforeEach(() => {
      origPin = process.env.YUBIHSM_PIN;
      origVault = process.env.VAULT_HSM_PIN;
    });

    afterEach(() => {
      if (origPin === undefined) {
        delete process.env.YUBIHSM_PIN;
      } else {
        process.env.YUBIHSM_PIN = origPin;
      }
      if (origVault === undefined) {
        delete process.env.VAULT_HSM_PIN;
      } else {
        process.env.VAULT_HSM_PIN = origVault;
      }
    });

    it("returns YUBIHSM_PIN when set", async () => {
      // Set the env var so resolveHsmPin returns before trying Credential Manager
      process.env.YUBIHSM_PIN = "test-pin-from-env";
      // On Windows, retrieveCredential will actually call PowerShell.
      // But if it returns null (credential not found), the function falls to env.
      // To avoid the PowerShell delay, we test the env var path directly.
      const { resolveHsmPin } = await import("../../src/integrations/credential-manager.js");

      // resolveHsmPin tries: 1) Credential Manager, 2) env, 3) prompt
      // On Windows, step 1 runs PowerShell but should return null quickly if no cred stored.
      // If this takes too long, the test needs mocking — but env var should win after step 1.
      const pin = await resolveHsmPin();
      expect(pin).toBe("test-pin-from-env");
    }, 30_000);

    it("uses promptFn when no env var and no credential", async () => {
      delete process.env.YUBIHSM_PIN;
      delete process.env.VAULT_HSM_PIN;
      const { resolveHsmPin } = await import("../../src/integrations/credential-manager.js");
      const promptFn = vi.fn().mockResolvedValue("prompted-pin");
      const pin = await resolveHsmPin(promptFn);
      expect(pin).toBe("prompted-pin");
      expect(promptFn).toHaveBeenCalledWith("Enter YubiHSM PIN: ");
    }, 30_000);

    it("throws when no source available and no promptFn", async () => {
      delete process.env.YUBIHSM_PIN;
      delete process.env.VAULT_HSM_PIN;
      const { resolveHsmPin } = await import("../../src/integrations/credential-manager.js");
      await expect(resolveHsmPin()).rejects.toThrow("YubiHSM PIN not found");
    }, 30_000);
  });

  describe("resolveOpenbaoToken (env var path)", () => {
    let origToken: string | undefined;
    let origBao: string | undefined;

    beforeEach(() => {
      origToken = process.env.VAULT_TOKEN;
      origBao = process.env.BAO_TOKEN;
    });

    afterEach(() => {
      if (origToken === undefined) {
        delete process.env.VAULT_TOKEN;
      } else {
        process.env.VAULT_TOKEN = origToken;
      }
      if (origBao === undefined) {
        delete process.env.BAO_TOKEN;
      } else {
        process.env.BAO_TOKEN = origBao;
      }
    });

    it("returns VAULT_TOKEN when set", async () => {
      process.env.VAULT_TOKEN = "hvs.test-token";
      const { resolveOpenbaoToken } = await import("../../src/integrations/credential-manager.js");
      const token = await resolveOpenbaoToken();
      expect(token).toBe("hvs.test-token");
    }, 30_000);

    it("throws when no source available and no promptFn", async () => {
      delete process.env.VAULT_TOKEN;
      delete process.env.BAO_TOKEN;
      const { resolveOpenbaoToken } = await import("../../src/integrations/credential-manager.js");
      await expect(resolveOpenbaoToken()).rejects.toThrow("OpenBao token not found");
    }, 30_000);
  });

  describe("platform guards", () => {
    it("storeCredential rejects on non-Windows", async () => {
      const origPlatform = Object.getOwnPropertyDescriptor(process, "platform");
      Object.defineProperty(process, "platform", {
        value: "linux",
        configurable: true,
      });
      try {
        const { storeCredential } = await import("../../src/integrations/credential-manager.js");
        await expect(storeCredential("hsmPin", "user", "pass")).rejects.toThrow(
          "Credential Manager requires Windows",
        );
      } finally {
        if (origPlatform) {
          Object.defineProperty(process, "platform", origPlatform);
        }
      }
    });

    it("retrieveCredential returns null on non-Windows", async () => {
      const origPlatform = Object.getOwnPropertyDescriptor(process, "platform");
      Object.defineProperty(process, "platform", {
        value: "linux",
        configurable: true,
      });
      try {
        const { retrieveCredential } = await import("../../src/integrations/credential-manager.js");
        const result = await retrieveCredential("hsmPin");
        expect(result).toBeNull();
      } finally {
        if (origPlatform) {
          Object.defineProperty(process, "platform", origPlatform);
        }
      }
    });

    it("listCredentials returns empty on non-Windows", async () => {
      const origPlatform = Object.getOwnPropertyDescriptor(process, "platform");
      Object.defineProperty(process, "platform", {
        value: "linux",
        configurable: true,
      });
      try {
        const { listCredentials } = await import("../../src/integrations/credential-manager.js");
        const result = await listCredentials();
        expect(result).toEqual([]);
      } finally {
        if (origPlatform) {
          Object.defineProperty(process, "platform", origPlatform);
        }
      }
    });
  });
});
