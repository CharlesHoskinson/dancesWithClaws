import type { Scp03Session } from "../session.js";
import type { Algorithm } from "../types/algorithm.js";
import type { DomainSet } from "../types/domain.js";
import type { ObjectType } from "../types/object.js";
import { CapSet, type CapSetT } from "../types/capability.js";

const CMD_GET_OBJECT_INFO = 0x4e;
const LABEL_LEN = 40;
// Response layout (big-endian throughout):
//   capabilities (8) | id (2) | length (2) | domains (2) | type (1)
//   | algorithm (1) | sequence (1) | origin (1) | label (40)
//   | delegated_capabilities (8)
const RESPONSE_LEN = 8 + 2 + 2 + 2 + 1 + 1 + 1 + 1 + LABEL_LEN + 8;

export interface ObjectInfo {
  readonly capabilities: CapSetT;
  readonly id: number;
  readonly length: number;
  readonly domains: DomainSet;
  readonly type: ObjectType;
  readonly algorithm: Algorithm;
  readonly sequence: number;
  readonly origin: number;
  readonly label: string;
  readonly delegatedCapabilities: CapSetT;
}

function readU64BeAsBigInt(buf: Uint8Array, offset: number): bigint {
  let v = 0n;
  for (let i = 0; i < 8; i++) {
    v = (v << 8n) | BigInt(buf[offset + i]!);
  }
  return v;
}

function readU16Be(buf: Uint8Array, offset: number): number {
  return (buf[offset]! << 8) | buf[offset + 1]!;
}

function readLabel(buf: Uint8Array, offset: number): string {
  const slice = buf.subarray(offset, offset + LABEL_LEN);
  let end = slice.length;
  while (end > 0 && slice[end - 1] === 0) {
    end--;
  }
  return new TextDecoder().decode(slice.subarray(0, end));
}

export async function getObjectInfo(
  session: Scp03Session,
  objectId: number,
  objectType: ObjectType,
): Promise<ObjectInfo> {
  if (objectId < 0 || objectId > 0xffff) {
    throw new Error(`objectId out of range: ${objectId}`);
  }
  const payload = new Uint8Array(3);
  payload[0] = (objectId >> 8) & 0xff;
  payload[1] = objectId & 0xff;
  payload[2] = objectType;
  const rsp = await session.sendCommand(CMD_GET_OBJECT_INFO, payload);
  if (rsp.length !== RESPONSE_LEN) {
    throw new Error(`getObjectInfo bad response length: ${rsp.length} (expected ${RESPONSE_LEN})`);
  }
  let off = 0;
  const capabilities = CapSet.fromBigint(readU64BeAsBigInt(rsp, off));
  off += 8;
  const id = readU16Be(rsp, off);
  off += 2;
  const length = readU16Be(rsp, off);
  off += 2;
  const domains = readU16Be(rsp, off) as DomainSet;
  off += 2;
  const type = rsp[off]! as ObjectType;
  off += 1;
  const algorithm = rsp[off]! as Algorithm;
  off += 1;
  const sequence = rsp[off]!;
  off += 1;
  const origin = rsp[off]!;
  off += 1;
  const label = readLabel(rsp, off);
  off += LABEL_LEN;
  const delegatedCapabilities = CapSet.fromBigint(readU64BeAsBigInt(rsp, off));
  return {
    capabilities,
    id,
    length,
    domains,
    type,
    algorithm,
    sequence,
    origin,
    label,
    delegatedCapabilities,
  };
}
