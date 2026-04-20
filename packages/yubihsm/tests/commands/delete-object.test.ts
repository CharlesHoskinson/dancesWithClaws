import { createSimulator, createStore, storeBackedHandler } from "@dancesWithClaws/yubihsm-sim";
import { describe, expect, it } from "vitest";
import {
  Algorithm,
  CapSet,
  Capability,
  createHttpTransport,
  deleteObject,
  domainSetOf,
  ObjectType,
  openSession,
} from "../../src/index.js";

describe("deleteObject (wrapped session command)", () => {
  it("removes an asymmetric key from the store", async () => {
    const store = createStore();
    const encKey = new Uint8Array(16).fill(0x40);
    const macKey = new Uint8Array(16).fill(0x41);
    store.putAuthKey({
      id: 2,
      capabilities: CapSet.of(Capability.DeleteAsymmetricKey, Capability.SignEcdsa),
      delegatedCapabilities: CapSet.of(Capability.DeleteAsymmetricKey, Capability.SignEcdsa),
      domains: domainSetOf(1),
      label: "admin",
      encKey,
      macKey,
    });
    const target = store.putObject({
      id: 100,
      type: ObjectType.AsymmetricKey,
      algorithm: Algorithm.EcP256,
      capabilities: CapSet.of(Capability.SignEcdsa),
      delegatedCapabilities: CapSet.empty(),
      domains: domainSetOf(1),
      label: "signer",
    });
    expect(store.getObject(target.id)).toBeDefined();

    const sim = createSimulator(storeBackedHandler(store));
    const port = await sim.start();
    const transport = createHttpTransport({ url: `http://127.0.0.1:${port}` });
    const session = await openSession({
      transport,
      authKeyId: 2,
      authEnc: encKey,
      authMac: macKey,
    });

    await deleteObject(session, target.id, ObjectType.AsymmetricKey);
    expect(store.getObject(target.id)).toBeUndefined();

    await session.close();
    await transport.close();
    await sim.stop();
  });

  it("returns OBJECT_NOT_FOUND when deleting a non-existent object", async () => {
    const store = createStore();
    const encKey = new Uint8Array(16).fill(0x40);
    const macKey = new Uint8Array(16).fill(0x41);
    store.putAuthKey({
      id: 2,
      capabilities: CapSet.of(Capability.DeleteAsymmetricKey, Capability.SignEcdsa),
      delegatedCapabilities: CapSet.of(Capability.DeleteAsymmetricKey, Capability.SignEcdsa),
      domains: domainSetOf(1),
      label: "admin",
      encKey,
      macKey,
    });
    const sim = createSimulator(storeBackedHandler(store));
    const port = await sim.start();
    const transport = createHttpTransport({ url: `http://127.0.0.1:${port}` });
    const session = await openSession({
      transport,
      authKeyId: 2,
      authEnc: encKey,
      authMac: macKey,
    });
    await expect(deleteObject(session, 9999, ObjectType.AsymmetricKey)).rejects.toThrow(
      /inner command 0x58 failed: 11/,
    );
    await session.close();
    await transport.close();
    await sim.stop();
  });
});
