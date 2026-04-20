import {
  type Algorithm,
  CapSet,
  type CapSetT,
  type DomainSet,
  derivePasswordKeys,
  domainSetOf,
  domainsOverlap,
  hasAllCaps,
  intersectCaps,
  ObjectType,
  type ObjectType as ObjectTypeT,
} from "@dancesWithClaws/yubihsm";

export interface AuthKeyEntry {
  id: number;
  type: ObjectTypeT;
  label: string;
  capabilities: CapSetT;
  delegatedCapabilities: CapSetT;
  domains: DomainSet;
  encKey: Uint8Array;
  macKey: Uint8Array;
}

export interface ObjectEntry {
  id: number;
  type: ObjectTypeT;
  algorithm: Algorithm;
  label: string;
  capabilities: CapSetT;
  delegatedCapabilities: CapSetT;
  domains: DomainSet;
  secret?: Uint8Array;
  publicKey?: Uint8Array;
}

export interface PutAuthKeyInput {
  id: number;
  label: string;
  capabilities: CapSetT;
  delegatedCapabilities: CapSetT;
  domains: DomainSet;
  encKey: Uint8Array;
  macKey: Uint8Array;
}

export interface Store {
  putAuthKey(spec: PutAuthKeyInput): AuthKeyEntry;
  putObject(spec: ObjectEntry): ObjectEntry;
  getObject(id: number): ObjectEntry | undefined;
  getAuthKey(id: number): AuthKeyEntry | undefined;
  listObjects(): readonly ObjectEntry[];
  listAuthKeys(): readonly AuthKeyEntry[];
  deleteObject(id: number): boolean;
  deleteAuthKey(id: number): boolean;
  /**
   * Wipe every auth key and object, then re-seed the factory admin (id=1)
   * with keys derived from password "password" (salt "Yubico", PBKDF2). The
   * factory admin gets all 54 capabilities + all 16 domains + an empty
   * delegated-capabilities set of 0n (matches real hardware behavior: the
   * factory admin has full device capabilities but nothing is "delegated"
   * until an operator rotates it).
   */
  factoryReset(): void;
  canAuthorize(authKeyId: number, requiredCaps: CapSetT, targetId: number): boolean;
  canAuthorizeAuthKeyAdmin(
    adminAuthKeyId: number,
    requiredCaps: CapSetT,
    targetAuthKeyId: number,
  ): boolean;
}

export function createStore(): Store {
  const authKeys = new Map<number, AuthKeyEntry>();
  const objects = new Map<number, ObjectEntry>();
  return {
    putAuthKey(spec) {
      if (spec.encKey.length !== 16) {
        throw new Error("encKey must be 16 bytes");
      }
      if (spec.macKey.length !== 16) {
        throw new Error("macKey must be 16 bytes");
      }
      const entry: AuthKeyEntry = { ...spec, type: ObjectType.AuthenticationKey };
      authKeys.set(entry.id, entry);
      return entry;
    },
    putObject(spec) {
      objects.set(spec.id, spec);
      return spec;
    },
    getObject(id) {
      return objects.get(id);
    },
    getAuthKey(id) {
      return authKeys.get(id);
    },
    listObjects() {
      return [...objects.values()];
    },
    listAuthKeys() {
      return [...authKeys.values()];
    },
    deleteObject(id) {
      return objects.delete(id);
    },
    deleteAuthKey(id) {
      return authKeys.delete(id);
    },
    factoryReset() {
      authKeys.clear();
      objects.clear();
      const { encKey, macKey } = derivePasswordKeys("password");
      // Full device capabilities: bits 0..53 set.
      const allCaps = CapSet.fromBigint((1n << 54n) - 1n);
      const allDomains = domainSetOf(1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16);
      const factoryAdmin: AuthKeyEntry = {
        id: 1,
        type: ObjectType.AuthenticationKey,
        label: "DEFAULT AUTHKEY CHANGE THIS ASAP",
        capabilities: allCaps,
        delegatedCapabilities: allCaps,
        domains: allDomains,
        encKey,
        macKey,
      };
      authKeys.set(1, factoryAdmin);
    },
    canAuthorize(authKeyId, requiredCaps, targetId) {
      const auth = authKeys.get(authKeyId);
      const target = objects.get(targetId);
      if (!auth || !target) {
        return false;
      }
      if (!domainsOverlap(auth.domains, target.domains)) {
        return false;
      }
      const effective = intersectCaps(auth.capabilities, target.capabilities);
      return hasAllCaps(effective, requiredCaps);
    },
    canAuthorizeAuthKeyAdmin(adminId, requiredCaps, targetId) {
      const admin = authKeys.get(adminId);
      const target = authKeys.get(targetId);
      if (!admin || !target) {
        return false;
      }
      if (!domainsOverlap(admin.domains, target.domains)) {
        return false;
      }
      if (!hasAllCaps(admin.capabilities, requiredCaps)) {
        return false;
      }
      return hasAllCaps(admin.delegatedCapabilities, target.capabilities);
    },
  };
}
