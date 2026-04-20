import { createSimulator, createStore, storeBackedHandler } from "@dancesWithClaws/yubihsm-sim";
import { describe, expect, it } from "vitest";
import {
  Algorithm,
  CapSet,
  Capability,
  createHttpTransport,
  domainSetOf,
  generateAsymmetricKey,
  ObjectType,
  openSession,
} from "../../src/index.js";

describe("generateAsymmetricKey (wrapped session command)", () => {
  it("auto-allocates an EC P-256 key id and stores public + private material", async () => {
    const store = createStore();
    const encKey = new Uint8Array(16).fill(0x40);
    const macKey = new Uint8Array(16).fill(0x41);
    store.putAuthKey({
      id: 2,
      capabilities: CapSet.of(Capability.GenerateAsymmetricKey),
      delegatedCapabilities: CapSet.of(Capability.SignEcdsa),
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

    const { keyId } = await generateAsymmetricKey(session, {
      label: "ecdsa-signer",
      domains: domainSetOf(1),
      capabilities: CapSet.of(Capability.SignEcdsa),
      algorithm: Algorithm.EcP256,
    });
    expect(keyId).toBeGreaterThanOrEqual(0x0100);

    const stored = store.getObject(keyId);
    expect(stored).toBeDefined();
    expect(stored?.type).toBe(ObjectType.AsymmetricKey);
    expect(stored?.algorithm).toBe(Algorithm.EcP256);
    expect(stored?.label).toBe("ecdsa-signer");
    expect(stored?.publicKey).toBeDefined();
    expect(stored?.secret).toBeDefined();

    await session.close();
    await transport.close();
    await sim.stop();
  });

  it("rejects explicit keyId collisions", async () => {
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
    store.putObject({
      id: 500,
      type: ObjectType.AsymmetricKey,
      algorithm: Algorithm.EcP256,
      capabilities: CapSet.empty(),
      delegatedCapabilities: CapSet.empty(),
      domains: domainSetOf(1),
      label: "pre-existing",
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
    await expect(
      generateAsymmetricKey(session, {
        keyId: 500,
        label: "dup",
        domains: domainSetOf(1),
        capabilities: CapSet.empty(),
        algorithm: Algorithm.EcP256,
      }),
    ).rejects.toThrow(/inner command 0x46 failed: 15/);
    await session.close();
    await transport.close();
    await sim.stop();
  });
});
