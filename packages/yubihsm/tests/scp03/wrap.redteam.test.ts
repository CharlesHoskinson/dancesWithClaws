import { describe, expect, it } from "vitest";
import {
  ResponseMacError,
  unwrapSessionResponse,
  wrapSessionMessage,
} from "../../src/scp03/wrap.js";

// Red-team: gaps that the adversarial suite does not cover with a specific
// error-class assertion. Each test here is intended to FAIL if the
// implementation quietly regresses to "any throw counts as rejection".

const SESSION_ID = 3;
const sEnc = new Uint8Array(16).fill(0x11);
const sRmac = new Uint8Array(16).fill(0x33);
// A distinct wrong key, to expose any code path that accidentally uses sEnc
// where sRmac is required.
const sEncWrongAsMac = new Uint8Array(16).fill(0x11);

function makeValidResponse() {
  const prevResponseIcv = new Uint8Array(16);
  const inner = new Uint8Array([0x85, 0x00, 0x03, 0xde, 0xad, 0xbe]);
  const { wrapped, counter, newIcv } = wrapSessionMessage({
    sEnc,
    sMac: sRmac,
    icv: prevResponseIcv,
    counter: 0,
    sessionId: SESSION_ID,
    inner,
  });
  return { wrapped, counter, prevResponseIcv, inner, newIcv };
}

describe("R-MAC red-team gaps", () => {
  it("key-confusion: verifying with sEnc in place of sRmac must be rejected as ResponseMacError", () => {
    const fx = makeValidResponse();
    // Caller passes the wrong key for sRmac. This must NOT silently succeed,
    // and must throw the typed MAC error (not a generic Error).
    expect(() =>
      unwrapSessionResponse({
        sEnc,
        sRmac: sEncWrongAsMac,
        icv: fx.prevResponseIcv,
        counter: fx.counter,
        wrapped: fx.wrapped,
      }),
    ).toThrow(ResponseMacError);
  });

  it("append-byte smuggling: appending 16 zero-bytes past the MAC must be rejected as ResponseMacError (not a length error)", () => {
    const fx = makeValidResponse();
    // An attacker appends 16 bytes of arbitrary ciphertext. bodyEnd shifts by
    // +16 so the verifier re-MACs a longer wrappedNoMac. Must fail with the
    // MAC class, since the tag no longer matches the recomputed value.
    const tampered = new Uint8Array(fx.wrapped.length + 16);
    tampered.set(fx.wrapped, 0);
    // Copy the last 8 bytes (the original MAC tag) to the new end so that the
    // length alignment check still passes. The MAC must still reject.
    tampered.copyWithin(tampered.length - 8, fx.wrapped.length - 8);
    // Zero-fill the middle "smuggled" region.
    tampered.fill(0x00, fx.wrapped.length - 8, tampered.length - 8);
    expect(() =>
      unwrapSessionResponse({
        sEnc,
        sRmac,
        icv: fx.prevResponseIcv,
        counter: fx.counter,
        wrapped: tampered,
      }),
    ).toThrow(ResponseMacError);
  });

  it("truncation must specifically be rejected (not merely throw *something*)", () => {
    // Tightens the adversarial suite's attack 4, which only asserted
    // e instanceof Error. A padding-oracle regression that threw
    // 'bad ISO/IEC 9797-1 method 2 padding' would ALSO satisfy
    // toBeInstanceOf(Error), silently hiding a missing length check.
    const fx = makeValidResponse();
    const tampered = fx.wrapped.subarray(0, fx.wrapped.length - 1);
    expect(() =>
      unwrapSessionResponse({
        sEnc,
        sRmac,
        icv: fx.prevResponseIcv,
        counter: fx.counter,
        wrapped: tampered,
      }),
    ).toThrow(/too short|misaligned/);
  });

  it("empty-body frame (sessionId + one-padded-block + mac): must verify or throw typed, never return garbage", () => {
    // Inner of length 0 → pad() produces one 16-byte block [0x80, 0x00, ...].
    // This exercises the minimum-length frame and the unpad-of-single-block path.
    const { wrapped, counter } = wrapSessionMessage({
      sEnc,
      sMac: sRmac,
      icv: new Uint8Array(16),
      counter: 0,
      sessionId: SESSION_ID,
      inner: new Uint8Array(0),
    });
    expect(wrapped.length).toBe(1 + 16 + 8);
    // Tamper 1 bit in the ciphertext block — must be rejected as MAC, not
    // slip through to an unpad() call that fails with a padding error.
    const tampered = wrapped.slice();
    tampered[5] ^= 0x01;
    expect(() =>
      unwrapSessionResponse({
        sEnc,
        sRmac,
        icv: new Uint8Array(16),
        counter,
        wrapped: tampered,
      }),
    ).toThrow(ResponseMacError);
  });
});
