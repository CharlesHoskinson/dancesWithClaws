import { createSimulator, createStore, storeBackedHandler } from "@dancesWithClaws/yubihsm-sim";
import { describe, expect, it } from "vitest";
import {
  Algorithm,
  CapSet,
  Capability,
  createHttpTransport,
  derivePasswordKeys,
  domainSetOf,
  factoryReset,
  ObjectType,
  openSession,
} from "../../src/index.js";

describe("factoryReset (cmd 0x08)", () => {
  it("wipes store, marks session closed, and re-seeds the factory admin", async () => {
    const store = createStore();
    const adminEnc = new Uint8Array(16).fill(0x40);
    const adminMac = new Uint8Array(16).fill(0x41);
    // Seed a rotated admin + an asymmetric key. Neither should survive reset.
    store.putAuthKey({
      id: 2,
      capabilities: CapSet.of(Capability.ResetDevice, Capability.SignEcdsa),
      delegatedCapabilities: CapSet.of(Capability.SignEcdsa),
      domains: domainSetOf(1),
      label: "rotated-admin",
      encKey: adminEnc,
      macKey: adminMac,
    });
    store.putObject({
      id: 100,
      type: ObjectType.AsymmetricKey,
      algorithm: Algorithm.EcP256,
      label: "signer",
      capabilities: CapSet.of(Capability.SignEcdsa),
      delegatedCapabilities: CapSet.empty(),
      domains: domainSetOf(1),
      publicKey: new Uint8Array(10),
      secret: new Uint8Array(10),
    });

    const sim = createSimulator(storeBackedHandler(store));
    const port = await sim.start();
    const transport = createHttpTransport({ url: `http://127.0.0.1:${port}` });
    const session = await openSession({
      transport,
      authKeyId: 2,
      authEnc: adminEnc,
      authMac: adminMac,
    });

    await factoryReset(session);
    expect(session.state).toBe("CLOSED");

    // The pre-reset admin (id 2) and the asymmetric key (id 100) are gone.
    expect(store.getAuthKey(2)).toBeUndefined();
    expect(store.getObject(100)).toBeUndefined();
    expect(store.listAuthKeys()).toHaveLength(1);
    expect(store.listObjects()).toHaveLength(0);

    // Factory admin is present at id 1 with keys derived from "password".
    const factory = store.getAuthKey(1);
    expect(factory).toBeDefined();
    const expected = derivePasswordKeys("password");
    expect(Buffer.from(factory!.encKey).equals(Buffer.from(expected.encKey))).toBe(true);
    expect(Buffer.from(factory!.macKey).equals(Buffer.from(expected.macKey))).toBe(true);

    // Transport not reused — tear everything down.
    await transport.close();
    await sim.stop();
  });

  it("lets a fresh session authenticate with the factory password keys", async () => {
    const store = createStore();
    const adminEnc = new Uint8Array(16).fill(0x40);
    const adminMac = new Uint8Array(16).fill(0x41);
    store.putAuthKey({
      id: 2,
      capabilities: CapSet.of(Capability.ResetDevice),
      delegatedCapabilities: CapSet.empty(),
      domains: domainSetOf(1),
      label: "admin",
      encKey: adminEnc,
      macKey: adminMac,
    });
    const sim = createSimulator(storeBackedHandler(store));
    const port = await sim.start();
    const transport = createHttpTransport({ url: `http://127.0.0.1:${port}` });
    const session = await openSession({
      transport,
      authKeyId: 2,
      authEnc: adminEnc,
      authMac: adminMac,
    });
    await factoryReset(session);
    await transport.close();

    // New transport, factory password keys, id 1 — must authenticate cleanly.
    const fresh = createHttpTransport({ url: `http://127.0.0.1:${port}` });
    const { encKey, macKey } = derivePasswordKeys("password");
    const freshSession = await openSession({
      transport: fresh,
      authKeyId: 1,
      authEnc: encKey,
      authMac: macKey,
    });
    expect(freshSession.state).toBe("SECURE_CHANNEL");
    await freshSession.close();
    await fresh.close();
    await sim.stop();
  });
});
