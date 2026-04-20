/**
 * JSON-file resolver.
 *
 * Reads SCP03 keys from a JSON file of the form
 *   { "TeeVault-YubiHSM-Admin":     { "enc": "<32 hex>", "mac": "<32 hex>" },
 *     "TeeVault-YubiHSM-SSHSigner": { ... } }
 *
 * The top-level keys are Windows Credential Manager "target" names — the same
 * naming convention used by `extensions/tee-vault/src/integrations/credential-manager.ts`.
 * Roles are mapped to target names via `ROLE_TO_TARGET`; roles not in the map
 * or missing from the file resolve to null, as does a missing file.
 */

import { existsSync, readFileSync } from "node:fs";
import type { CredentialResolver, ResolvedCredential } from "./types.js";

export const ROLE_TO_TARGET: Readonly<Record<string, string>> = {
  admin: "TeeVault-YubiHSM-Admin",
  "ssh-signer": "TeeVault-YubiHSM-SSHSigner",
  "db-crypto": "TeeVault-YubiHSM-DBCrypto",
  backup: "TeeVault-YubiHSM-Backup",
};

export function roleToTarget(role: string): string | undefined {
  return ROLE_TO_TARGET[role];
}

function parseHex16(value: string, label: string): Uint8Array {
  if (typeof value !== "string" || !/^[0-9a-fA-F]{32}$/.test(value)) {
    throw new Error(`${label} must be 32 hex chars (16 bytes)`);
  }
  const out = new Uint8Array(16);
  for (let i = 0; i < 16; i++) {
    out[i] = Number.parseInt(value.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

interface Entry {
  readonly enc?: unknown;
  readonly mac?: unknown;
}

export function jsonFileResolver(path: string): CredentialResolver {
  return {
    async resolve(role: string, _id: number): Promise<ResolvedCredential | null> {
      if (!existsSync(path)) {
        return null;
      }
      const target = roleToTarget(role);
      if (!target) {
        return null;
      }
      const raw = readFileSync(path, "utf-8");
      const parsed = JSON.parse(raw) as Record<string, Entry> | undefined;
      const entry = parsed?.[target];
      if (!entry || typeof entry.enc !== "string" || typeof entry.mac !== "string") {
        return null;
      }
      const encKey = parseHex16(entry.enc, `${target}.enc`);
      const macKey = parseHex16(entry.mac, `${target}.mac`);
      return { encKey, macKey };
    },
    describe(): string {
      return `json-file(${path})`;
    },
  };
}
