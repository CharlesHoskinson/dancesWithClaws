import {
  Algorithm,
  CapSet,
  decodeResponse,
  encodeApdu,
  ObjectType,
  type DomainSet,
} from "@dancesWithClaws/yubihsm";
import { macApdu, unwrapSessionResponse, wrapSessionMessage } from "@dancesWithClaws/yubihsm/scp03";
import { createPrivateKey, generateKeyPairSync, sign as cryptoSign } from "node:crypto";
import type { CommandHandler } from "./server.js";
import type { Store } from "./store.js";
import {
  createSessionManager,
  type SessionManager,
  type SessionManagerOptions,
} from "./sessions.js";

const CMD_CREATE_SESSION = 0x03;
const CMD_AUTHENTICATE_SESSION = 0x04;
const CMD_SESSION_MESSAGE = 0x05;
const CMD_DEVICE_INFO = 0x06;
const CMD_CLOSE_SESSION = 0x40;

const CMD_PUT_AUTHENTICATION_KEY = 0x44;
const CMD_GENERATE_ASYMMETRIC_KEY = 0x46;
const CMD_LIST_OBJECTS = 0x48;
const CMD_SIGN_ECDSA = 0x56;
const CMD_DELETE_OBJECT = 0x58;

const FILTER_TAG_ID = 0x01;
const FILTER_TAG_TYPE = 0x02;

const SCP03_AUTH_KEY_ALGO = 38;
const SCP03_KEY_LEN = 16;

const AUTO_KEY_ID_START = 0x0100;
const AUTO_KEY_ID_END = 0xfffe;
const LABEL_LEN = 40;

const FW_MAJOR = 2;
const FW_MINOR = 4;
const FW_PATCH = 0;
const DEVICE_SERIAL = 0x12345678;
const LOG_TOTAL = 62;
const LOG_USED = 0;
const SUPPORTED_ALGORITHMS = [43, 12, 46];

const ERR_INVALID_DATA = 2;
const ERR_INVALID_SESSION = 3;
const ERR_AUTH_FAIL = 4;
const ERR_SESSIONS_FULL = 5;
const ERR_OBJECT_NOT_FOUND = 11;
const ERR_GENERIC = 14;
const ERR_COMMAND_UNSUPPORTED = 16;

function errorFrame(code: number): Uint8Array {
  return new Uint8Array([0x7f, 0x00, 0x01, code]);
}

const ERR_STORAGE_FAILED = 7;
const ERR_OBJECT_EXISTS = 15;

function mapErrorCode(err: unknown): number {
  if (err instanceof Error) {
    switch (err.message) {
      case "AUTH_FAIL":
        return ERR_AUTH_FAIL;
      case "SESSIONS_FULL":
        return ERR_SESSIONS_FULL;
      case "INVALID_SESSION":
        return ERR_INVALID_SESSION;
      case "OBJECT_NOT_FOUND":
        return ERR_OBJECT_NOT_FOUND;
      case "INVALID_DATA":
        return ERR_INVALID_DATA;
      case "STORAGE_FULL":
        return ERR_STORAGE_FAILED;
      case "OBJECT_EXISTS":
        return ERR_OBJECT_EXISTS;
      default:
        return ERR_GENERIC;
    }
  }
  return ERR_GENERIC;
}

export interface StoreBackedHandlerOptions {
  readonly sessionManager?: SessionManagerOptions;
}

