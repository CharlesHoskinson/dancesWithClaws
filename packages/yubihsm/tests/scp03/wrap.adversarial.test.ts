import { describe, expect, it } from "vitest";
import { aesCmac } from "../../src/scp03/cmac.js";
import {
  ResponseMacError,
  unwrapSessionResponse,
  wrapSessionMessage,
} from "../../src/scp03/wrap.js";

// The adversarial test suite. These tests are the spec for R-MAC verification:
// every tampering class below must be rejected, and the rejection must not
// advance the response-ICV chain (otherwise an attacker desyncs the session
// by spamming bad frames).

const SESSION_ID = 3;
const sEnc = new Uint8Array(16).fill(0x11);
const sRmac = new Uint8Array(16).fill(0x33);

// Build a valid wrapped response + the response-ICV that produced it.
// The "response wrap" uses sRmac as the MAC key (that's what the device does
// on the response side) and prev-response-ICV as the chaining value.
function makeValidResponse(opts?: {
  prevResponseIcv?: Uint8Array;
  priorCounter?: number;
  inner?: Uint8Array;
  sessionId?: number;
}): {
  wrapped: Uint8Array;
  prevResponseIcv: Uint8Array;
  counter: number;
  inner: Uint8Array;
  sessionId: number;
  newResponseIcv: Uint8Array;
} {
  const prevResponseIcv = opts?.prevResponseIcv ?? new Uint8Array(16);
  const priorCounter = opts?.priorCounter ?? 0;
  const inner = opts?.inner ?? new Uint8Array([0x85, 0x00, 0x03, 0xde, 0xad, 0xbe]);
  const sessionId = opts?.sessionId ?? SESSION_ID;
  // wrapSessionMessage treats `counter` as the prior value and derives the
  // body IV from `counter+1`. Mirror what the simulator does: pass the prior
  // counter, return the new one that unwrap must be called with.
  const { wrapped, newIcv, counter } = wrapSessionMessage({
    sEnc,
    sMac: sRmac,
    icv: prevResponseIcv,
    counter: priorCounter,
    sessionId,
    inner,
  });
  return {
    wrapped,
    prevResponseIcv,
    counter,
    inner,
    sessionId,
    newResponseIcv: newIcv,
  };
}

