import {
  type Algorithm,
  type CapSetT,
  type DomainSet,
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
