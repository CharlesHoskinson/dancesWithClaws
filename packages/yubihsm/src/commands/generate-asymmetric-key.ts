import type { Scp03Session } from "../session.js";
import type { Algorithm } from "../types/algorithm.js";
import type { CapSetT } from "../types/capability.js";
import type { DomainSet } from "../types/domain.js";

const CMD_GENERATE_ASYMMETRIC_KEY = 0x46;
const LABEL_LEN = 40;

export interface GenerateAsymmetricKeyOptions {
  readonly keyId?: number;
  readonly label: string;
  readonly domains: DomainSet;
  readonly capabilities: CapSetT;
  readonly algorithm: Algorithm;
}

export interface GenerateAsymmetricKeyResult {
  readonly keyId: number;
}

export async function generateAsymmetricKey(
  session: Scp03Session,
  opts: GenerateAsymmetricKeyOptions,
): Promise<GenerateAsymmetricKeyResult> {
  const keyId = opts.keyId ?? 0;
  if (keyId < 0 || keyId > 0xffff) {
    throw new Error(`keyId out of range: ${keyId}`);
  }
  const labelBytes = new TextEncoder().encode(opts.label);
  if (labelBytes.length > LABEL_LEN) {
    throw new Error(`label too long: ${labelBytes.length} > ${LABEL_LEN}`);
  }
  const payload = new Uint8Array(2 + LABEL_LEN + 2 + 8 + 1);
  payload[0] = (keyId >> 8) & 0xff;
  payload[1] = keyId & 0xff;
  payload.set(labelBytes, 2);
  const domains = opts.domains & 0xffff;
  payload[2 + LABEL_LEN] = (domains >> 8) & 0xff;
  payload[2 + LABEL_LEN + 1] = domains & 0xff;
  let caps = BigInt.asUintN(64, opts.capabilities);
  for (let i = 7; i >= 0; i--) {
    payload[2 + LABEL_LEN + 2 + i] = Number(caps & 0xffn);
    caps >>= 8n;
  }
  payload[2 + LABEL_LEN + 2 + 8] = opts.algorithm;
  const rsp = await session.sendCommand(CMD_GENERATE_ASYMMETRIC_KEY, payload);
  if (rsp.length !== 2) {
    throw new Error(`generateAsymmetricKey bad response length: ${rsp.length}`);
  }
  const returnedKeyId = (rsp[0]! << 8) | rsp[1]!;
  return { keyId: returnedKeyId };
}
