import { randomBytes } from "node:crypto";
import { cardCryptogram, hostCryptogram, macApdu } from "./scp03/crypto.js";
import { deriveSessionKeys, type SessionKeys } from "./scp03/kdf.js";
import { unwrapSessionResponse, wrapSessionMessage } from "./scp03/wrap.js";
import type { HsmTransport } from "./transport/types.js";
import { decodeResponse, encodeApdu } from "./wire/apdu.js";

export type Scp03State = "INIT" | "SECURE_CHANNEL" | "CLOSED";

const CMD_CREATE_SESSION = 0x03;
const CMD_AUTHENTICATE_SESSION = 0x04;
const CMD_SESSION_MESSAGE = 0x05;
const CMD_CLOSE_SESSION = 0x40;

export type ChallengeSource = () => Uint8Array;

export interface OpenSessionOptions {
  readonly transport: HsmTransport;
  readonly authKeyId: number;
  readonly authEnc: Uint8Array;
  readonly authMac: Uint8Array;
  readonly challengeSource?: ChallengeSource;
}

export interface Scp03Session {
  readonly id: number;
  readonly state: Scp03State;
  sendCommand(innerCmd: number, data: Uint8Array): Promise<Uint8Array>;
  close(): Promise<void>;
}

export async function openSession(opts: OpenSessionOptions): Promise<Scp03Session> {
  if (opts.authKeyId < 0 || opts.authKeyId > 0xffff) {
    throw new Error(`authKeyId out of range: ${opts.authKeyId}`);
  }
  const hostChallenge = opts.challengeSource
    ? opts.challengeSource()
    : new Uint8Array(randomBytes(8));
  if (hostChallenge.length !== 8) {
    throw new Error(`hostChallenge must be 8 bytes, got ${hostChallenge.length}`);
  }

  const createPayload = new Uint8Array(2 + 8);
  createPayload[0] = (opts.authKeyId >> 8) & 0xff;
  createPayload[1] = opts.authKeyId & 0xff;
  createPayload.set(hostChallenge, 2);

  const rsp1 = decodeResponse(
    await opts.transport.send(encodeApdu(CMD_CREATE_SESSION, createPayload)),
  );
  if (rsp1.kind !== "ok") {
    throw new Error(`CREATE_SESSION failed: ${rsp1.code}`);
  }
  if (rsp1.data.length !== 1 + 8 + 8) {
    throw new Error(`CREATE_SESSION response bad length: ${rsp1.data.length}`);
  }
  const sessionId = rsp1.data[0]!;
  const cardChallenge = rsp1.data.subarray(1, 9);
  const cardCryptogramFromCard = rsp1.data.subarray(9, 17);

  const keys: SessionKeys = deriveSessionKeys(
    opts.authEnc,
    opts.authMac,
    hostChallenge,
    cardChallenge,
  );
  const expectedCardCryptogram = cardCryptogram(keys.sMac, hostChallenge, cardChallenge);
  if (!timingSafeEqual(expectedCardCryptogram, cardCryptogramFromCard)) {
    throw new Error("AUTH_FAIL: card cryptogram mismatch");
  }
  const hc = hostCryptogram(keys.sMac, hostChallenge, cardChallenge);

  const authBody = new Uint8Array(1 + 8);
  authBody[0] = sessionId;
  authBody.set(hc, 1);
  const macInput = encodeApdu(CMD_AUTHENTICATE_SESSION, authBody);
  const { mac, newIcv } = macApdu(keys.sMac, new Uint8Array(16), macInput);

  const authPayload = new Uint8Array(1 + 8 + 8);
  authPayload.set(authBody, 0);
  authPayload.set(mac, 9);

  const rsp2 = decodeResponse(
    await opts.transport.send(encodeApdu(CMD_AUTHENTICATE_SESSION, authPayload)),
  );
  if (rsp2.kind !== "ok") {
    throw new Error(`AUTHENTICATE_SESSION failed: ${rsp2.code}`);
  }

  let state: Scp03State = "SECURE_CHANNEL";
  let icv = newIcv;
  let counter = 0;

  return {
    id: sessionId,
    get state() {
      return state;
    },
    async sendCommand(innerCmd, data) {
      if (state !== "SECURE_CHANNEL") {
        throw new Error(`invalid state: ${state}`);
      }
      const innerApdu = encodeApdu(innerCmd, data);
      const wrap = wrapSessionMessage({
        sEnc: keys.sEnc,
        sMac: keys.sMac,
        icv,
        counter,
        sessionId,
        inner: innerApdu,
      });
      counter = wrap.counter;
      icv = wrap.newIcv;
      const outer = decodeResponse(
        await opts.transport.send(encodeApdu(CMD_SESSION_MESSAGE, wrap.wrapped)),
      );
      if (outer.kind !== "ok") {
        throw new Error(`SESSION_MESSAGE failed: ${outer.code}`);
      }
      const { inner } = unwrapSessionResponse({
        sEnc: keys.sEnc,
        sRmac: keys.sRmac,
        icv,
        counter,
        wrapped: outer.data,
      });
      const innerRsp = decodeResponse(inner);
      if (innerRsp.kind !== "ok") {
        throw new Error(`inner command 0x${innerCmd.toString(16)} failed: ${innerRsp.code}`);
      }
      if (innerRsp.responseCmd !== (0x80 | innerCmd)) {
        throw new Error(
          `inner response cmd mismatch: expected ${0x80 | innerCmd}, got ${innerRsp.responseCmd}`,
        );
      }
      return innerRsp.data;
    },
    async close() {
      if (state === "CLOSED") {
        return;
      }
      await opts.transport.send(encodeApdu(CMD_CLOSE_SESSION, new Uint8Array([sessionId])));
      state = "CLOSED";
    },
  };
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) {
    return false;
  }
  let r = 0;
  for (let i = 0; i < a.length; i++) {
    r |= a[i]! ^ b[i]!;
  }
  return r === 0;
}
