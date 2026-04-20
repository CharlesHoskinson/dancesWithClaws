import { describe, it, expect } from "vitest";
import { encodeApdu, decodeResponse, ResponseError } from "../../src/wire/apdu.js";

describe("APDU framing", () => {
  it("encodes command byte + length + data", () => {
    const apdu = encodeApdu(0x06, new Uint8Array([0xaa, 0xbb]));
    expect([...apdu]).toEqual([0x06, 0x00, 0x02, 0xaa, 0xbb]);
  });

  it("encodes zero-length payload", () => {
    const apdu = encodeApdu(0x06, new Uint8Array(0));
    expect([...apdu]).toEqual([0x06, 0x00, 0x00]);
  });

  it("decodes success response (cmd | 0x80)", () => {
    const buf = new Uint8Array([0x86, 0x00, 0x03, 0x01, 0x02, 0x03]);
    const r = decodeResponse(buf);
    expect(r.kind).toBe("ok");
    if (r.kind === "ok") {
      expect(r.responseCmd).toBe(0x86);
      expect([...r.data]).toEqual([0x01, 0x02, 0x03]);
    }
  });

  it("decodes error response", () => {
    const buf = new Uint8Array([0x7f, 0x00, 0x01, 0x0c]);
    const r = decodeResponse(buf);
    expect(r.kind).toBe("err");
    if (r.kind === "err") {
      expect(r.code).toBe(ResponseError.InvalidId);
    }
  });

  it("rejects truncated frame", () => {
    expect(() => decodeResponse(new Uint8Array([0x86, 0x00]))).toThrow(/truncated/i);
  });

  it("rejects length mismatch", () => {
    expect(() => decodeResponse(new Uint8Array([0x86, 0x00, 0x05, 0x01]))).toThrow(/length/i);
  });

  it("rejects cmd out of range", () => {
    expect(() => encodeApdu(0x100, new Uint8Array(0))).toThrow(/cmd/i);
    expect(() => encodeApdu(-1, new Uint8Array(0))).toThrow(/cmd/i);
  });

  it("rejects data too long", () => {
    expect(() => encodeApdu(0x06, new Uint8Array(0x10000))).toThrow(/data too long/i);
  });
});
