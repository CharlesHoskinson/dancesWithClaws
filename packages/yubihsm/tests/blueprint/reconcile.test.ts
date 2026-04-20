import { readFileSync } from "node:fs";
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
} from "../../src/index.js";

describe("blueprint reconcile against simulator", () => {
  it("plan → apply → diff converges to zero delta", async () => {
    const store = createStore();
    const bootstrapEnc = new Uint8Array(16).fill(0x40);
    const bootstrapMac = new Uint8Array(16).fill(0x41);
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
      ),
      domains: domainSetOf(1),
      label: "bootstrap",
      encKey: bootstrapEnc,
      macKey: bootstrapMac,
    });
    const sim = createSimulator(storeBackedHandler(store));
    const port = await sim.start();
    const transport = createHttpTransport({ url: `http://127.0.0.1:${port}` });
    const session = await openSession({
      transport,
      authKeyId: 1,
      authEnc: bootstrapEnc,
      authMac: bootstrapMac,
    });

    const bp = parseBlueprint(
      readFileSync(new URL("./fixtures/minimal.yaml", import.meta.url), "utf-8"),
    );
    const preserveAuthKeyIds = [1];
    const preplan = await plan(session, bp, { preserveAuthKeyIds });
    expect(preplan.create.length).toBe(1);
    expect(preplan.create[0]?.id).toBe(2);
    expect(preplan.delete.length).toBe(0);

    await apply(session, preplan, { preserveAuthKeyIds });
    expect(store.getAuthKey(2)).toBeDefined();

    const postDiff = await diff(session, bp, { preserveAuthKeyIds });
    expect(postDiff.create).toHaveLength(0);
    expect(postDiff.update).toHaveLength(0);
    expect(postDiff.delete).toHaveLength(0);

    await session.close();
    await transport.close();
    await sim.stop();
  });

  it("diff flags unmanaged auth keys for deletion when not preserved", async () => {
    const store = createStore();
    const bootstrapEnc = new Uint8Array(16).fill(0x40);
    const bootstrapMac = new Uint8Array(16).fill(0x41);
    store.putAuthKey({
      id: 1,
      capabilities: CapSet.of(Capability.PutAuthenticationKey, Capability.DeleteAuthenticationKey),
      delegatedCapabilities: CapSet.empty(),
      domains: domainSetOf(1),
      label: "bootstrap",
      encKey: bootstrapEnc,
      macKey: bootstrapMac,
    });
    store.putAuthKey({
      id: 99,
      capabilities: CapSet.empty(),
      delegatedCapabilities: CapSet.empty(),
      domains: domainSetOf(1),
      label: "drift",
      encKey: new Uint8Array(16).fill(0xef),
      macKey: new Uint8Array(16).fill(0xee),
    });
    const sim = createSimulator(storeBackedHandler(store));
    const port = await sim.start();
    const transport = createHttpTransport({ url: `http://127.0.0.1:${port}` });
    const session = await openSession({
      transport,
      authKeyId: 1,
      authEnc: bootstrapEnc,
      authMac: bootstrapMac,
    });
    const bp = parseBlueprint(
      readFileSync(new URL("./fixtures/minimal.yaml", import.meta.url), "utf-8"),
    );
    const p = await plan(session, bp, { preserveAuthKeyIds: [1] });
    const drift = p.delete.find((s) => s.id === 99);
    expect(drift).toBeDefined();

    await session.close();
    await transport.close();
    await sim.stop();
  });
});
