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
  const writables = writableResolvers(resolvers);
  const base: CredentialResolver = {
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
  // Only attach `write` when at least one inner resolver can actually
  // persist. Callers (e.g. bootstrap) check `typeof chain.write === "function"`
  // to decide whether any backing store is reachable; an always-on stub
  // that throws at call time defeats that gate and surfaces the error too
  // late, after the operator has already committed to a rotation path.
  if (writables.length === 0) {
    return base;
  }
  return {
    ...base,
    // Delegate to the first resolver in the chain that has its own write.
    // We do not fan-out writes; the operator picks one backing store (hex
    // flag / json file / Credential Manager) and bootstrap commits there.
    async write(role: string, id: number, cred: ResolvedCredential): Promise<void> {
      const first = writables[0]!;
      await first.write!(role, id, cred);
    },
  };
}
