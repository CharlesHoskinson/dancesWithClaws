import { Algorithm, CapSet, Capability, domainSetOf, ObjectType } from "@dancesWithClaws/yubihsm";
import { describe, it, expect } from "vitest";
import { createStore } from "../src/store.js";

function seedAuth(
  store: ReturnType<typeof createStore>,
  opts: { id: number; caps: bigint; domains: number[] },
) {
  return store.putAuthKey({
    id: opts.id,
    label: "k",
    capabilities: opts.caps as never,
    delegatedCapabilities: CapSet.empty(),
    domains: domainSetOf(...opts.domains),
    encKey: new Uint8Array(16),
    macKey: new Uint8Array(16),
  });
}

function seedTarget(
  store: ReturnType<typeof createStore>,
  opts: { id: number; caps: bigint; domains: number[] },
) {
  return store.putObject({
    id: opts.id,
    type: ObjectType.AsymmetricKey,
    algorithm: Algorithm.EcP256,
    label: "signer",
    capabilities: opts.caps as never,
    delegatedCapabilities: CapSet.empty(),
    domains: domainSetOf(...opts.domains),
  });
}

describe("simulator object store", () => {
  it("allows authorized sign", () => {
    const store = createStore();
    const auth = seedAuth(store, { id: 2, caps: CapSet.of(Capability.SignEcdsa), domains: [1] });
    const target = seedTarget(store, {
      id: 100,
      caps: CapSet.of(Capability.SignEcdsa),
      domains: [1],
    });
    expect(store.canAuthorize(auth.id, CapSet.of(Capability.SignEcdsa), target.id)).toBe(true);
  });

  it("denies when authKey lacks capability", () => {
    const store = createStore();
    const auth = seedAuth(store, { id: 3, caps: CapSet.of(Capability.WrapData), domains: [1] });
    const target = seedTarget(store, {
      id: 101,
      caps: CapSet.of(Capability.SignEcdsa),
      domains: [1],
    });
    expect(store.canAuthorize(auth.id, CapSet.of(Capability.SignEcdsa), target.id)).toBe(false);
  });

  it("denies when target lacks capability", () => {
    const store = createStore();
    const auth = seedAuth(store, { id: 4, caps: CapSet.of(Capability.SignEcdsa), domains: [1] });
    const target = seedTarget(store, {
      id: 102,
      caps: CapSet.of(Capability.WrapData),
      domains: [1],
    });
    expect(store.canAuthorize(auth.id, CapSet.of(Capability.SignEcdsa), target.id)).toBe(false);
  });

  it("denies when domains do not overlap", () => {
    const store = createStore();
    const auth = seedAuth(store, { id: 5, caps: CapSet.of(Capability.SignEcdsa), domains: [1] });
    const target = seedTarget(store, {
      id: 103,
      caps: CapSet.of(Capability.SignEcdsa),
      domains: [2],
    });
    expect(store.canAuthorize(auth.id, CapSet.of(Capability.SignEcdsa), target.id)).toBe(false);
  });

  it("denies when object or authKey is missing", () => {
    const store = createStore();
    expect(store.canAuthorize(999, CapSet.of(Capability.SignEcdsa), 100)).toBe(false);
  });

  it("deleteObject removes an object", () => {
    const store = createStore();
    seedTarget(store, { id: 200, caps: CapSet.of(Capability.SignEcdsa), domains: [1] });
    expect(store.deleteObject(200)).toBe(true);
    expect(store.getObject(200)).toBeUndefined();
  });

  it("rejects auth key with wrong encKey length", () => {
    const store = createStore();
    expect(() =>
      store.putAuthKey({
        id: 9,
        label: "bad",
        capabilities: CapSet.empty(),
        delegatedCapabilities: CapSet.empty(),
        domains: domainSetOf(1),
        encKey: new Uint8Array(15),
        macKey: new Uint8Array(16),
      }),
    ).toThrow(/encKey must be 16 bytes/);
  });
});

describe("simulator auth-key admin authorization", () => {
  it("admin with delegated caps covering target can perform admin op", () => {
    const store = createStore();
    const admin = store.putAuthKey({
      id: 2,
      label: "admin",
      capabilities: CapSet.of(Capability.DeleteAuthenticationKey),
      delegatedCapabilities: CapSet.of(Capability.SignEcdsa, Capability.WrapData),
      domains: domainSetOf(1),
      encKey: new Uint8Array(16),
      macKey: new Uint8Array(16),
    });
    const target = store.putAuthKey({
      id: 10,
      label: "plugin",
      capabilities: CapSet.of(Capability.SignEcdsa),
      delegatedCapabilities: CapSet.empty(),
      domains: domainSetOf(1),
      encKey: new Uint8Array(16),
      macKey: new Uint8Array(16),
    });
    expect(
      store.canAuthorizeAuthKeyAdmin(
        admin.id,
        CapSet.of(Capability.DeleteAuthenticationKey),
        target.id,
      ),
    ).toBe(true);
  });

  it("admin without target's capability in delegated set cannot perform admin op", () => {
    const store = createStore();
    store.putAuthKey({
      id: 2,
      label: "admin",
      capabilities: CapSet.of(Capability.DeleteAuthenticationKey),
      delegatedCapabilities: CapSet.of(Capability.WrapData),
      domains: domainSetOf(1),
      encKey: new Uint8Array(16),
      macKey: new Uint8Array(16),
    });
    store.putAuthKey({
      id: 10,
      label: "plugin",
      capabilities: CapSet.of(Capability.SignEcdsa),
      delegatedCapabilities: CapSet.empty(),
      domains: domainSetOf(1),
      encKey: new Uint8Array(16),
      macKey: new Uint8Array(16),
    });
    expect(
      store.canAuthorizeAuthKeyAdmin(2, CapSet.of(Capability.DeleteAuthenticationKey), 10),
    ).toBe(false);
  });

  it("admin without the admin capability in its own caps cannot perform admin op", () => {
    const store = createStore();
    store.putAuthKey({
      id: 2,
      label: "admin",
      capabilities: CapSet.of(Capability.SignEcdsa),
      delegatedCapabilities: CapSet.of(Capability.SignEcdsa),
      domains: domainSetOf(1),
      encKey: new Uint8Array(16),
      macKey: new Uint8Array(16),
    });
    store.putAuthKey({
      id: 10,
      label: "target",
      capabilities: CapSet.of(Capability.SignEcdsa),
      delegatedCapabilities: CapSet.empty(),
      domains: domainSetOf(1),
      encKey: new Uint8Array(16),
      macKey: new Uint8Array(16),
    });
    expect(
      store.canAuthorizeAuthKeyAdmin(2, CapSet.of(Capability.DeleteAuthenticationKey), 10),
    ).toBe(false);
  });

  it("admin-on-authKey requires domain overlap", () => {
    const store = createStore();
    store.putAuthKey({
      id: 2,
      label: "admin",
      capabilities: CapSet.of(Capability.DeleteAuthenticationKey),
      delegatedCapabilities: CapSet.of(Capability.SignEcdsa),
      domains: domainSetOf(1),
      encKey: new Uint8Array(16),
      macKey: new Uint8Array(16),
    });
    store.putAuthKey({
      id: 10,
      label: "target",
      capabilities: CapSet.of(Capability.SignEcdsa),
      delegatedCapabilities: CapSet.empty(),
      domains: domainSetOf(2),
      encKey: new Uint8Array(16),
      macKey: new Uint8Array(16),
    });
    expect(
      store.canAuthorizeAuthKeyAdmin(2, CapSet.of(Capability.DeleteAuthenticationKey), 10),
    ).toBe(false);
  });
});
