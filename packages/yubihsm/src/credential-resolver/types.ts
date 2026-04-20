/**
 * Pluggable credential resolution for SCP03 session keys.
 *
 * A `CredentialResolver` takes a role name (e.g. "admin") and an auth-key id,
 * and returns a `ResolvedCredential` with 16-byte enc/mac keys, or null if it
 * cannot supply keys for that role. Resolvers are composed into a chain via
 * `composeResolvers`, which walks the array in order and returns the first
 * non-null hit; if every resolver returns null the chain throws
 * `CredentialResolutionError` listing every resolver that was tried.
 *
 * The optional `write(role, id, cred)` method is used by `openclaw hsm
 * bootstrap` to seal a freshly-generated admin back into the operator's
 * chosen credential store (Credential Manager, JSON file, …). Read-only
 * resolvers leave it unimplemented and the default throws; `composeResolvers`
 * exposes `writableResolvers()` so bootstrap can pick the first one that
 * actually persists.
 */

export interface ResolvedCredential {
  readonly encKey: Uint8Array;
  readonly macKey: Uint8Array;
}

export interface CredentialResolver {
  resolve(role: string, id: number): Promise<ResolvedCredential | null>;
  /**
   * Persist a credential back into this resolver's backing store. Default
   * implementations throw `"resolver is read-only"`. Writable resolvers
   * (json-file, credential-manager) override; transient resolvers like
   * hex-flag implement as a no-op since the caller already has the keys.
   */
  write?(role: string, id: number, cred: ResolvedCredential): Promise<void>;
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
