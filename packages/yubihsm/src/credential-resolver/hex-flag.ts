/**
 * CLI hex-flag resolver.
 *
 * Reads SCP03 enc/mac keys directly from hex strings, as supplied by the
 * `--admin-enc` / `--admin-mac` CLI flags (or their `HSM_ADMIN_ENC_HEX` /
 * `HSM_ADMIN_MAC_HEX` env-var siblings). If both hex values are present they
 * are parsed into 16-byte keys; if either is missing the resolver returns
 * null so the chain can fall through to the next resolver. Malformed hex
 * still throws, because that's a user error, not a "no credentials here".
 */

import type { CredentialResolver, ResolvedCredential } from "./types.js";

export interface HexFlagResolverOptions {
  readonly encHex?: string;
  readonly macHex?: string;
  /** If set, the resolver only answers for this role; otherwise it answers for any role. */
  readonly roleBinding?: string;
}

function parseHex16(value: string, label: string): Uint8Array {
  if (!/^[0-9a-fA-F]{32}$/.test(value)) {
    throw new Error(`${label} must be 32 hex chars (16 bytes), got ${value.length}`);
  }
  const out = new Uint8Array(16);
  for (let i = 0; i < 16; i++) {
    out[i] = Number.parseInt(value.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

export function hexFlagResolver(opts: HexFlagResolverOptions): CredentialResolver {
  const { encHex, macHex, roleBinding } = opts;
  const base: CredentialResolver = {
    async resolve(role: string, _id: number): Promise<ResolvedCredential | null> {
      if (!encHex || !macHex) {
        return null;
      }
      if (roleBinding && role !== roleBinding) {
        return null;
      }
      const encKey = parseHex16(encHex, "enc key");
      const macKey = parseHex16(macHex, "mac key");
      return { encKey, macKey };
    },
    describe(): string {
      return roleBinding ? `hex-flag(${roleBinding})` : "hex-flag";
    },
  };
  // When both hex flags are present the operator has already committed to
  // keeping the keys themselves; accept a bootstrap write as a no-op so the
  // chain reports it as "writable" but we don't smuggle key material back
  // into the process environment. With no hex flags set, hex-flag has no
  // write method at all — bootstrap then picks the next writable resolver
  // (json-file or credential-manager) for actual persistence.
  if (encHex && macHex) {
    return {
      ...base,
      async write(role: string, _id: number, _cred: ResolvedCredential): Promise<void> {
        // Warn loudly: hex flags are process-transient, so a "persisted"
        // rotation written here will be lost the moment this process
        // exits. The operator needs a real backing store for rotation.
        // eslint-disable-next-line no-console
        console.warn(
          `[hsm] hex-flag resolver: refusing to rotate key for ${role} — hex flags are ` +
            "transient; use --creds-file or Credential Manager for persistent storage",
        );
      },
    };
  }
  return base;
}
