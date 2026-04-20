import { CapSet, Capability, domainSetOf } from "@dancesWithClaws/yubihsm";
import { deriveSessionKeys, hostCryptogram } from "@dancesWithClaws/yubihsm/scp03";
import { describe, it, expect } from "vitest";
import { createSessionManager } from "../src/sessions.js";
import { createStore } from "../src/store.js";

function seed() {
  const store = createStore();
  const encKey = new Uint8Array(16).fill(0x40);
  const macKey = new Uint8Array(16).fill(0x41);
  store.putAuthKey({
    id: 2,
    label: "admin",
    capabilities: CapSet.of(Capability.SignEcdsa),
    delegatedCapabilities: CapSet.empty(),
    domains: domainSetOf(1),
    encKey,
    macKey,
  });
  return { store, encKey, macKey };
}

describe("simulator session manager", () => {
  it("creates a session and authenticates with the correct host cryptogram", () => {
    const { store, encKey, macKey } = seed();
    const sm = createSessionManager(store);
    const hostChallenge = new Uint8Array(8).fill(0x10);
    const created = sm.createSession(2, hostChallenge);
    expect(created.sessionId).toBeGreaterThanOrEqual(0);
    expect(created.cardChallenge.length).toBe(8);
    expect(created.cardCryptogram.length).toBe(8);

    const keys = deriveSessionKeys(encKey, macKey, hostChallenge, created.cardChallenge);
    const expected = hostCryptogram(keys.sMac, hostChallenge, created.cardChallenge);
    expect(() => sm.authenticateSession(created.sessionId, expected)).not.toThrow();
    const s = sm.getSession(created.sessionId);
    expect(s?.authenticated).toBe(true);
  });

  it("rejects a wrong host cryptogram", () => {
    const { store } = seed();
    const sm = createSessionManager(store);
    const hostChallenge = new Uint8Array(8).fill(0x10);
    const created = sm.createSession(2, hostChallenge);
    expect(() => sm.authenticateSession(created.sessionId, new Uint8Array(8).fill(0xff))).toThrow(
      /AUTH_FAIL/,
    );
  });

  it("rejects create for unknown auth key", () => {
    const { store } = seed();
    const sm = createSessionManager(store);
    expect(() => sm.createSession(99, new Uint8Array(8))).toThrow(/OBJECT_NOT_FOUND/);
  });

  it("rejects create with wrong host-challenge length", () => {
    const { store } = seed();
    const sm = createSessionManager(store);
    expect(() => sm.createSession(2, new Uint8Array(7))).toThrow(/INVALID_DATA/);
  });

  it("deleteSession frees the slot", () => {
    const { store } = seed();
    const sm = createSessionManager(store);
    const created = sm.createSession(2, new Uint8Array(8));
    expect(sm.activeCount()).toBe(1);
    sm.deleteSession(created.sessionId);
    expect(sm.activeCount()).toBe(0);
  });

  it("caps at 16 concurrent sessions", () => {
    const { store } = seed();
    const sm = createSessionManager(store);
    for (let i = 0; i < 16; i++) {
      sm.createSession(2, new Uint8Array(8));
    }
    expect(() => sm.createSession(2, new Uint8Array(8))).toThrow(/SESSIONS_FULL/);
  });
});
