import { describe, expect, it } from "vitest";
import { unwrapSessionResponse, wrapSessionMessage } from "../../src/scp03/wrap.js";

describe("SCP03 session wrap/unwrap symmetry", () => {
  const sEnc = new Uint8Array(16).fill(0x11);
  const sMac = new Uint8Array(16).fill(0x22);
  const sRmac = new Uint8Array(16).fill(0x33);

  it("round-trips an inner APDU", () => {
    const inner = new Uint8Array([0x4a, 0x00, 0x02, 0xaa, 0xbb]);
    const { wrapped, newIcv, counter } = wrapSessionMessage({
      sEnc,
      sMac,
      icv: new Uint8Array(16),
      counter: 0,
      sessionId: 3,
      inner,
    });
    expect(counter).toBe(1);
    expect(newIcv.length).toBe(16);
    const srv = unwrapSessionResponse({ sEnc, sRmac, icv: newIcv, counter, wrapped });
    expect(Buffer.from(srv.inner).equals(Buffer.from(inner))).toBe(true);
  });

  it("round-trips a block-aligned inner APDU (forces full padding block)", () => {
    const inner = new Uint8Array(16).fill(0xcc);
    const { wrapped, counter } = wrapSessionMessage({
      sEnc,
      sMac,
      icv: new Uint8Array(16),
      counter: 42,
      sessionId: 1,
      inner,
    });
    const srv = unwrapSessionResponse({
      sEnc,
      sRmac,
      icv: new Uint8Array(16),
      counter,
      wrapped,
    });
    expect(Buffer.from(srv.inner).equals(Buffer.from(inner))).toBe(true);
  });

  it("round-trips an empty inner APDU", () => {
    const inner = new Uint8Array(0);
    const { wrapped, counter } = wrapSessionMessage({
      sEnc,
      sMac,
      icv: new Uint8Array(16),
      counter: 0,
      sessionId: 7,
      inner,
    });
    const srv = unwrapSessionResponse({
      sEnc,
      sRmac,
      icv: new Uint8Array(16),
      counter,
      wrapped,
    });
    expect(srv.inner.length).toBe(0);
  });
});
