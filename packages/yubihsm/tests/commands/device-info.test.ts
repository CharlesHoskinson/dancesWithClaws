import { createSimulator, createStore, storeBackedHandler } from "@dancesWithClaws/yubihsm-sim";
import { describe, expect, it } from "vitest";
import { createHttpTransport, getDeviceInfo } from "../../src/index.js";

describe("getDeviceInfo", () => {
  it("returns firmware major.minor.patch and serial", async () => {
    const store = createStore();
    const sim = createSimulator(storeBackedHandler(store));
    const port = await sim.start();
    const transport = createHttpTransport({ url: `http://127.0.0.1:${port}` });
    const info = await getDeviceInfo(transport);
    expect(info.firmware.major).toBe(2);
    expect(info.firmware.minor).toBeGreaterThanOrEqual(4);
    expect(info.serial).toBeGreaterThan(0);
    expect(info.algorithms.length).toBeGreaterThan(0);
    await transport.close();
    await sim.stop();
  });
});
