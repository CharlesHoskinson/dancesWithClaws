import type { Scp03Session } from "../session.js";

const CMD_SIGN_ECDSA = 0x56;

export async function signEcdsa(
  session: Scp03Session,
  keyId: number,
  digest: Uint8Array,
): Promise<Uint8Array> {
  if (keyId < 1 || keyId > 0xfffe) {
    throw new Error(`keyId out of range: ${keyId}`);
  }
  if (digest.length === 0 || digest.length > 64) {
    throw new Error(`digest length out of range: ${digest.length}`);
  }
  const payload = new Uint8Array(2 + digest.length);
  payload[0] = (keyId >> 8) & 0xff;
  payload[1] = keyId & 0xff;
  payload.set(digest, 2);
  return session.sendCommand(CMD_SIGN_ECDSA, payload);
}
