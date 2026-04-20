import { createSimulator, createStore, storeBackedHandler } from "@dancesWithClaws/yubihsm-sim";
import { describe, expect, it } from "vitest";
import { parseBlueprint } from "../../src/blueprint/parse.js";
import { apply, diff, plan } from "../../src/blueprint/reconcile.js";
import {
  CapSet,
  Capability,
  createHttpTransport,
  domainSetOf,
  openSession,
  type Scp03Session,
} from "../../src/index.js";

const BOOTSTRAP_ENC = new Uint8Array(16).fill(0x40);
const BOOTSTRAP_MAC = new Uint8Array(16).fill(0x41);

// Blueprint used by every drift case: auth key id=2 wants caps
// [generate-asymmetric-key, put-authentication-key], delegated
// [sign-ecdsa], domains [1, 2].
const BLUEPRINT_YAML = `
version: 1
device:
  min_firmware: "2.4.0"
domains:
  1: { label: "core-sign", purpose: "signing" }
auth_keys:
  - id: 0x0002
    role: admin
    domains: [1, 2]
    capabilities: [generate-asymmetric-key, put-authentication-key]
    delegated_capabilities: [sign-ecdsa]
    credential_ref: cred:TeeVault-Admin
wrap_keys: []
policies:
  audit: { drain_every: "30s", permanent_force_audit: true }
  sessions: { pool_size: 4, idle_timeout: "60s" }
`;

interface Harness {
  readonly session: Scp03Session;
  readonly close: () => Promise<void>;
}

async function bootstrap(
  seedTargetCaps: bigint,
  seedTargetDelegated: bigint,
  seedTargetDomains: number,
): Promise<Harness> {
  const store = createStore();
  store.putAuthKey({
    id: 1,
    capabilities: CapSet.of(
      Capability.PutAuthenticationKey,
      Capability.GenerateAsymmetricKey,
      Capability.DeleteAuthenticationKey,
      Capability.DeleteAsymmetricKey,
    ),
    delegatedCapabilities: CapSet.of(
      Capability.PutAuthenticationKey,
      Capability.GenerateAsymmetricKey,
      Capability.SignEcdsa,
      Capability.DeleteAuthenticationKey,
    ),
    domains: domainSetOf(1, 2),
    label: "bootstrap",
    encKey: BOOTSTRAP_ENC,
    macKey: BOOTSTRAP_MAC,
  });
  store.putAuthKey({
    id: 2,
    capabilities: CapSet.fromBigint(seedTargetCaps),
    delegatedCapabilities: CapSet.fromBigint(seedTargetDelegated),
    domains: seedTargetDomains as unknown as ReturnType<typeof domainSetOf>,
    label: "admin",
    encKey: new Uint8Array(16).fill(0xaa),
    macKey: new Uint8Array(16).fill(0xbb),
  });
  const sim = createSimulator(storeBackedHandler(store));
  const port = await sim.start();
  const transport = createHttpTransport({ url: `http://127.0.0.1:${port}` });
  const session = await openSession({
    transport,
    authKeyId: 1,
    authEnc: BOOTSTRAP_ENC,
    authMac: BOOTSTRAP_MAC,
  });
  return {
    session,
    close: async () => {
      await session.close();
      await transport.close();
      await sim.stop();
    },
  };
}

