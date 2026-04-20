import { describe, it, expect } from "vitest";
import { createSimulator } from "../src/index.js";

describe("simulator HTTP server", () => {
  it("starts, reports a bound port, and stops", async () => {
    const sim = createSimulator();
    const port = await sim.start();
    expect(port).toBeGreaterThan(0);
    expect(sim.running).toBe(true);
    await sim.stop();
    expect(sim.running).toBe(false);
    expect(sim.port).toBe(0);
  });

  it("responds 200 to /connector/api with default error frame", async () => {
    const sim = createSimulator();
    const port = await sim.start();
    const rsp = await fetch(`http://127.0.0.1:${port}/connector/api`, {
      method: "POST",
      headers: { "content-type": "application/octet-stream" },
      body: new Uint8Array([0x06, 0x00, 0x00]),
    });
    expect(rsp.status).toBe(200);
    const bytes = new Uint8Array(await rsp.arrayBuffer());
    expect(bytes[0]).toBe(0x7f);
    expect(bytes[3]).toBe(0x10);
    await sim.stop();
  });

  it("returns 404 for unknown paths", async () => {
    const sim = createSimulator();
    const port = await sim.start();
    const rsp = await fetch(`http://127.0.0.1:${port}/other`, {
      method: "POST",
      body: new Uint8Array([0x06]),
    });
    expect(rsp.status).toBe(404);
    await sim.stop();
  });
});
