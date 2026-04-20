import { aesCmac } from "./cmac.js";

export interface SessionKeys {
  sEnc: Uint8Array;
  sMac: Uint8Array;
  sRmac: Uint8Array;
}

const LABEL_S_ENC = 0x04;
const LABEL_S_MAC = 0x06;
const LABEL_S_RMAC = 0x07;

/**
 * SP 800-108 counter-mode KDF with AES-CMAC PRF. Single iteration, 128-bit output.
 * Input block layout (21 bytes):
 *   [label:1] [0x00:1] [i=0x01:1] [host_challenge || card_challenge : 16] [L = 0x0080 : 2]
 */
function kdf128(
  key: Uint8Array,
  label: number,
  hostChallenge: Uint8Array,
  cardChallenge: Uint8Array,
): Uint8Array {
  const input = new Uint8Array(1 + 1 + 1 + 16 + 2);
  input[0] = label;
  input[1] = 0x00;
  input[2] = 0x01;
  input.set(hostChallenge, 3);
  input.set(cardChallenge, 3 + 8);
  input[19] = 0x00;
  input[20] = 0x80; // 128 bits
  return aesCmac(key, input);
}

export function deriveSessionKeys(
  authEnc: Uint8Array,
  authMac: Uint8Array,
  hostChallenge: Uint8Array,
  cardChallenge: Uint8Array,
): SessionKeys {
  if (authEnc.length !== 16) {
    throw new Error(`authEnc must be 16 bytes, got ${authEnc.length}`);
  }
  if (authMac.length !== 16) {
    throw new Error(`authMac must be 16 bytes, got ${authMac.length}`);
  }
  if (hostChallenge.length !== 8) {
    throw new Error(`hostChallenge must be 8 bytes, got ${hostChallenge.length}`);
  }
  if (cardChallenge.length !== 8) {
    throw new Error(`cardChallenge must be 8 bytes, got ${cardChallenge.length}`);
  }

  const sEnc = kdf128(authEnc, LABEL_S_ENC, hostChallenge, cardChallenge);
  const sMac = kdf128(authMac, LABEL_S_MAC, hostChallenge, cardChallenge);
  const sRmac = kdf128(authMac, LABEL_S_RMAC, hostChallenge, cardChallenge);
  return { sEnc, sMac, sRmac };
}
