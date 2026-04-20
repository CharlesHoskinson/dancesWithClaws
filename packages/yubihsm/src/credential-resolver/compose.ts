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
 *
 * `writableResolvers(resolvers)` returns the subset of the input that
 * implements `write`. `openclaw hsm bootstrap` uses this to seal a freshly
 * generated admin into the first persistent store available on the chain
 * (json-file or credential-manager; hex-flag's write is a no-op and is only
 * present when the operator actually provided hex flags).
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

export function writableResolvers(
  resolvers: readonly CredentialResolver[],
): readonly CredentialResolver[] {
  return resolvers.filter((r) => typeof r.write === "function");
}

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
    // Delegate to the first resolver in the chain that has its own write.
    // We do not fan-out writes; the operator picks one backing store (hex
    // flag / json file / Credential Manager) and bootstrap commits there.
    async write(role: string, id: number, cred: ResolvedCredential): Promise<void> {
      for (const r of resolvers) {
        if (typeof r.write === "function") {
          await r.write(role, id, cred);
          return;
        }
      }
      throw new Error(
        `no writable resolver in chain ${descriptions.join(", ")}; supply --creds-file ` +
          "or run on a host with Credential Manager to persist rotated admin keys",
      );
    },
    describe(): string {
      return `chain(${descriptions.join(", ")})`;
    },
  };
}
