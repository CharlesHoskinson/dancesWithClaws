import { describe, expect, it } from "vitest";
import { unwrapSessionResponse, wrapSessionMessage } from "../../src/scp03/wrap.js";

describe("SCP03 session wrap/unwrap symmetry", () => {
  // Use the same key value for sMac and sRmac so wrap's MAC key matches
  // unwrap's R-MAC key — these tests only assert the crypto primitives are
  // symmetric, not that the wrap/unwrap *sides* are. The adversarial suite
  // covers the MAC-rejection cases; this suite covers round-trip.
  const sEnc = new Uint8Array(16).fill(0x11);
  const sMac = new Uint8Array(16).fill(0x22);
  const sRmac = sMac;

  it("round-trips an inner APDU", () => {
    const inner = new Uint8Array([0x4a, 0x00, 0x02, 0xaa, 0xbb]);
    const priorIcv = new Uint8Array(16);
    const { wrapped, newIcv, counter } = wrapSessionMessage({
      sEnc,
      sMac,
      icv: priorIcv,
      counter: 0,
      sessionId: 3,
      inner,
    });
    expect(counter).toBe(1);
    expect(newIcv.length).toBe(16);
    // Unwrap uses the same prior-ICV that wrap MAC'd under.
    const srv = unwrapSessionResponse({ sEnc, sRmac, icv: priorIcv, counter, wrapped });
    expect(Buffer.from(srv.inner).equals(Buffer.from(inner))).toBe(true);
    expect(Buffer.from(srv.newIcv).equals(Buffer.from(newIcv))).toBe(true);
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
