/**
 * TypeBox schemas for the vault envelope and entry records.
 */

import { Type, type Static } from "@sinclair/typebox";

export const EntryTypeSchema = Type.Union([
  Type.Literal("secret"),
  Type.Literal("api_token"),
  Type.Literal("ssh_key"),
  Type.Literal("private_key"),
  Type.Literal("certificate"),
]);

export const BackendTypeSchema = Type.Union([
  Type.Literal("yubihsm"),
  Type.Literal("dpapi+tpm"),
  Type.Literal("dpapi"),
  Type.Literal("openssl-pbkdf2"),
]);

export const VaultEntrySchema = Type.Object({
  id: Type.String(),
  label: Type.String(),
  type: EntryTypeSchema,
  tags: Type.Array(Type.String()),
  createdAt: Type.String(),
  modifiedAt: Type.String(),
  version: Type.Number({ minimum: 1 }),
  hsmResident: Type.Boolean(),
  hsmObjectId: Type.Optional(Type.Number()),
  iv: Type.Optional(Type.String()),
  ciphertext: Type.Optional(Type.String()),
  authTag: Type.Optional(Type.String()),
});

export const VaultMetadataSchema = Type.Object({
  backend: BackendTypeSchema,
  createdAt: Type.String(),
  lastModifiedAt: Type.String(),
  vmkVersion: Type.Number({ minimum: 1 }),
  entryCount: Type.Number({ minimum: 0 }),
});

export const VaultEnvelopeSchema = Type.Object({
  version: Type.Literal(1),
  metadata: VaultMetadataSchema,
  sealedVmk: Type.String(),
  entries: Type.Array(VaultEntrySchema),
  hmac: Type.String(),
});

export type VaultEntryRecord = Static<typeof VaultEntrySchema>;
export type VaultMetadataRecord = Static<typeof VaultMetadataSchema>;
export type VaultEnvelopeRecord = Static<typeof VaultEnvelopeSchema>;
