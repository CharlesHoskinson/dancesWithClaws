import { request } from "undici";
import type { HsmTransport } from "./types.js";

export interface HttpTransportOptions {
  readonly url: string;
  readonly timeoutMs?: number;
}

export function createHttpTransport(opts: HttpTransportOptions): HsmTransport {
  const endpoint = `${opts.url.replace(/\/$/, "")}/connector/api`;
  const timeoutMs = opts.timeoutMs ?? 5000;
  let closed = false;
  return {
    async send(apdu) {
      if (closed) {
        throw new Error("transport closed");
      }
      try {
        const r = await request(endpoint, {
          method: "POST",
          headers: { "content-type": "application/octet-stream" },
          body: apdu,
          bodyTimeout: timeoutMs,
          headersTimeout: timeoutMs,
        });
        if (r.statusCode !== 200) {
          throw new Error(`HSM_UNAVAILABLE: connector returned ${r.statusCode}`);
        }
        return new Uint8Array(await r.body.arrayBuffer());
      } catch (e) {
        if (e instanceof Error && e.message.startsWith("HSM_UNAVAILABLE")) {
          throw e;
        }
        throw new Error(`HSM_UNAVAILABLE: ${e instanceof Error ? e.message : String(e)}`, {
          cause: e,
        });
      }
    },
    async close() {
      closed = true;
    },
  };
}
