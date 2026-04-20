import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseBlueprint } from "../../src/blueprint/parse.js";

describe("blueprint parser", () => {
  it("parses a minimal blueprint", () => {
    const text = readFileSync(new URL("./fixtures/minimal.yaml", import.meta.url), "utf-8");
    const bp = parseBlueprint(text);
    expect(bp.version).toBe(1);
    expect(bp.authKeys).toHaveLength(1);
    expect(bp.authKeys[0]?.id).toBe(2);
    expect(bp.authKeys[0]?.capabilities).toContain("sign-ecdsa");
    expect(bp.authKeys[0]?.delegatedCapabilities).toContain("generate-asymmetric-key");
    expect(bp.domains.get(1)?.label).toBe("core-sign");
    expect(bp.policies.audit.permanent_force_audit).toBe(true);
  });

  it("rejects unknown capability strings", () => {
    expect(() =>
      parseBlueprint(`
version: 1
device: { min_firmware: "2.4.0" }
domains: { 1: { label: "x", purpose: "y" } }
auth_keys:
  - id: 2
    role: admin
    domains: [1]
    capabilities: [not-a-real-cap]
    credential_ref: cred:x
wrap_keys: []
policies:
  audit: { drain_every: "30s", permanent_force_audit: true }
  sessions: { pool_size: 4, idle_timeout: "60s" }
`),
    ).toThrow(/capability/);
  });

  it("parses the repo-root reference blueprint", () => {
    const ref = readFileSync(new URL("../../../../hsm-blueprint.yaml", import.meta.url), "utf-8");
    const bp = parseBlueprint(ref);
    expect(bp.authKeys.length).toBe(3);
    expect(bp.authKeys.find((k) => k.role === "admin")).toBeDefined();
    expect(bp.wrapKeys.length).toBe(1);
  });

  it("rejects malformed durations", () => {
    expect(() =>
      parseBlueprint(`
version: 1
device: { min_firmware: "2.4.0" }
domains: { 1: { label: "x", purpose: "y" } }
auth_keys:
  - id: 2
    role: admin
    domains: [1]
    capabilities: [sign-ecdsa]
    credential_ref: cred:x
wrap_keys: []
policies:
  audit: { drain_every: "forever", permanent_force_audit: true }
  sessions: { pool_size: 4, idle_timeout: "60s" }
`),
    ).toThrow();
  });
});
