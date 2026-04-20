import { createSimulator, createStore, storeBackedHandler } from "@dancesWithClaws/yubihsm-sim";
import { describe, expect, it } from "vitest";
import {
  CapSet,
  Capability,
  createHttpTransport,
  domainSetOf,
  getObjectInfo,
  ObjectType,
  openSession,
} from "../../src/index.js";

describe("getObjectInfo (cmd 0x4E)", () => {
  it("returns the full ObjectInfo record for a stored authentication key", async () => {
    const store = createStore();
    const encKey = new Uint8Array(16).fill(0x40);
    const macKey = new Uint8Array(16).fill(0x41);
    const caps = CapSet.of(
      Capability.PutAuthenticationKey,
      Capability.GenerateAsymmetricKey,
      Capability.SignEcdsa,
    );
    const delegated = CapSet.of(Capability.SignEcdsa, Capability.ExportWrapped);
    const domains = domainSetOf(1, 3, 7);
    store.putAuthKey({
      id: 2,
      capabilities: caps,
      delegatedCapabilities: delegated,
      domains,
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

    const info = await getObjectInfo(session, 2, ObjectType.AuthenticationKey);
    expect(info.id).toBe(2);
    expect(info.type).toBe(ObjectType.AuthenticationKey);
    expect(info.label).toBe("admin");
    expect(info.domains).toBe(domains);
    expect(info.capabilities).toBe(caps);
    expect(info.delegatedCapabilities).toBe(delegated);
    expect(info.algorithm).toBe(38); // YH_AES128 + Yubico auth.
    // Length is enc + mac = 32 bytes for SCP03 auth keys.
    expect(info.length).toBe(32);
    expect(info.sequence).toBe(0);
    // Stored via putAuthKey -> origin "imported".
    expect(info.origin).toBe(0x01);

    await session.close();
    await transport.close();
    await sim.stop();
  });

  it("returns OBJECT_NOT_FOUND for a missing object", async () => {
    const store = createStore();
    const encKey = new Uint8Array(16).fill(0x40);
    const macKey = new Uint8Array(16).fill(0x41);
    store.putAuthKey({
      id: 2,
      capabilities: CapSet.of(Capability.GenerateAsymmetricKey),
      delegatedCapabilities: CapSet.empty(),
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

    // Inner error code 11 = OBJECT_NOT_FOUND.
    await expect(getObjectInfo(session, 9999, ObjectType.AuthenticationKey)).rejects.toThrow(
      /inner command 0x4e failed: 11/,
    );

    await session.close();
    await transport.close();
    await sim.stop();
  });
});
