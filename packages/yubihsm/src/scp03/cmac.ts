import { ecb } from "@noble/ciphers/aes";

/**
 * AES-CMAC (NIST SP 800-38B / RFC 4493).
 *
 * Implemented on top of @noble/ciphers AES-ECB single-block encrypt, because
 * @noble/ciphers@1.3.0 does not export a `cmac` primitive directly.
 */

const BLOCK_SIZE = 16;
const RB = 0x87; // constant for 128-bit block

function encryptBlock(key: Uint8Array, block: Uint8Array): Uint8Array {
  // ECB with padding disabled encrypts exactly `block.length` bytes.
  return ecb(key, { disablePadding: true }).encrypt(block);
}

function leftShiftOne(input: Uint8Array): Uint8Array {
  const out = new Uint8Array(input.length);
  let carry = 0;
  for (let i = input.length - 1; i >= 0; i--) {
    const b = input[i]!;
    out[i] = ((b << 1) | carry) & 0xff;
    carry = (b & 0x80) >>> 7;
  }
  return out;
}

function deriveSubkeys(key: Uint8Array): { k1: Uint8Array; k2: Uint8Array } {
  const zero = new Uint8Array(BLOCK_SIZE);
  const l = encryptBlock(key, zero);
  const k1 = leftShiftOne(l);
  if ((l[0]! & 0x80) !== 0) {
    k1[BLOCK_SIZE - 1] = (k1[BLOCK_SIZE - 1]! ^ RB) & 0xff;
  }
  const k2 = leftShiftOne(k1);
  if ((k1[0]! & 0x80) !== 0) {
    k2[BLOCK_SIZE - 1] = (k2[BLOCK_SIZE - 1]! ^ RB) & 0xff;
  }
  return { k1, k2 };
}

function xorInto(dst: Uint8Array, a: Uint8Array, b: Uint8Array): void {
  for (let i = 0; i < dst.length; i++) {
    dst[i] = (a[i]! ^ b[i]!) & 0xff;
  }
}

export function aesCmac(key: Uint8Array, message: Uint8Array): Uint8Array {
  if (key.length !== 16 && key.length !== 24 && key.length !== 32) {
    throw new Error(`AES-CMAC key must be 16/24/32 bytes, got ${key.length}`);
  }
  const { k1, k2 } = deriveSubkeys(key);

  const n = Math.max(1, Math.ceil(message.length / BLOCK_SIZE));
  const lastComplete = message.length > 0 && message.length % BLOCK_SIZE === 0;

  // Build the last block (M_n) with appropriate subkey XOR.
  const lastBlock = new Uint8Array(BLOCK_SIZE);
  if (lastComplete) {
    const start = (n - 1) * BLOCK_SIZE;
    xorInto(lastBlock, message.subarray(start, start + BLOCK_SIZE), k1);
  } else {
    const start = (n - 1) * BLOCK_SIZE;
    const tail = message.subarray(start);
    const padded = new Uint8Array(BLOCK_SIZE);
    padded.set(tail);
    padded[tail.length] = 0x80; // 10* padding
    xorInto(lastBlock, padded, k2);
  }

  // CBC-MAC over M_1 .. M_{n-1}, then last block.
  let x: Uint8Array = new Uint8Array(BLOCK_SIZE);
  for (let i = 0; i < n - 1; i++) {
    const block = message.subarray(i * BLOCK_SIZE, (i + 1) * BLOCK_SIZE);
    const y = new Uint8Array(BLOCK_SIZE);
    xorInto(y, x, block);
    x = encryptBlock(key, y);
  }
  const yFinal = new Uint8Array(BLOCK_SIZE);
  xorInto(yFinal, x, lastBlock);
  return encryptBlock(key, yFinal);
}
