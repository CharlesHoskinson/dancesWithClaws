import { describe, it, expect } from "vitest";
import { cardCryptogram, hostCryptogram, macApdu } from "../../src/scp03/crypto.js";

describe("SCP03 cryptograms", () => {
  const sMac = new Uint8Array(16).fill(0x50);
  const hostChal = new Uint8Array(8).fill(0x10);
  const cardChal = new Uint8Array(8).fill(0x20);

  it("card and host cryptograms are 8 bytes and different", () => {
    const c = cardCryptogram(sMac, hostChal, cardChal);
    const h = hostCryptogram(sMac, hostChal, cardChal);
    expect(c.length).toBe(8);
    expect(h.length).toBe(8);
    expect(Buffer.from(c).equals(Buffer.from(h))).toBe(false);
  });

  it("cryptograms are deterministic given same keys + challenges", () => {
    const c1 = cardCryptogram(sMac, hostChal, cardChal);
    const c2 = cardCryptogram(sMac, hostChal, cardChal);
    expect(Buffer.from(c1).equals(Buffer.from(c2))).toBe(true);
  });

  it("APDU MAC chains via sMac + previous MAC (icv)", () => {
    const icv = new Uint8Array(16);
    const apdu = new Uint8Array([0x06, 0x00, 0x02, 0xaa, 0xbb]);
    const { mac, newIcv } = macApdu(sMac, icv, apdu);
    expect(mac.length).toBe(8);
    expect(newIcv.length).toBe(16);
    expect(Buffer.from(newIcv).equals(Buffer.from(icv))).toBe(false);
  });

  it("APDU MAC chain differs on second APDU", () => {
    const apdu = new Uint8Array([0x06, 0x00, 0x02, 0xaa, 0xbb]);
    const step1 = macApdu(sMac, new Uint8Array(16), apdu);
    const step2 = macApdu(sMac, step1.newIcv, apdu);
    expect(Buffer.from(step1.mac).equals(Buffer.from(step2.mac))).toBe(false);
  });

  it("APDU MAC is sensitive to a single-bit flip in the key", () => {
    const icv = new Uint8Array(16);
    const apdu = new Uint8Array([0x06, 0x00, 0x02, 0xaa, 0xbb]);
    const base = macApdu(sMac, icv, apdu);
    const flipped = new Uint8Array(sMac);
    flipped[0] ^= 0x01;
    const other = macApdu(flipped, icv, apdu);
    expect(Buffer.from(base.mac).equals(Buffer.from(other.mac))).toBe(false);
  });

  it("APDU MAC is sensitive to a single-bit flip in the ICV", () => {
    const apdu = new Uint8Array([0x06, 0x00, 0x02, 0xaa, 0xbb]);
    const base = macApdu(sMac, new Uint8Array(16), apdu);
    const flippedIcv = new Uint8Array(16);
    flippedIcv[7] ^= 0x01;
    const other = macApdu(sMac, flippedIcv, apdu);
    expect(Buffer.from(base.mac).equals(Buffer.from(other.mac))).toBe(false);
  });

  it("APDU MAC is sensitive to a single-bit flip in the payload", () => {
    const icv = new Uint8Array(16);
    const apdu = new Uint8Array([0x06, 0x00, 0x02, 0xaa, 0xbb]);
    const base = macApdu(sMac, icv, apdu);
    const flipped = new Uint8Array(apdu);
    flipped[3] ^= 0x01;
    const other = macApdu(sMac, icv, flipped);
    expect(Buffer.from(base.mac).equals(Buffer.from(other.mac))).toBe(false);
  });
});
