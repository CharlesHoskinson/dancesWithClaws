import { afterEach, describe, expect, it, vi } from "vitest";
import {
  _setCredentialManagerImport,
  credentialManagerResolver,
} from "../../src/credential-resolver/credential-manager.js";

const ENC = "40".repeat(16);
const MAC = "41".repeat(16);
const FULL = ENC + MAC;

describe("credentialManagerResolver", () => {
  afterEach(() => {
    _setCredentialManagerImport(undefined);
  });

  it("calls retrieveCredential with the hsmAdmin target and parses hex", async () => {
    const retrieveCredential = vi.fn(async (_target: string) => ({
      username: "admin",
      password: FULL,
    }));
    _setCredentialManagerImport(async () => ({ retrieveCredential }));

    const r = credentialManagerResolver();
    const hit = await r.resolve("admin", 1);
    expect(retrieveCredential).toHaveBeenCalledWith("hsmAdmin");
    expect(hit?.encKey[0]).toBe(0x40);
    expect(hit?.macKey[0]).toBe(0x41);
  });

  it("maps ssh-signer to hsmSshSigner", async () => {
    const retrieveCredential = vi.fn(async (_target: string) => ({
      username: "x",
      password: FULL,
    }));
    _setCredentialManagerImport(async () => ({ retrieveCredential }));

    const r = credentialManagerResolver();
    await r.resolve("ssh-signer", 2);
    expect(retrieveCredential).toHaveBeenCalledWith("hsmSshSigner");
  });

  it("returns null when the target is missing from the store", async () => {
    const retrieveCredential = vi.fn(async () => null);
    _setCredentialManagerImport(async () => ({ retrieveCredential }));

    const r = credentialManagerResolver();
    expect(await r.resolve("admin", 1)).toBeNull();
  });

  it("returns null when retrieveCredential throws", async () => {
    const retrieveCredential = vi.fn(async () => {
      throw new Error("powershell went sideways");
    });
    _setCredentialManagerImport(async () => ({ retrieveCredential }));

    const r = credentialManagerResolver();
    expect(await r.resolve("admin", 1)).toBeNull();
  });

  it("returns null for roles without a credential-manager mapping", async () => {
    const retrieveCredential = vi.fn(async () => ({ username: "x", password: FULL }));
    _setCredentialManagerImport(async () => ({ retrieveCredential }));

    const r = credentialManagerResolver();
    expect(await r.resolve("something-else", 1)).toBeNull();
    expect(retrieveCredential).not.toHaveBeenCalled();
  });

  it("returns null when stored password is not 64 hex chars", async () => {
    const retrieveCredential = vi.fn(async () => ({
      username: "admin",
      password: "not-hex",
    }));
    _setCredentialManagerImport(async () => ({ retrieveCredential }));

    const r = credentialManagerResolver();
    expect(await r.resolve("admin", 1)).toBeNull();
  });

  it("returns null when the extension module cannot be loaded", async () => {
    _setCredentialManagerImport(async () => {
      throw new Error("non-windows host");
    });
    const r = credentialManagerResolver();
    expect(await r.resolve("admin", 1)).toBeNull();
  });

  it("describe() returns credential-manager(windows)", () => {
    expect(credentialManagerResolver().describe()).toBe("credential-manager(windows)");
  });
});
