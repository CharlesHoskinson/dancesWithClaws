export const ResponseError = {
  Ok: 0,
  InvalidCommand: 1,
  InvalidData: 2,
  InvalidSession: 3,
  AuthFail: 4,
  SessionsFull: 5,
  SessionFailed: 6,
  StorageFailed: 7,
  WrongLength: 8,
  InsufficientPermissions: 9,
  LogFull: 10,
  ObjectNotFound: 11,
  InvalidId: 12,
  InvalidOtpData: 13,
  GenericError: 14,
  ObjectExists: 15,
  CommandUnsupported: 16,
} as const;

export type ResponseErrorCode = (typeof ResponseError)[keyof typeof ResponseError];

export type DecodedResponse =
  | { kind: "ok"; responseCmd: number; data: Uint8Array }
  | { kind: "err"; code: ResponseErrorCode };

export function encodeApdu(cmd: number, data: Uint8Array): Uint8Array {
  if (cmd < 0 || cmd > 0xff) {
    throw new Error(`cmd out of range: ${cmd}`);
  }
  if (data.length > 0xffff) {
    throw new Error(`data too long: ${data.length}`);
  }
  const out = new Uint8Array(3 + data.length);
  out[0] = cmd;
  out[1] = (data.length >> 8) & 0xff;
  out[2] = data.length & 0xff;
  out.set(data, 3);
  return out;
}

export function decodeResponse(buf: Uint8Array): DecodedResponse {
  if (buf.length < 3) {
    throw new Error("truncated response frame");
  }
  const cmd = buf[0]!;
  const len = (buf[1]! << 8) | buf[2]!;
  if (buf.length !== 3 + len) {
    throw new Error(`length mismatch: declared ${len}, actual ${buf.length - 3}`);
  }
  const data = buf.subarray(3);
  if (cmd === 0x7f) {
    if (data.length !== 1) {
      throw new Error(`error frame should carry 1-byte code, got ${data.length}`);
    }
    return { kind: "err", code: data[0]! as ResponseErrorCode };
  }
  return { kind: "ok", responseCmd: cmd, data };
}
