import { parse } from "yaml";
import {
  blueprintSchema,
  capabilityFromName,
  type ParsedAuthKey,
  type ParsedBlueprint,
} from "./schema.js";

export function parseBlueprint(text: string): ParsedBlueprint {
  const raw = blueprintSchema.parse(parse(text));
  for (const ak of raw.auth_keys) {
    for (const c of ak.capabilities) {
      capabilityFromName(c);
    }
    for (const c of ak.delegated_capabilities) {
      capabilityFromName(c);
    }
  }
  const domains = new Map<number, { label: string; purpose: string }>();
  for (const [k, v] of Object.entries(raw.domains)) {
    domains.set(Number(k), v);
  }
  const authKeys: ParsedAuthKey[] = raw.auth_keys.map((k) => ({
    id: k.id,
    role: k.role,
    domains: k.domains,
    capabilities: k.capabilities,
    delegatedCapabilities: k.delegated_capabilities,
    credentialRef: k.credential_ref,
  }));
  return {
    version: 1,
    device: raw.device,
    domains,
    authKeys,
    wrapKeys: raw.wrap_keys,
    policies: raw.policies,
  };
}