export function storeBackedHandler(
  store: Store,
  options: StoreBackedHandlerOptions = {},
): CommandHandler {
  const sm: SessionManager = createSessionManager(store, options.sessionManager);
  return (apdu) => {
    if (apdu.length < 3) {
      return errorFrame(ERR_INVALID_DATA);
    }
    const cmd = apdu[0]!;
    const data = apdu.subarray(3);
    try {
      if (cmd === CMD_DEVICE_INFO) {
        const algos = SUPPORTED_ALGORITHMS;
        const payload = new Uint8Array(9 + algos.length);
        payload[0] = FW_MAJOR;
        payload[1] = FW_MINOR;
        payload[2] = FW_PATCH;
        payload[3] = DEVICE_SERIAL & 0xff;
        payload[4] = (DEVICE_SERIAL >>> 8) & 0xff;
        payload[5] = (DEVICE_SERIAL >>> 16) & 0xff;
        payload[6] = (DEVICE_SERIAL >>> 24) & 0xff;
        payload[7] = LOG_TOTAL;
        payload[8] = LOG_USED;
        for (let i = 0; i < algos.length; i++) {
          payload[9 + i] = algos[i]!;
        }
        return encodeApdu(0x80 | CMD_DEVICE_INFO, payload);
      }
      if (cmd === CMD_CREATE_SESSION) {
        if (data.length !== 2 + 8) {
          return errorFrame(ERR_INVALID_DATA);
        }
        const authKeyId = (data[0]! << 8) | data[1]!;
        const hostChallenge = data.subarray(2, 10);
        const result = sm.createSession(authKeyId, hostChallenge);
        const payload = new Uint8Array(1 + 8 + 8);
        payload[0] = result.sessionId;
        payload.set(result.cardChallenge, 1);
        payload.set(result.cardCryptogram, 9);
        return encodeApdu(0x80 | CMD_CREATE_SESSION, payload);
      }
      if (cmd === CMD_AUTHENTICATE_SESSION) {
        if (data.length !== 1 + 8 + 8) {
          return errorFrame(ERR_INVALID_DATA);
        }
        const sessionId = data[0]!;
        const hostCrypto = data.subarray(1, 9);
        sm.authenticateSession(sessionId, hostCrypto);
        // Seed the inbound C-MAC chain with the same ICV the driver computes:
        // CMAC(sMac, zero-icv || encodeApdu(AUTH_SESSION, [sessionId, hostCrypto])).
        // Every subsequent wrapped command chains from this value.
        const session = sm.getSession(sessionId);
        if (session) {
          const authBody = new Uint8Array(1 + 8);
          authBody[0] = sessionId;
          authBody.set(hostCrypto, 1);
          const authApdu = encodeApdu(CMD_AUTHENTICATE_SESSION, authBody);
          const { newIcv } = macApdu(session.sMac, new Uint8Array(16), authApdu);
          session.icv = newIcv;
        }
        return encodeApdu(0x80 | CMD_AUTHENTICATE_SESSION, new Uint8Array(0));
      }
      if (cmd === CMD_CLOSE_SESSION) {
        if (data.length !== 1) {
          return errorFrame(ERR_INVALID_DATA);
        }
        sm.deleteSession(data[0]!);
        return encodeApdu(0x80 | CMD_CLOSE_SESSION, new Uint8Array(0));
      }
      if (cmd === CMD_SESSION_MESSAGE) {
        return handleSessionMessage(store, sm, data);
      }
      return errorFrame(ERR_COMMAND_UNSUPPORTED);
    } catch (e) {
      return errorFrame(mapErrorCode(e));
    }
  };
}

function handleSessionMessage(store: Store, sm: SessionManager, data: Uint8Array): Uint8Array {
  if (data.length < 1 + 16 + 8) {
    return errorFrame(ERR_INVALID_DATA);
  }
  const sessionId = data[0]!;
  const session = sm.getSession(sessionId);
  if (!session || !session.authenticated) {
    return errorFrame(ERR_INVALID_SESSION);
  }
  const incomingCounter = session.counter + 1;
  let innerFrame: Uint8Array;
  let newIcv: Uint8Array;
  try {
    // Commands inbound use the C-MAC key (S-MAC), not S-RMAC. The unwrap
    // primitive is symmetric under key choice — pass sMac as the "sRmac"
    // parameter so the MAC check verifies against the key the driver used
    // to produce the frame.
    const unwrapped = unwrapSessionResponse({
      sEnc: session.sEnc,
      sRmac: session.sMac,
      icv: session.icv,
      counter: incomingCounter,
      wrapped: data,
    });
    innerFrame = unwrapped.inner;
    newIcv = unwrapped.newIcv;
  } catch {
    return errorFrame(ERR_INVALID_DATA);
  }
  // Advance the command-ICV chain only after a successful verify+decrypt.
  session.icv = newIcv;
  session.counter = incomingCounter;

  const innerRsp = dispatchInner(store, innerFrame);

  // Response wrap uses S-RMAC (not S-MAC) as the MAC key and chains the
  // per-session response-ICV so the driver can verify frame ordering.
  const wrappedResp = wrapSessionMessage({
    sEnc: session.sEnc,
    sMac: session.sRmac,
    icv: session.responseIcv,
    counter: session.counter - 1,
    sessionId,
    inner: innerRsp,
  });
  session.responseIcv = wrappedResp.newIcv;
  return encodeApdu(0x80 | CMD_SESSION_MESSAGE, wrappedResp.wrapped);
}

