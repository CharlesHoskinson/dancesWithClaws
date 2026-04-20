import { ctr } from "@noble/ciphers/aes";
import { aesCmac } from "./cmac.js";

const BLOCK_SIZE = 16;
const MAC_TAG_LEN = 8;

// Minimum valid wrapped frame = [sessionId(1)] + [one padded block(16)] + [mac tag(8)].
const MIN_WRAPPED_LEN = 1 + BLOCK_SIZE + MAC_TAG_LEN;

function pad(inner: Uint8Array): Uint8Array {
  const paddedLen = Math.ceil((inner.length + 1) / BLOCK_SIZE) * BLOCK_SIZE;
  const padded = new Uint8Array(paddedLen);
  padded.set(inner, 0);
  padded[inner.length] = 0x80;
  return padded;
}

function unpad(p: Uint8Array): Uint8Array {
  let i = p.length - 1;
  while (i >= 0 && p[i] === 0x00) {
    i--;
  }
  if (i < 0 || p[i] !== 0x80) {
    throw new Error("bad ISO/IEC 9797-1 method 2 padding");
  }
  return p.subarray(0, i);
}

function counterBlock(counter: number): Uint8Array {
  if (counter < 0 || counter > 0xffffffff) {
    throw new Error(`counter out of u32 range: ${counter}`);
  }
  const block = new Uint8Array(BLOCK_SIZE);
  block[BLOCK_SIZE - 1] = counter & 0xff;
  block[BLOCK_SIZE - 2] = (counter >>> 8) & 0xff;
  block[BLOCK_SIZE - 3] = (counter >>> 16) & 0xff;
  block[BLOCK_SIZE - 4] = (counter >>> 24) & 0xff;
  return block;
}

/**
 * SCP03 body IV per GPC v2.3.1 Amendment D §6.2.6:
 *   IV = AES-ECB(S-ENC, counter_block)
 * Implemented as CTR(S-ENC, counter_block).encrypt(zero_block) — CTR's first
 * keystream block is AES(key, nonce) XOR'd with plaintext, so a zero plaintext
 * yields the raw ECB output.
 */
function deriveBodyIv(sEnc: Uint8Array, counter: number): Uint8Array {
  return ctr(sEnc, counterBlock(counter)).encrypt(new Uint8Array(BLOCK_SIZE));
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) {
    return false;
  }
  let r = 0;
  for (let i = 0; i < a.length; i++) {
    r |= a[i]! ^ b[i]!;
  }
  return r === 0;
}

/**
 * Typed error for a response-side SCP03 R-MAC verification failure. Thrown
 * when the 8-byte MAC tag on a wrapped response does not match the CMAC
 * computed over `prev_response_icv || wrapped[0..-8]` under S-RMAC.
 *
 * The caller (session) MUST NOT advance its response-ICV chain on this error —
 * otherwise an attacker can desync the chain by spamming bad frames.
 */
export class ResponseMacError extends Error {
  constructor(message = "SCP03 response MAC verification failed") {
    super(message);
    this.name = "ResponseMacError";
  }
}

export interface WrapArgs {
  readonly sEnc: Uint8Array;
  readonly sMac: Uint8Array;
  readonly icv: Uint8Array;
  readonly counter: number;
  readonly sessionId: number;
  readonly inner: Uint8Array;
}

export interface WrapResult {
  readonly wrapped: Uint8Array;
  readonly newIcv: Uint8Array;
  readonly counter: number;
}

export function wrapSessionMessage(args: WrapArgs): WrapResult {
  if (args.sEnc.length !== BLOCK_SIZE) {
    throw new Error(`sEnc must be ${BLOCK_SIZE} bytes, got ${args.sEnc.length}`);
  }
  if (args.sMac.length !== BLOCK_SIZE) {
    throw new Error(`sMac must be ${BLOCK_SIZE} bytes, got ${args.sMac.length}`);
  }
  if (args.icv.length !== BLOCK_SIZE) {
    throw new Error(`icv must be ${BLOCK_SIZE} bytes, got ${args.icv.length}`);
  }
  const nextCounter = args.counter + 1;
  const bodyIv = deriveBodyIv(args.sEnc, nextCounter);
  const encBody = ctr(args.sEnc, bodyIv).encrypt(pad(args.inner));
  const wrappedNoMac = new Uint8Array(1 + encBody.length);
  wrappedNoMac[0] = args.sessionId & 0xff;
  wrappedNoMac.set(encBody, 1);
  const macInput = new Uint8Array(args.icv.length + wrappedNoMac.length);
  macInput.set(args.icv, 0);
  macInput.set(wrappedNoMac, args.icv.length);
  const fullMac = aesCmac(args.sMac, macInput);
  const wrapped = new Uint8Array(wrappedNoMac.length + MAC_TAG_LEN);
  wrapped.set(wrappedNoMac, 0);
  wrapped.set(fullMac.subarray(0, MAC_TAG_LEN), wrappedNoMac.length);
  return { wrapped, newIcv: fullMac, counter: nextCounter };
}

export interface UnwrapArgs {
  readonly sEnc: Uint8Array;
  readonly sRmac: Uint8Array;
  readonly icv: Uint8Array;
  readonly counter: number;
  readonly wrapped: Uint8Array;
}

export interface UnwrapResult {
  readonly inner: Uint8Array;
  /**
   * The full 16-byte CMAC output. Session callers advance their response-ICV
   * chain to this value *only after* a successful unwrap.
   */
  readonly newIcv: Uint8Array;
}

export function unwrapSessionResponse(args: UnwrapArgs): UnwrapResult {
  if (args.sEnc.length !== BLOCK_SIZE) {
    throw new Error(`sEnc must be ${BLOCK_SIZE} bytes, got ${args.sEnc.length}`);
  }
  if (args.sRmac.length !== BLOCK_SIZE) {
    throw new Error(`sRmac must be ${BLOCK_SIZE} bytes, got ${args.sRmac.length}`);
  }
  if (args.icv.length !== BLOCK_SIZE) {
    throw new Error(`icv must be ${BLOCK_SIZE} bytes, got ${args.icv.length}`);
  }
  if (args.wrapped.length < MIN_WRAPPED_LEN) {
    throw new Error(`wrapped frame too short: ${args.wrapped.length}`);
  }
  const bodyEnd = args.wrapped.length - MAC_TAG_LEN;
  // Encrypted body must be a whole number of AES blocks.
  if (bodyEnd - 1 <= 0 || (bodyEnd - 1) % BLOCK_SIZE !== 0) {
    throw new Error(`wrapped frame has misaligned body: ${args.wrapped.length}`);
  }

  // Verify the 8-byte R-MAC tag BEFORE decrypting so tampered frames never
  // reach the padding oracle. MAC input is prev-response-ICV || frame-without-tag.
  const wrappedNoMac = args.wrapped.subarray(0, bodyEnd);
  const macInput = new Uint8Array(args.icv.length + wrappedNoMac.length);
  macInput.set(args.icv, 0);
  macInput.set(wrappedNoMac, args.icv.length);
  const fullMac = aesCmac(args.sRmac, macInput);
  const expectedTag = fullMac.subarray(0, MAC_TAG_LEN);
  const actualTag = args.wrapped.subarray(bodyEnd);
  if (!timingSafeEqual(expectedTag, actualTag)) {
    throw new ResponseMacError();
  }

  const body = args.wrapped.subarray(1, bodyEnd);
  const bodyIv = deriveBodyIv(args.sEnc, args.counter);
  const decoded = ctr(args.sEnc, bodyIv).encrypt(body);
  return { inner: unpad(decoded), newIcv: fullMac };
}