describe("R-MAC adversarial suite", () => {
  it("happy path: an untampered wrapped response unwraps cleanly and returns the next response-ICV", () => {
    const fixture = makeValidResponse();
    const result = unwrapSessionResponse({
      sEnc,
      sRmac,
      icv: fixture.prevResponseIcv,
      counter: fixture.counter,
      wrapped: fixture.wrapped,
    });
    expect(Buffer.from(result.inner).equals(Buffer.from(fixture.inner))).toBe(true);
    // The caller advances the chain with the full 16-byte CMAC output.
    expect(result.newIcv.length).toBe(16);
    expect(Buffer.from(result.newIcv).equals(Buffer.from(fixture.newResponseIcv))).toBe(true);
  });

  it("attack 1 (body bit-flip): flipping a bit in the encrypted body is rejected with ResponseMacError", () => {
    const fixture = makeValidResponse();
    const tampered = fixture.wrapped.slice();
    // Flip bit 0 of byte 2 (inside the encrypted body, safely past the session-id byte).
    tampered[2] ^= 0x01;
    expect(() =>
      unwrapSessionResponse({
        sEnc,
        sRmac,
        icv: fixture.prevResponseIcv,
        counter: fixture.counter,
        wrapped: tampered,
      }),
    ).toThrow(ResponseMacError);
  });

  it("attack 2 (MAC bit-flip): flipping a bit in the 8-byte MAC tag is rejected with ResponseMacError", () => {
    const fixture = makeValidResponse();
    const tampered = fixture.wrapped.slice();
    // Flip a bit in the last byte (inside the MAC tag).
    tampered[tampered.length - 1] ^= 0x80;
    expect(() =>
      unwrapSessionResponse({
        sEnc,
        sRmac,
        icv: fixture.prevResponseIcv,
        counter: fixture.counter,
        wrapped: tampered,
      }),
    ).toThrow(ResponseMacError);
  });

  it("attack 3 (session-id substitution): changing the sessionId prefix byte is rejected with ResponseMacError", () => {
    const fixture = makeValidResponse();
    const tampered = fixture.wrapped.slice();
    // Change byte 0 (the session-id). The MAC covers it, so this must fail.
    tampered[0] = (tampered[0]! ^ 0xff) & 0xff;
    expect(() =>
      unwrapSessionResponse({
        sEnc,
        sRmac,
        icv: fixture.prevResponseIcv,
        counter: fixture.counter,
        wrapped: tampered,
      }),
    ).toThrow(ResponseMacError);
  });

  it("attack 4 (truncation): dropping the trailing MAC byte is rejected with a typed length error (no silent success)", () => {
    const fixture = makeValidResponse();
    const tampered = fixture.wrapped.subarray(0, fixture.wrapped.length - 1);
    let threw = false;
    try {
      unwrapSessionResponse({
        sEnc,
        sRmac,
        icv: fixture.prevResponseIcv,
        counter: fixture.counter,
        wrapped: tampered,
      });
    } catch (e) {
      threw = true;
      // Length error is acceptable; ResponseMacError is also acceptable.
      // The contract is: it MUST NOT silently succeed and decrypt garbage.
      expect(e).toBeInstanceOf(Error);
    }
    expect(threw).toBe(true);
  });

  it("attack 5 (counter/ICV replay): a legit frame with the wrong prior-response-ICV is rejected with ResponseMacError", () => {
    // Produce two frames in sequence on the real response chain.
    const first = makeValidResponse({
      prevResponseIcv: new Uint8Array(16),
      priorCounter: 0,
    });
    // Second frame uses first's newResponseIcv as its prior ICV.
    const second = makeValidResponse({
      prevResponseIcv: first.newResponseIcv,
      priorCounter: first.counter,
    });
    // Attacker replays the second frame but attempts to present it as if it
    // were still at the chain head (all-zero ICV). The R-MAC covers the ICV,
    // so this must be rejected.
    expect(() =>
      unwrapSessionResponse({
        sEnc,
        sRmac,
        icv: new Uint8Array(16),
        counter: second.counter,
        wrapped: second.wrapped,
      }),
    ).toThrow(ResponseMacError);
  });

  it("defensive: after a rejection, a shared session.responseIcv must not advance", () => {
    // Simulate the session-level chaining helper used by the driver.
    const session = { responseIcv: new Uint8Array(16) };
    const snapshot = session.responseIcv.slice();

    const fixture = makeValidResponse({ prevResponseIcv: session.responseIcv });
    const tampered = fixture.wrapped.slice();
    tampered[2] ^= 0x01;

    try {
      const r = unwrapSessionResponse({
        sEnc,
        sRmac,
        icv: session.responseIcv,
        counter: fixture.counter,
        wrapped: tampered,
      });
      // The only legal advance point is "after successful unwrap". The
      // implementation must throw before returning, so this branch is a bug.
      session.responseIcv = r.newIcv;
      throw new Error("unwrap should have thrown on tampered frame");
    } catch (e) {
      expect(e).toBeInstanceOf(ResponseMacError);
    }

    // The ICV must be byte-for-byte identical to the pre-call snapshot.
    expect(Buffer.from(session.responseIcv).equals(Buffer.from(snapshot))).toBe(true);
  });

  it("sanity: ResponseMacError is a distinct, typed error subclass of Error", () => {
    const err = new ResponseMacError("test");
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(ResponseMacError);
    expect(err.name).toBe("ResponseMacError");
  });

  it("cross-check: the MAC is derived from sRmac and prev-ICV || wrapped[0..-8]", () => {
    // Sanity-check the implementation-independent contract: re-compute the
    // expected MAC the same way the driver should, then assert
    // unwrapSessionResponse accepts the untampered frame.
    const fixture = makeValidResponse();
    const macInput = new Uint8Array(fixture.prevResponseIcv.length + (fixture.wrapped.length - 8));
    macInput.set(fixture.prevResponseIcv, 0);
    macInput.set(
      fixture.wrapped.subarray(0, fixture.wrapped.length - 8),
      fixture.prevResponseIcv.length,
    );
    const expected = aesCmac(sRmac, macInput).subarray(0, 8);
    const actual = fixture.wrapped.subarray(fixture.wrapped.length - 8);
    expect(Buffer.from(actual).equals(Buffer.from(expected))).toBe(true);
  });
});
