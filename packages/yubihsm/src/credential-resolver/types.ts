/**
 * Pluggable credential resolution for SCP03 session keys.
 *
 * A `CredentialResolver` takes a role name (e.g. "admin") and an auth-key id,
 * and returns a `ResolvedCredential` with 16-byte enc/mac keys, or null if it
 * cannot supply keys for that role. Resolvers are composed into a chain via
 * `composeResolvers`, which walks the array in order and returns the first
 * non-null hit; if every resolver returns null the chain throws
 * `CredentialResolutionError` listing every resolver that was tried.
 */

export interface ResolvedCredential {
  readonly encKey: Uint8Array;
  readonly macKey: Uint8Array;
}

export interface CredentialResolver {
  resolve(role: string, id: number): Promise<ResolvedCredential | null>;
  /** Human-readable name, used in `CredentialResolutionError` messages. */
  describe(): string;
}

export class CredentialResolutionError extends Error {
  constructor(role: string, id: number, tried: readonly string[]) {
    super(
      `no credential resolver returned keys for ${role} (id=${id}); tried: ${tried.join(", ")}`,
    );
    this.name = "CredentialResolutionError";
  }
}
