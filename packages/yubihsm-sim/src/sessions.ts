import { randomBytes } from "node:crypto";
import { cardCryptogram, deriveSessionKeys, hostCryptogram } from "@dancesWithClaws/yubihsm/scp03";
import type { Store } from "./store.js";

export interface SessionState {
  id: number;
  authKeyId: number;
  hostChallenge: Uint8Array;
  cardChallenge: Uint8Array;
  sEnc: Uint8Array;
  sMac: Uint8Array;
  sRmac: Uint8Array;
  authenticated: boolean;
  icv: Uint8Array;
  counter: number;
  cardCryptogram: Uint8Array;
}

export interface CreateSessionResult {
  sessionId: number;
  cardChallenge: Uint8Array;
  cardCryptogram: Uint8Array;
}

export interface SessionManager {
  createSession(authKeyId: number, hostChallenge: Uint8Array): CreateSessionResult;
  authenticateSession(sessionId: number, hostCryptogramFromHost: Uint8Array): void;
  getSession(id: number): SessionState | undefined;
  deleteSession(id: number): void;
  activeCount(): number;
}

export type CardChallengeSource = () => Uint8Array;

export interface SessionManagerOptions {
  readonly cardChallengeSource?: CardChallengeSource;
}

const MAX_SESSIONS = 16;

export function createSessionManager(
  store: Store,
  options: SessionManagerOptions = {},
): SessionManager {
  const sessions = new Map<number, SessionState>();
  let nextId = 0;

  function allocate(): number {
    if (sessions.size >= MAX_SESSIONS) {
      throw new Error("SESSIONS_FULL");
    }
    for (let i = 0; i < MAX_SESSIONS; i++) {
      const id = (nextId + i) % MAX_SESSIONS;
      if (!sessions.has(id)) {
        nextId = (id + 1) % MAX_SESSIONS;
        return id;
      }
    }
    throw new Error("SESSIONS_FULL");
  }

  return {
    createSession(authKeyId, hostChallenge) {
      if (hostChallenge.length !== 8) {
        throw new Error("INVALID_DATA");
      }
      const auth = store.getAuthKey(authKeyId);
      if (!auth) {
        throw new Error("OBJECT_NOT_FOUND");
      }
      const cardChallenge = options.cardChallengeSource
        ? options.cardChallengeSource()
        : new Uint8Array(randomBytes(8));
      if (cardChallenge.length !== 8) {
        throw new Error(`cardChallenge must be 8 bytes, got ${cardChallenge.length}`);
      }
      const keys = deriveSessionKeys(auth.encKey, auth.macKey, hostChallenge, cardChallenge);
      const cc = cardCryptogram(keys.sMac, hostChallenge, cardChallenge);
      const id = allocate();
      sessions.set(id, {
        id,
        authKeyId,
        hostChallenge: hostChallenge.slice(),
        cardChallenge,
        sEnc: keys.sEnc,
        sMac: keys.sMac,
        sRmac: keys.sRmac,
        authenticated: false,
        icv: new Uint8Array(16),
        counter: 0,
        cardCryptogram: cc,
      });
      return { sessionId: id, cardChallenge, cardCryptogram: cc };
    },
    authenticateSession(id, hostCryptogramFromHost) {
      const s = sessions.get(id);
      if (!s) {
        throw new Error("INVALID_SESSION");
      }
      const expected = hostCryptogram(s.sMac, s.hostChallenge, s.cardChallenge);
      if (!timingSafeEqual(expected, hostCryptogramFromHost)) {
        throw new Error("AUTH_FAIL");
      }
      s.authenticated = true;
    },
    getSession(id) {
      return sessions.get(id);
    },
    deleteSession(id) {
      sessions.delete(id);
    },
    activeCount() {
      return sessions.size;
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
