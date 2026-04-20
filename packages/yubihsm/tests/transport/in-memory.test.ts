import { describe, it, expect } from "vitest";
import { createInMemoryTransport } from "../../src/transport/in-memory.js";

describe("InMemoryTransport", () => {
  it("routes an APDU to the registered handler", async () => {
    const t = createInMemoryTransport(async (apdu) => {
      return new Uint8Array([0x80 | apdu[0], 0x00, 0x00]);
    });
    const rsp = await t.send(new Uint8Array([0x06, 0x00, 0x00]));
    expect([...rsp]).toEqual([0x86, 0x00, 0x00]);
  });

  it("rejects after close", async () => {
    const t = createInMemoryTransport(async () => new Uint8Array([0x80, 0x00, 0x00]));
    await t.close();
    await expect(t.send(new Uint8Array([0x06, 0x00, 0x00]))).rejects.toThrow(/closed/i);
  });

  it("close is idempotent", async () => {
    const t = createInMemoryTransport(async () => new Uint8Array([0x80, 0x00, 0x00]));
    await t.close();
    await t.close();
    await expect(t.send(new Uint8Array([0x06, 0x00, 0x00]))).rejects.toThrow(/closed/i);
  });
});