function dispatchInner(store: Store, innerFrame: Uint8Array): Uint8Array {
  const parsed = decodeResponse(innerFrame);
  if (parsed.kind !== "ok") {
    return errorFrame(ERR_INVALID_DATA);
  }
  const innerCmd = parsed.responseCmd;
  const innerData = parsed.data;
  try {
    if (innerCmd === CMD_DELETE_OBJECT) {
      if (innerData.length !== 3) {
        return errorFrame(ERR_INVALID_DATA);
      }
      const objectId = (innerData[0]! << 8) | innerData[1]!;
      const objectType = innerData[2]!;
      if (objectType === ObjectType.AuthenticationKey) {
        if (!store.getAuthKey(objectId)) {
          return errorFrame(ERR_OBJECT_NOT_FOUND);
        }
        store.deleteAuthKey(objectId);
      } else {
        const existing = store.getObject(objectId);
        if (!existing || existing.type !== objectType) {
          return errorFrame(ERR_OBJECT_NOT_FOUND);
        }
        store.deleteObject(objectId);
      }
      return encodeApdu(0x80 | CMD_DELETE_OBJECT, new Uint8Array(0));
    }
    if (innerCmd === CMD_LIST_OBJECTS) {
      return handleListObjects(store, innerData);
    }
    if (innerCmd === CMD_GENERATE_ASYMMETRIC_KEY) {
      return handleGenerateAsymmetricKey(store, innerData);
    }
    if (innerCmd === CMD_SIGN_ECDSA) {
      return handleSignEcdsa(store, innerData);
    }
    if (innerCmd === CMD_PUT_AUTHENTICATION_KEY) {
      return handlePutAuthenticationKey(store, innerData);
    }
    return errorFrame(ERR_COMMAND_UNSUPPORTED);
  } catch (e) {
    return errorFrame(mapErrorCode(e));
  }
}

function allocateKeyId(store: Store, requested: number): number {
  if (requested !== 0) {
    if (store.getObject(requested)) {
      throw new Error("OBJECT_EXISTS");
    }
    return requested;
  }
  for (let id = AUTO_KEY_ID_START; id <= AUTO_KEY_ID_END; id++) {
    if (!store.getObject(id) && !store.getAuthKey(id)) {
      return id;
    }
  }
  throw new Error("STORAGE_FULL");
}

function readU16Be(buf: Uint8Array, offset: number): number {
  return (buf[offset]! << 8) | buf[offset + 1]!;
}

function readU64BeAsBigInt(buf: Uint8Array, offset: number): bigint {
  let v = 0n;
  for (let i = 0; i < 8; i++) {
    v = (v << 8n) | BigInt(buf[offset + i]!);
  }
  return v;
}

function readLabel(buf: Uint8Array, offset: number): string {
  const slice = buf.subarray(offset, offset + LABEL_LEN);
  let end = slice.length;
  while (end > 0 && slice[end - 1] === 0) {
    end--;
  }
  return new TextDecoder().decode(slice.subarray(0, end));
}

