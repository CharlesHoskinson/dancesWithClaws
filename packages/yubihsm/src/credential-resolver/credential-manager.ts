/**
 * Windows Credential Manager resolver.
 *
 * Bridges to `extensions/tee-vault/src/integrations/credential-manager.ts`'s
 * exported `retrieveCredential(target)` function (named this way in the
 * extension — there is no `getHsmCredential`). The extension is imported
 * lazily via `import()` so non-Windows test environments that don't ship the
 * extension's PowerShell dependencies don't blow up at module load.
 *
 * Role-to-target mapping uses the `CredentialTarget` keys from the extension:
 *   "admin"      -> "hsmAdmin"
 *   "ssh-signer" -> "hsmSshSigner"
 *   "db-crypto"  -> "hsmDbCrypto"
 *   "backup"     -> "hsmBackup"
 *
 * The password field of the retrieved credential is expected to be the
 * concatenated hex(encKey || macKey), i.e. 64 hex chars.
 */

import type { CredentialResolver, ResolvedCredential } from "./types.js";

const ROLE_TO_CRED_KEY: Readonly<Record<string, string>> = {
  admin: "hsmAdmin",
  "ssh-signer": "hsmSshSigner",
  "db-crypto": "hsmDbCrypto",
  backup: "hsmBackup",
};

interface RetrievedCredential {
  readonly username: string;
  readonly password: string;
}

type RetrieveFn = (target: string) => Promise<RetrievedCredential | null>;

interface CredentialManagerModule {
  retrieveCredential: RetrieveFn;
}

/**
 * Override the dynamic import for tests. Pass a factory that returns a fake
 * module; call again with `undefined` to reset to the real lazy import.
 */
let importOverride: (() => Promise<CredentialManagerModule>) | undefined;

export function _setCredentialManagerImport(
  factory: (() => Promise<CredentialManagerModule>) | undefined,
): void {
  importOverride = factory;
}

async function loadModule(): Promise<CredentialManagerModule | null> {
  try {
    if (importOverride) {
      return await importOverride();
    }
    // Dynamic import so the resolver module stays load-safe on non-Windows.
    const mod = (await import(
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      "../../../../extensions/tee-vault/src/integrations/credential-manager.js" as string
    )) as unknown as CredentialManagerModule;
    return mod;
  } catch {
    return null;
  }
}

function parseHex16(value: string, label: string): Uint8Array {
  if (!/^[0-9a-fA-F]{32}$/.test(value)) {
    throw new Error(`${label} must be 32 hex chars (16 bytes)`);
  }
  const out = new Uint8Array(16);
  for (let i = 0; i < 16; i++) {
    out[i] = Number.parseInt(value.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

export function credentialManagerResolver(): CredentialResolver {
  return {
    async resolve(role: string, _id: number): Promise<ResolvedCredential | null> {
      const credKey = ROLE_TO_CRED_KEY[role];
      if (!credKey) {
        return null;
      }
      const mod = await loadModule();
      if (!mod) {
        return null;
      }
      let cred: RetrievedCredential | null;
      try {
        cred = await mod.retrieveCredential(credKey);
      } catch {
        return null;
      }
      if (!cred || typeof cred.password !== "string") {
        return null;
      }
      const hex = cred.password.trim();
      if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
        // Stored credential isn't in the expected enc||mac hex format;
        // treat as "no credential here" rather than throw.
        return null;
      }
      const encKey = parseHex16(hex.slice(0, 32), `${credKey}.enc`);
      const macKey = parseHex16(hex.slice(32, 64), `${credKey}.mac`);
      return { encKey, macKey };
    },
    describe(): string {
      return "credential-manager(windows)";
    },
  };
}
