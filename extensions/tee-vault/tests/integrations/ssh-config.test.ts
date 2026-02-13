/**
 * Tests for SSH PKCS#11 configuration management.
 */

import { describe, it, expect } from "vitest";
import { generateSshConfigBlock, generateMcpSshConfig } from "../../src/integrations/ssh-config.js";

describe("ssh-config", () => {
  describe("generateSshConfigBlock", () => {
    it("generates a basic SSH config block with PKCS#11 provider", () => {
      const block = generateSshConfigBlock({
        hostAlias: "logan",
        hostname: "20.245.79.3",
        user: "hoskinson",
      });
      expect(block).toContain("Host logan");
      expect(block).toContain("HostName 20.245.79.3");
      expect(block).toContain("User hoskinson");
      expect(block).toContain("PKCS11Provider");
      expect(block).toContain("yubihsm_pkcs11.dll");
      // No IdentityFile directive (the comment mentioning it doesn't count)
      expect(block).not.toMatch(/^\s+IdentityFile\s/m);
      expect(block).toContain("# Key is HSM-resident");
    });

    it("includes custom port when not 22", () => {
      const block = generateSshConfigBlock({
        hostAlias: "test",
        hostname: "192.168.1.1",
        user: "root",
        port: 2222,
      });
      expect(block).toContain("Port 2222");
    });

    it("omits port when 22", () => {
      const block = generateSshConfigBlock({
        hostAlias: "test",
        hostname: "192.168.1.1",
        user: "root",
        port: 22,
      });
      expect(block).not.toContain("Port");
    });

    it("uses custom PKCS#11 provider path", () => {
      const block = generateSshConfigBlock({
        hostAlias: "test",
        hostname: "10.0.0.1",
        user: "admin",
        pkcs11Provider: "/usr/lib/pkcs11/yubihsm.so",
      });
      expect(block).toContain("PKCS11Provider /usr/lib/pkcs11/yubihsm.so");
    });

    it("includes extra options", () => {
      const block = generateSshConfigBlock({
        hostAlias: "test",
        hostname: "10.0.0.1",
        user: "admin",
        extraOptions: {
          ForwardAgent: "yes",
          ServerAliveInterval: "60",
        },
      });
      expect(block).toContain("ForwardAgent yes");
      expect(block).toContain("ServerAliveInterval 60");
    });
  });

  describe("generateMcpSshConfig", () => {
    it("generates MCP SSH config without privateKey", () => {
      const config = generateMcpSshConfig({
        host: "20.245.79.3",
        username: "hoskinson",
      });
      expect(config.type).toBe("stdio");
      expect(config.command).toBe("cmd");
      expect(config.args).toContain("--host");
      expect(config.args).toContain("20.245.79.3");
      expect(config.args).toContain("--username");
      expect(config.args).toContain("hoskinson");
      expect(config.args).not.toContain("--privateKey");
    });

    it("uses default port 22", () => {
      const config = generateMcpSshConfig({
        host: "10.0.0.1",
        username: "user",
      });
      expect(config.args).toContain("22");
    });

    it("uses custom port", () => {
      const config = generateMcpSshConfig({
        host: "10.0.0.1",
        port: 2222,
        username: "user",
      });
      expect(config.args).toContain("2222");
    });
  });
});
