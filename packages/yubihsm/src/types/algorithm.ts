export const Algorithm = {
  RsaPkcs1Sha256: 9,
  RsaPssSha256: 13,
  EcdsaSha256: 43,
  EcP256: 12,
  EcP384: 14,
  EcSecp256k1: 15,
  Ed25519: 46,
  Aes128CcmWrap: 29,
  Aes192CcmWrap: 41,
  Aes256CcmWrap: 42,
  HmacSha256: 20,
} as const;

export type Algorithm = (typeof Algorithm)[keyof typeof Algorithm];
