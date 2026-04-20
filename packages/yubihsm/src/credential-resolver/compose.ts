/**
 * Resolver composition.
 *
 * `composeResolvers(r1, r2, ...)` returns a resolver that walks its inputs in
 * order, short-circuiting on the first non-null hit. If every inner resolver
 * returns null the composite throws `CredentialResolutionError`, listing each
 * inner resolver's `describe()` so the user knows where the chain looked.
 *
 * Intended ordering in the CLI: hex-flag -> json-file -> credential-manager.
 * First non-null wins — explicit user overrides beat file-stored configs,
 * which in turn beat the OS keystore.
 */

import {
  type CredentialResolver,
  CredentialResolutionError,
  type ResolvedCredential,
} from "./types.js";

/** A no-op resolver that always returns null; useful as a placeholder. */
export const nullResolver: CredentialResolver = {
  async resolve(): Promise<ResolvedCredential | null> {
    return null;
  },
  describe(): string {
    return "null";
  },
};

export function composeResolvers(resolvers: readonly CredentialResolver[]): CredentialResolver {
  const descriptions = resolvers.map((r) => r.describe());
  return {
    async resolve(role: string, id: number): Promise<ResolvedCredential | null> {
      const tried: string[] = [];
      for (const r of resolvers) {
        const hit = await r.resolve(role, id);
        tried.push(r.describe());
        if (hit) {
          return hit;
        }
      }
      throw new CredentialResolutionError(role, id, tried);
    },
    describe(): string {
      return `chain(${descriptions.join(", ")})`;
    },
  };
}
