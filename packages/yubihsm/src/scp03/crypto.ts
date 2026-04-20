import { aesCmac } from "./cmac.js";

const LABEL_CARD_CRYPTOGRAM = 0x00;
const LABEL_HOST_CRYPTOGRAM = 0x01;

/**
 * SP 800-108 KDF block for 64-bit cryptograms:
 *   [label:1] [0x00:1] [i=0x01:1] [host_challenge || card_challenge : 16] [L = 0x0040 : 2]
 * Output is the first 8 bytes of the AES-CMAC over this block under S-MAC.
 */
function cryptogram64(
  sMac: Uint8Array,
  label: number,
  hostChallenge: Uint8Array,
  cardChallenge: Uint8Array,
): Uint8Array {
  if (sMac.length !== 16) {
    throw new Error(`sMac must be 16 bytes, got ${sMac.length}`);
  }
  if (hostChallenge.length !== 8) {
    throw new Error(`hostChallenge must be 8 bytes, got ${hostChallenge.length}`);
  }
  if (cardChallenge.length !== 8) {
    throw new Error(`cardChallenge must be 8 bytes, got ${cardChallenge.length}`);
  }
  const input = new Uint8Array(1 + 1 + 1 + 16 + 2);
  input[0] = label;
  input[1] = 0x00;
  input[2] = 0x01;
  input.set(hostChallenge, 3);
  input.set(cardChallenge, 3 + 8);
  input[19] = 0x00;
  input[20] = 0x40; // 64 bits
  const full = aesCmac(sMac, input);
  return full.slice(0, 8);
}

export function cardCryptogram(
  sMac: Uint8Array,
  hostChallenge: Uint8Array,
  cardChallenge: Uint8Array,
): Uint8Array {
  return cryptogram64(sMac, LABEL_CARD_CRYPTOGRAM, hostChallenge, cardChallenge);
}

export function hostCryptogram(
  sMac: Uint8Array,
  hostChallenge: Uint8Array,
  cardChallenge: Uint8Array,
): Uint8Array {
  return cryptogram64(sMac, LABEL_HOST_CRYPTOGRAM, hostChallenge, cardChallenge);
}

/**
 * APDU MAC with ICV chaining (GlobalPlatform SCP03 C-MAC).
 *
 *   full = CMAC(sMac, icv || apdu)
 *   mac  = full[0..8]
 *   new ICV = full (carried into the next APDU in the session)
 */
export function macApdu(
  sMac: Uint8Array,
  icv: Uint8Array,
  apdu: Uint8Array,
): { mac: Uint8Array; newIcv: Uint8Array } {
  if (sMac.length !== 16) {
    throw new Error(`sMac must be 16 bytes, got ${sMac.length}`);
  }
  if (icv.length !== 16) {
    throw new Error(`icv must be 16 bytes, got ${icv.length}`);
  }
  const input = new Uint8Array(icv.length + apdu.length);
  input.set(icv, 0);
  input.set(apdu, icv.length);
  const full = aesCmac(sMac, input);
  return { mac: full.slice(0, 8), newIcv: full };
}
