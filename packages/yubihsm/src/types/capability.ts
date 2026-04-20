export const Capability = {
  GetOpaque: 0,
  PutOpaque: 1,
  PutAuthenticationKey: 2,
  PutAsymmetricKey: 3,
  GenerateAsymmetricKey: 4,
  SignPkcs: 5,
  SignPss: 6,
  SignEcdsa: 7,
  SignEddsa: 8,
  DecryptPkcs: 9,
  DecryptOaep: 10,
  DeriveEcdh: 11,
  ExportWrapped: 12,
  ImportWrapped: 13,
  PutWrapKey: 14,
  GenerateWrapKey: 15,
  ExportableUnderWrap: 16,
  SetOption: 17,
  GetOption: 18,
  GetPseudoRandom: 19,
  PutHmacKey: 20,
  GenerateHmacKey: 21,
  SignHmac: 22,
  VerifyHmac: 23,
  GetLogEntries: 24,
  SignSshCertificate: 25,
  GetTemplate: 26,
  PutTemplate: 27,
  ResetDevice: 28,
  DecryptOtp: 29,
  CreateOtpAead: 30,
  RandomizeOtpAead: 31,
  RewrapFromOtpAeadKey: 32,
  RewrapToOtpAeadKey: 33,
  SignAttestationCertificate: 34,
  PutOtpAeadKey: 35,
  GenerateOtpAeadKey: 36,
  WrapData: 37,
  UnwrapData: 38,
  DeleteOpaque: 39,
  DeleteAuthenticationKey: 40,
  DeleteAsymmetricKey: 41,
  DeleteWrapKey: 42,
  DeleteHmacKey: 43,
  DeleteTemplate: 44,
  DeleteOtpAeadKey: 45,
  ChangeAuthenticationKey: 46,
  PutSymmetricKey: 47,
  GenerateSymmetricKey: 48,
  DeleteSymmetricKey: 49,
  DecryptEcb: 50,
  EncryptEcb: 51,
  DecryptCbc: 52,
  EncryptCbc: 53,
} as const;

export type Capability = (typeof Capability)[keyof typeof Capability];

export type CapSetT = bigint & { readonly __brand: "CapSet" };

export const CapSet = {
  empty(): CapSetT {
    return 0n as CapSetT;
  },
  of(...caps: readonly Capability[]): CapSetT {
    let mask = 0n;
    for (const cap of caps) {
      mask |= 1n << BigInt(cap);
    }
    return mask as CapSetT;
  },
  fromBigint(v: bigint): CapSetT {
    return v as CapSetT;
  },
  toBigint(v: CapSetT): bigint {
    return v;
  },
};

export function intersectCaps(a: CapSetT, b: CapSetT): CapSetT {
  return (a & b) as CapSetT;
}

export function hasAllCaps(have: CapSetT, need: CapSetT): boolean {
  return (have & need) === need;
}
