import type { ApduHandler, HsmTransport } from "./types.js";

export function createInMemoryTransport(handler: ApduHandler): HsmTransport {
  let closed = false;
  return {
    async send(apdu) {
      if (closed) {
        throw new Error("transport closed");
      }
      return handler(apdu);
    },
    async close() {
      closed = true;
    },
  };
}
