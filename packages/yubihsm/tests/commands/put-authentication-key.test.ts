import { createSimulator, createStore, storeBackedHandler } from "@dancesWithClaws/yubihsm-sim";
import { describe, expect, it } from "vitest";
import {
  CapSet,
  Capability,
  createHttpTransport,
  domainSetOf,
  openSession,
  putAuthenticationKey,
} from "../../src/index.js";

describe("putAuthenticationKey (wrapped session command)", () => {
  it("stores a new SCP03 auth key that can open its own session", async () => {
    const store = createStore();
    const adminEnc = new Uint8Array(16).fill(0x40);
    const adminMac = new Uint8Array(16).fill(0x41);
    store.putAuthKey({
      id: 2,
      capabilities: CapSet.of(Capability.PutAuthenticationKey),
      delegatedCapabilities: CapSet.of(Capability.SignEcdsa),
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

    const newEnc = new Uint8Array(16).fill(0x70);
    const newMac = new Uint8Array(16).fill(0x71);
    const { keyId } = await putAuthenticationKey(session, {
      keyId: 5,
      label: "operator",
      domains: domainSetOf(1),
      capabilities: CapSet.of(Capability.SignEcdsa),
      delegatedCapabilities: CapSet.empty(),
      encKey: newEnc,
      macKey: newMac,
    });
    expect(keyId).toBe(5);

    const stored = store.getAuthKey(5);
    expect(stored).toBeDefined();
    expect(stored?.label).toBe("operator");
    expect(Buffer.from(stored!.encKey).equals(Buffer.from(newEnc))).toBe(true);
    expect(Buffer.from(stored!.macKey).equals(Buffer.from(newMac))).toBe(true);

    await session.close();
    const operatorSession = await openSession({
      transport,
      authKeyId: 5,
      authEnc: newEnc,
      authMac: newMac,
    });
    expect(operatorSession.state).toBe("SECURE_CHANNEL");
    await operatorSession.close();

    await transport.close();
    await sim.stop();
  });
});
