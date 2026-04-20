import type { Scp03Session } from "../session.js";
import type { CapSetT } from "../types/capability.js";
import type { DomainSet } from "../types/domain.js";

const CMD_PUT_AUTHENTICATION_KEY = 0x44;
const LABEL_LEN = 40;
const SCP03_AUTH_KEY_ALGO = 38;
const SCP03_KEY_LEN = 16;

export interface PutAuthenticationKeyOptions {
  readonly keyId: number;
  readonly label: string;
  readonly domains: DomainSet;
  readonly capabilities: CapSetT;
  readonly delegatedCapabilities: CapSetT;
  readonly encKey: Uint8Array;
  readonly macKey: Uint8Array;
}

export interface PutAuthenticationKeyResult {
  readonly keyId: number;
}

function writeCapsBigEndian(dst: Uint8Array, offset: number, caps: CapSetT): void {
  let v = BigInt.asUintN(64, caps);
  for (let i = 7; i >= 0; i--) {
    dst[offset + i] = Number(v & 0xffn);
    v >>= 8n;
  }
}

export async function putAuthenticationKey(
  session: Scp03Session,
  opts: PutAuthenticationKeyOptions,
): Promise<PutAuthenticationKeyResult> {
  if (opts.keyId < 1 || opts.keyId > 0xfffe) {
    throw new Error(`keyId out of range: ${opts.keyId}`);
  }
  if (opts.encKey.length !== SCP03_KEY_LEN) {
    throw new Error(`encKey must be ${SCP03_KEY_LEN} bytes, got ${opts.encKey.length}`);
  }
  if (opts.macKey.length !== SCP03_KEY_LEN) {
    throw new Error(`macKey must be ${SCP03_KEY_LEN} bytes, got ${opts.macKey.length}`);
  }
  const labelBytes = new TextEncoder().encode(opts.label);
  if (labelBytes.length > LABEL_LEN) {
    throw new Error(`label too long: ${labelBytes.length} > ${LABEL_LEN}`);
  }
  const payload = new Uint8Array(2 + LABEL_LEN + 2 + 8 + 1 + 8 + 16 + 16);
  let offset = 0;
  payload[offset++] = (opts.keyId >> 8) & 0xff;
  payload[offset++] = opts.keyId & 0xff;
  payload.set(labelBytes, offset);
  offset += LABEL_LEN;
  payload[offset++] = (opts.domains >> 8) & 0xff;
  payload[offset++] = opts.domains & 0xff;
  writeCapsBigEndian(payload, offset, opts.capabilities);
  offset += 8;
  payload[offset++] = SCP03_AUTH_KEY_ALGO;
  writeCapsBigEndian(payload, offset, opts.delegatedCapabilities);
  offset += 8;
  payload.set(opts.encKey, offset);
  offset += 16;
  payload.set(opts.macKey, offset);
  const rsp = await session.sendCommand(CMD_PUT_AUTHENTICATION_KEY, payload);
  if (rsp.length !== 2) {
    throw new Error(`putAuthenticationKey bad response length: ${rsp.length}`);
  }
  return { keyId: (rsp[0]! << 8) | rsp[1]! };
}
