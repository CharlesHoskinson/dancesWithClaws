import type { Algorithm } from "./algorithm.js";
import type { CapSetT } from "./capability.js";
import type { DomainSet } from "./domain.js";

export const ObjectType = {
  Opaque: 1,
  AuthenticationKey: 2,
  AsymmetricKey: 3,
  WrapKey: 4,
  HmacKey: 5,
  Template: 6,
  OtpAeadKey: 7,
  SymmetricKey: 8,
  PublicWrapKey: 9,
} as const;

export type ObjectType = (typeof ObjectType)[keyof typeof ObjectType];

export type ObjectId = number & { readonly __brand: "ObjectId" };

export function objectId(n: number): ObjectId {
  if (n < 1 || n > 0xfffe) {
    throw new Error(`objectId out of range: ${n}`);
  }
  return n as ObjectId;
}

export interface HsmObject {
  readonly id: ObjectId;
  readonly type: ObjectType;
  readonly algorithm: Algorithm;
  readonly label: string;
  readonly capabilities: CapSetT;
  readonly delegatedCapabilities: CapSetT;
  readonly domains: DomainSet;
}
