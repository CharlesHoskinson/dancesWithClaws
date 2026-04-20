import { z } from "zod";
import { Capability } from "../types/capability.js";

const capabilityNameMap = {
  "generate-asymmetric-key": Capability.GenerateAsymmetricKey,
  "put-authentication-key": Capability.PutAuthenticationKey,
  "sign-ecdsa": Capability.SignEcdsa,
  "sign-eddsa": Capability.SignEddsa,
  "sign-pkcs": Capability.SignPkcs,
  "wrap-data": Capability.WrapData,
  "unwrap-data": Capability.UnwrapData,
  "export-wrapped": Capability.ExportWrapped,
  "import-wrapped": Capability.ImportWrapped,
  "exportable-under-wrap": Capability.ExportableUnderWrap,
  "get-log-entries": Capability.GetLogEntries,
  "delete-asymmetric-key": Capability.DeleteAsymmetricKey,
  "sign-attestation-certificate": Capability.SignAttestationCertificate,
} as const;

export type CapabilityName = keyof typeof capabilityNameMap;

export function capabilityFromName(name: string): Capability {
  const cap = capabilityNameMap[name as CapabilityName];
  if (cap === undefined) {
    throw new Error(`unknown capability: ${name}`);
  }
  return cap;
}

export const durationSchema = z.string().regex(/^\d+(ms|s|m|h)$/);

export const blueprintSchema = z.object({
  version: z.literal(1),
  device: z.object({
    serial_pin: z.string().optional(),
    min_firmware: z.string(),
    fips_mode: z.boolean().optional(),
  }),
  domains: z.record(
    z.string().regex(/^\d+$/),
    z.object({
      label: z.string(),
      purpose: z.string(),
    }),
  ),
  auth_keys: z.array(
    z.object({
      id: z.number().int().min(1).max(0xfffe),
      role: z.string(),
      domains: z.array(z.number().int().min(1).max(16)),
      capabilities: z.array(z.string()),
      delegated_capabilities: z.array(z.string()).default([]),
      credential_ref: z.string(),
    }),
  ),
  wrap_keys: z.array(
    z.object({
      id: z.number().int().min(1).max(0xfffe),
      domains: z.array(z.number().int().min(1).max(16)),
      algorithm: z.enum(["aes128-ccm-wrap", "aes192-ccm-wrap", "aes256-ccm-wrap"]),
      delegated_capabilities: z.array(z.string()).default([]),
    }),
  ),
  policies: z.object({
    audit: z.object({
      drain_every: durationSchema,
      permanent_force_audit: z.boolean(),
    }),
    sessions: z.object({
      pool_size: z.number().int().positive(),
      idle_timeout: durationSchema,
    }),
  }),
});

export type RawBlueprint = z.infer<typeof blueprintSchema>;

export interface ParsedAuthKey {
  readonly id: number;
  readonly role: string;
  readonly domains: readonly number[];
  readonly capabilities: readonly string[];
  readonly delegatedCapabilities: readonly string[];
  readonly credentialRef: string;
}

export interface ParsedBlueprint {
  readonly version: 1;
  readonly device: RawBlueprint["device"];
  readonly domains: ReadonlyMap<number, { readonly label: string; readonly purpose: string }>;
  readonly authKeys: readonly ParsedAuthKey[];
  readonly wrapKeys: readonly RawBlueprint["wrap_keys"][number][];
  readonly policies: RawBlueprint["policies"];
}
