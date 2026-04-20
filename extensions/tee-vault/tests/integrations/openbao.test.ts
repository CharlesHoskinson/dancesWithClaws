/**
 * Tests for OpenBao integration.
 */

import { describe, it, expect } from "vitest";
import { generateSealConfig, generateStartupScript } from "../../src/integrations/openbao.js";

describe("openbao", () => {
  describe("generateSealConfig", () => {
    it("generates valid HCL seal stanza", () => {
      const config = generateSealConfig({
        pkcs11Library: "C:\\Program Files\\Yubico\\YubiHSM2\\bin\\yubihsm_pkcs11.dll",
      });
      expect(config).toContain('seal "pkcs11"');
      expect(config).toContain("lib");
      expect(config).toContain("yubihsm_pkcs11.dll");
      expect(config).toContain('slot      = "0"');
      expect(config).toContain('key_label = "openbao-unseal"');
      expect(config).toContain('mechanism = "0x1085"');
      expect(config).toContain("VAULT_HSM_PIN");
    });

    it("uses custom key label", () => {
      const config = generateSealConfig({
        pkcs11Library: "/usr/lib/yubihsm_pkcs11.so",
        keyLabel: "custom-unseal",
      });
      expect(config).toContain('key_label = "custom-unseal"');
    });

    it("uses custom slot", () => {
      const config = generateSealConfig({
        pkcs11Library: "/usr/lib/yubihsm_pkcs11.so",
        slot: 2,
      });
      expect(config).toContain('slot      = "2"');
    });

    it("escapes backslashes in Windows paths", () => {
      const config = generateSealConfig({
        pkcs11Library: "C:\\Program Files\\Yubico\\yubihsm_pkcs11.dll",
      });
      expect(config).toContain("C:\\\\Program Files\\\\Yubico\\\\yubihsm_pkcs11.dll");
    });
  });

  describe("generateStartupScript", () => {
    it("generates a PowerShell script that reads from Credential Manager", () => {
      const script = generateStartupScript({
        openbaoPath: "C:\\openbao\\openbao.exe",
        openbaoConfigPath: "C:\\openbao\\config.hcl",
      });
      expect(script).toContain("CredentialManager");
      expect(script).toContain("Get-StoredCredential");
      expect(script).toContain("VAULT_HSM_PIN");
      expect(script).toContain("TeeVault-OpenBao-UnsealPIN");
      expect(script).toContain("C:\\openbao\\openbao.exe");
      expect(script).toContain("C:\\openbao\\config.hcl");
    });

    it("uses custom credential target", () => {
      const script = generateStartupScript({
        openbaoPath: "openbao.exe",
        openbaoConfigPath: "config.hcl",
        credentialTarget: "Custom-Target",
      });
      expect(script).toContain("Custom-Target");
      expect(script).not.toContain("TeeVault-OpenBao-UnsealPIN");
    });
  });
});