describe("blueprint reconcile drift detection", () => {
  it("detects capability drift and repairs via apply", async () => {
    // Device has only generate-asymmetric-key; blueprint also wants
    // put-authentication-key. One capability missing → one update step.
    const seedCaps = CapSet.of(Capability.GenerateAsymmetricKey);
    const seedDelegated = CapSet.of(Capability.SignEcdsa);
    const seedDomains = domainSetOf(1, 2);
    const h = await bootstrap(seedCaps, seedDelegated, seedDomains);
    try {
      const bp = parseBlueprint(BLUEPRINT_YAML);
      const p = await plan(h.session, bp, { preserveAuthKeyIds: [1] });
      expect(p.create).toHaveLength(0);
      expect(p.update).toHaveLength(1);
      expect(p.update[0]?.id).toBe(2);
      expect(p.update[0]?.kind).toBe("update-auth-key");
      expect(p.delete).toHaveLength(0);

      await apply(h.session, p, { preserveAuthKeyIds: [1] });

      const post = await diff(h.session, bp, { preserveAuthKeyIds: [1] });
      expect(post.create).toHaveLength(0);
      expect(post.update).toHaveLength(0);
      expect(post.delete).toHaveLength(0);
    } finally {
      await h.close();
    }
  });

  it("detects domain drift and repairs via apply", async () => {
    // Blueprint wants domains [1,2]; device has only [1].
    const seedCaps = CapSet.of(Capability.GenerateAsymmetricKey, Capability.PutAuthenticationKey);
    const seedDelegated = CapSet.of(Capability.SignEcdsa);
    const seedDomains = domainSetOf(1);
    const h = await bootstrap(seedCaps, seedDelegated, seedDomains);
    try {
      const bp = parseBlueprint(BLUEPRINT_YAML);
      const p = await plan(h.session, bp, { preserveAuthKeyIds: [1] });
      expect(p.create).toHaveLength(0);
      expect(p.update).toHaveLength(1);
      expect(p.update[0]?.id).toBe(2);
      expect(p.delete).toHaveLength(0);

      await apply(h.session, p, { preserveAuthKeyIds: [1] });
      const post = await diff(h.session, bp, { preserveAuthKeyIds: [1] });
      expect(post.create).toHaveLength(0);
      expect(post.update).toHaveLength(0);
      expect(post.delete).toHaveLength(0);
    } finally {
      await h.close();
    }
  });

  it("detects delegated-capability drift and repairs via apply", async () => {
    // Blueprint wants delegated [sign-ecdsa]; device has [sign-eddsa].
    const seedCaps = CapSet.of(Capability.GenerateAsymmetricKey, Capability.PutAuthenticationKey);
    const seedDelegated = CapSet.of(Capability.SignEddsa);
    const seedDomains = domainSetOf(1, 2);
    const h = await bootstrap(seedCaps, seedDelegated, seedDomains);
    try {
      const bp = parseBlueprint(BLUEPRINT_YAML);
      const p = await plan(h.session, bp, { preserveAuthKeyIds: [1] });
      expect(p.create).toHaveLength(0);
      expect(p.update).toHaveLength(1);
      expect(p.update[0]?.id).toBe(2);
      expect(p.delete).toHaveLength(0);

      await apply(h.session, p, { preserveAuthKeyIds: [1] });
      const post = await diff(h.session, bp, { preserveAuthKeyIds: [1] });
      expect(post.create).toHaveLength(0);
      expect(post.update).toHaveLength(0);
      expect(post.delete).toHaveLength(0);
    } finally {
      await h.close();
    }
  });

  it("plans nothing when device exactly matches blueprint", async () => {
    const seedCaps = CapSet.of(Capability.GenerateAsymmetricKey, Capability.PutAuthenticationKey);
    const seedDelegated = CapSet.of(Capability.SignEcdsa);
    const seedDomains = domainSetOf(1, 2);
    const h = await bootstrap(seedCaps, seedDelegated, seedDomains);
    try {
      const bp = parseBlueprint(BLUEPRINT_YAML);
      const p = await plan(h.session, bp, { preserveAuthKeyIds: [1] });
      expect(p.create).toHaveLength(0);
      expect(p.update).toHaveLength(0);
      expect(p.delete).toHaveLength(0);
    } finally {
      await h.close();
    }
  });

  it("apply is idempotent: a second apply leaves zero delta", async () => {
    const seedCaps = CapSet.of(Capability.GenerateAsymmetricKey);
    const seedDelegated = CapSet.of(Capability.SignEcdsa);
    const seedDomains = domainSetOf(1, 2);
    const h = await bootstrap(seedCaps, seedDelegated, seedDomains);
    try {
      const bp = parseBlueprint(BLUEPRINT_YAML);
      const p1 = await plan(h.session, bp, { preserveAuthKeyIds: [1] });
      await apply(h.session, p1, { preserveAuthKeyIds: [1] });

      const p2 = await plan(h.session, bp, { preserveAuthKeyIds: [1] });
      expect(p2.create).toHaveLength(0);
      expect(p2.update).toHaveLength(0);
      expect(p2.delete).toHaveLength(0);

      // Second apply is a no-op because the plan is empty.
      await apply(h.session, p2, { preserveAuthKeyIds: [1] });
      const p3 = await plan(h.session, bp, { preserveAuthKeyIds: [1] });
      expect(p3.create).toHaveLength(0);
      expect(p3.update).toHaveLength(0);
      expect(p3.delete).toHaveLength(0);
    } finally {
      await h.close();
    }
  });
});
