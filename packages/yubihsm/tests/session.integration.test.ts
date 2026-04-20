import { createSimulator, createStore, storeBackedHandler } from "@dancesWithClaws/yubihsm-sim";
import { describe, it, expect } from "vitest";
import { CapSet, Capability, createHttpTransport, domainSetOf, openSession } from "../src/index.js";

describe("Scp03Session against simulator", () => {
  it("opens, authenticates, and closes", async () => {
    const store = createStore();
    const encKey = new Uint8Array(16).fill(0x40);
    const macKey = new Uint8Array(16).fill(0x41);
    store.putAuthKey({
      id: 2,
      capabilities: CapSet.of(Capability.SignEcdsa),
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
    expect(session.state).toBe("SECURE_CHANNEL");
    await session.close();
    await transport.close();
    await sim.stop();
  });
});
