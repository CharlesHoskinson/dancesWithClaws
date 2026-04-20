import { createServer, type Server } from "node:http";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createHttpTransport } from "../../src/transport/http.js";

describe("HttpTransport", () => {
  let server: Server;
  let port: number;

  beforeAll(async () => {
    server = createServer((req, res) => {
      if (req.method !== "POST" || req.url !== "/connector/api") {
        res.statusCode = 404;
        res.end();
        return;
      }
      const chunks: Buffer[] = [];
      req.on("data", (c: Buffer) => chunks.push(c));
      req.on("end", () => {
        const body = Buffer.concat(chunks);
        res.setHeader("Content-Type", "application/octet-stream");
        res.end(Buffer.from([0x80 | body[0], 0x00, 0x00]));
      });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
    port = (server.address() as { port: number }).port;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("posts APDU to /connector/api and returns response body", async () => {
    const t = createHttpTransport({ url: `http://127.0.0.1:${port}` });
    const rsp = await t.send(new Uint8Array([0x06, 0x00, 0x00]));
    expect([...rsp]).toEqual([0x86, 0x00, 0x00]);
    await t.close();
  });

  it("tolerates trailing slash on url", async () => {
    const t = createHttpTransport({ url: `http://127.0.0.1:${port}/` });
    const rsp = await t.send(new Uint8Array([0x06, 0x00, 0x00]));
    expect([...rsp]).toEqual([0x86, 0x00, 0x00]);
    await t.close();
  });

  it("surfaces network error as HSM_UNAVAILABLE", async () => {
    const t = createHttpTransport({ url: "http://127.0.0.1:1" });
    await expect(t.send(new Uint8Array([0x06, 0x00, 0x00]))).rejects.toThrow(/HSM_UNAVAILABLE/);
    await t.close();
  });

  it("rejects after close", async () => {
    const t = createHttpTransport({ url: `http://127.0.0.1:${port}` });
    await t.close();
    await expect(t.send(new Uint8Array([0x06, 0x00, 0x00]))).rejects.toThrow(/closed/i);
  });
});
