import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { jsonFileResolver, roleToTarget } from "../../src/credential-resolver/json-file.js";

const ENC = "40".repeat(16);
const MAC = "41".repeat(16);

describe("jsonFileResolver", () => {
  let dir: string;
  let path: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "cred-resolver-json-"));
    path = join(dir, "creds.json");
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("reads enc/mac for the admin role when present", async () => {
    writeFileSync(path, JSON.stringify({ "TeeVault-YubiHSM-Admin": { enc: ENC, mac: MAC } }));
    const r = jsonFileResolver(path);
    const hit = await r.resolve("admin", 1);
    expect(hit).not.toBeNull();
    expect(hit?.encKey[0]).toBe(0x40);
    expect(hit?.macKey[0]).toBe(0x41);
  });

  it("returns null when the role is not in the file", async () => {
    writeFileSync(path, JSON.stringify({ "TeeVault-YubiHSM-Admin": { enc: ENC, mac: MAC } }));
    const r = jsonFileResolver(path);
    expect(await r.resolve("ssh-signer", 2)).toBeNull();
  });

  it("returns null when the file does not exist", async () => {
    const missing = join(dir, "nope.json");
    const r = jsonFileResolver(missing);
    expect(await r.resolve("admin", 1)).toBeNull();
  });

  it("returns null for unknown roles (no target mapping)", async () => {
    writeFileSync(path, JSON.stringify({}));
    const r = jsonFileResolver(path);
    expect(await r.resolve("mystery-role", 7)).toBeNull();
  });

  it("throws when the hex values are malformed", async () => {
    writeFileSync(path, JSON.stringify({ "TeeVault-YubiHSM-Admin": { enc: "not-hex", mac: MAC } }));
    const r = jsonFileResolver(path);
    await expect(r.resolve("admin", 1)).rejects.toThrow(/32 hex chars/);
  });

  it("roleToTarget exposes the mapping used by the resolver", () => {
    expect(roleToTarget("admin")).toBe("TeeVault-YubiHSM-Admin");
    expect(roleToTarget("ssh-signer")).toBe("TeeVault-YubiHSM-SSHSigner");
    expect(roleToTarget("unknown")).toBeUndefined();
  });

  it("describe() returns json-file(path)", () => {
    expect(jsonFileResolver("/some/path").describe()).toBe("json-file(/some/path)");
  });
});