function handleGenerateAsymmetricKey(store: Store, data: Uint8Array): Uint8Array {
  if (data.length !== 2 + LABEL_LEN + 2 + 8 + 1) {
    return errorFrame(ERR_INVALID_DATA);
  }
  const requestedId = readU16Be(data, 0);
  const label = readLabel(data, 2);
  const domains = readU16Be(data, 2 + LABEL_LEN) as DomainSet;
  const capabilities = CapSet.fromBigint(readU64BeAsBigInt(data, 2 + LABEL_LEN + 2));
  const algorithm = data[2 + LABEL_LEN + 2 + 8]! as Algorithm;
  if (algorithm !== Algorithm.EcP256) {
    return errorFrame(ERR_INVALID_DATA);
  }
  let id: number;
  try {
    id = allocateKeyId(store, requestedId);
  } catch (e) {
    return errorFrame(mapErrorCode(e));
  }
  const { publicKey, privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
  const publicKeyBytes = publicKey.export({ format: "der", type: "spki" });
  const privateKeyBytes = privateKey.export({ format: "der", type: "pkcs8" });
  store.putObject({
    id,
    type: ObjectType.AsymmetricKey,
    algorithm,
    label,
    capabilities,
    delegatedCapabilities: CapSet.empty(),
    domains,
    publicKey: new Uint8Array(publicKeyBytes),
    secret: new Uint8Array(privateKeyBytes),
  });
  return encodeApdu(
    0x80 | CMD_GENERATE_ASYMMETRIC_KEY,
    new Uint8Array([(id >> 8) & 0xff, id & 0xff]),
  );
}

function handleSignEcdsa(store: Store, data: Uint8Array): Uint8Array {
  if (data.length < 3) {
    return errorFrame(ERR_INVALID_DATA);
  }
  const keyId = readU16Be(data, 0);
  const digest = data.subarray(2);
  const obj = store.getObject(keyId);
  if (!obj || obj.type !== ObjectType.AsymmetricKey || !obj.secret) {
    return errorFrame(ERR_OBJECT_NOT_FOUND);
  }
  if (obj.algorithm !== Algorithm.EcP256) {
    return errorFrame(ERR_INVALID_DATA);
  }
  const privateKey = createPrivateKey({
    key: Buffer.from(obj.secret),
    format: "der",
    type: "pkcs8",
  });
  const signature = cryptoSign(null, Buffer.from(digest), { key: privateKey, dsaEncoding: "der" });
  return encodeApdu(0x80 | CMD_SIGN_ECDSA, new Uint8Array(signature));
}

function handlePutAuthenticationKey(store: Store, data: Uint8Array): Uint8Array {
  const expectedLen = 2 + LABEL_LEN + 2 + 8 + 1 + 8 + SCP03_KEY_LEN + SCP03_KEY_LEN;
  if (data.length !== expectedLen) {
    return errorFrame(ERR_INVALID_DATA);
  }
  let offset = 0;
  const requestedId = readU16Be(data, offset);
  offset += 2;
  const label = readLabel(data, offset);
  offset += LABEL_LEN;
  const domains = readU16Be(data, offset) as DomainSet;
  offset += 2;
  const capabilities = CapSet.fromBigint(readU64BeAsBigInt(data, offset));
  offset += 8;
  const algorithm = data[offset]!;
  offset += 1;
  if (algorithm !== SCP03_AUTH_KEY_ALGO) {
    return errorFrame(ERR_INVALID_DATA);
  }
  const delegatedCapabilities = CapSet.fromBigint(readU64BeAsBigInt(data, offset));
  offset += 8;
  const encKey = data.subarray(offset, offset + SCP03_KEY_LEN);
  offset += SCP03_KEY_LEN;
  const macKey = data.subarray(offset, offset + SCP03_KEY_LEN);

  let id: number;
  try {
    id = allocateAuthKeyId(store, requestedId);
  } catch (e) {
    return errorFrame(mapErrorCode(e));
  }

  store.putAuthKey({
    id,
    capabilities,
    delegatedCapabilities,
    domains,
    label,
    encKey: new Uint8Array(encKey),
    macKey: new Uint8Array(macKey),
  });
  return encodeApdu(
    0x80 | CMD_PUT_AUTHENTICATION_KEY,
    new Uint8Array([(id >> 8) & 0xff, id & 0xff]),
  );
}

interface ListFilter {
  id?: number;
  type?: number;
}

function parseListFilter(data: Uint8Array): ListFilter | null {
  const filter: ListFilter = {};
  let i = 0;
  while (i < data.length) {
    const tag = data[i]!;
    if (tag === FILTER_TAG_ID) {
      if (i + 3 > data.length) {
        return null;
      }
      filter.id = (data[i + 1]! << 8) | data[i + 2]!;
      i += 3;
    } else if (tag === FILTER_TAG_TYPE) {
      if (i + 2 > data.length) {
        return null;
      }
      filter.type = data[i + 1]!;
      i += 2;
    } else {
      return null;
    }
  }
  return filter;
}

function handleListObjects(store: Store, data: Uint8Array): Uint8Array {
  const filter = parseListFilter(data);
  if (!filter) {
    return errorFrame(ERR_INVALID_DATA);
  }
  const candidates: Array<{ id: number; type: number }> = [];
  if (filter.type === undefined || filter.type === ObjectType.AuthenticationKey) {
    for (const entry of store.listAuthKeys()) {
      if (filter.id !== undefined && filter.id !== entry.id) {
        continue;
      }
      candidates.push({ id: entry.id, type: ObjectType.AuthenticationKey });
    }
  }
  if (filter.type !== ObjectType.AuthenticationKey) {
    for (const entry of store.listObjects()) {
      if (filter.type !== undefined && filter.type !== entry.type) {
        continue;
      }
      if (filter.id !== undefined && filter.id !== entry.id) {
        continue;
      }
      candidates.push({ id: entry.id, type: entry.type });
    }
  }
  const payload = new Uint8Array(candidates.length * 4);
  for (let i = 0; i < candidates.length; i++) {
    const e = candidates[i]!;
    payload[i * 4] = (e.id >> 8) & 0xff;
    payload[i * 4 + 1] = e.id & 0xff;
    payload[i * 4 + 2] = e.type;
    payload[i * 4 + 3] = 0;
  }
  return encodeApdu(0x80 | CMD_LIST_OBJECTS, payload);
}

function allocateAuthKeyId(store: Store, requested: number): number {
  if (requested !== 0) {
    if (store.getAuthKey(requested)) {
      throw new Error("OBJECT_EXISTS");
    }
    return requested;
  }
  for (let id = AUTO_KEY_ID_START; id <= AUTO_KEY_ID_END; id++) {
    if (!store.getObject(id) && !store.getAuthKey(id)) {
      return id;
    }
  }
  throw new Error("STORAGE_FULL");
}
