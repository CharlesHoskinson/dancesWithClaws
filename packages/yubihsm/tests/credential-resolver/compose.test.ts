import { describe, expect, it } from "vitest";
import type {
  CredentialResolver,
  ResolvedCredential,
} from "../../src/credential-resolver/types.js";
import { composeResolvers, nullResolver } from "../../src/credential-resolver/compose.js";
import { CredentialResolutionError } from "../../src/credential-resolver/types.js";

function fixedResolver(name: string, hit: ResolvedCredential | null): CredentialResolver {
  return {
    async resolve() {
      return hit;
    },
    describe() {
      return name;
    },
  };
}

const ENC = new Uint8Array(16).fill(0x40);
const MAC = new Uint8Array(16).fill(0x41);
const HIT: ResolvedCredential = { encKey: ENC, macKey: MAC };

describe("composeResolvers", () => {
  it("returns the first non-null hit and does not consult later resolvers", async () => {
    let secondCalled = false;
    const first = fixedResolver("first", HIT);
    const second: CredentialResolver = {
      async resolve() {
        secondCalled = true;
        return HIT;
      },
      describe() {
        return "second";
      },
    };
    const chain = composeResolvers([first, second]);
    const result = await chain.resolve("admin", 1);
    expect(result).toBe(HIT);
    expect(secondCalled).toBe(false);
  });

  it("falls through past nulls to a later non-null", async () => {
    const chain = composeResolvers([
      fixedResolver("miss1", null),
      fixedResolver("miss2", null),
      fixedResolver("hit", HIT),
    ]);
    const result = await chain.resolve("admin", 1);
    expect(result).toBe(HIT);
  });

  it("throws CredentialResolutionError listing every resolver when all return null", async () => {
    const chain = composeResolvers([
      fixedResolver("one", null),
      fixedResolver("two", null),
      fixedResolver("three", null),
    ]);
    await expect(chain.resolve("admin", 42)).rejects.toBeInstanceOf(CredentialResolutionError);
    await expect(chain.resolve("admin", 42)).rejects.toThrow(
      /admin \(id=42\); tried: one, two, three/,
    );
  });

  it("describe() composes inner describe()s as chain(a, b, c)", () => {
    const chain = composeResolvers([
      fixedResolver("one", null),
      fixedResolver("two", null),
      fixedResolver("three", null),
    ]);
    expect(chain.describe()).toBe("chain(one, two, three)");
  });

  it("nullResolver is a safe placeholder that always misses", async () => {
    const chain = composeResolvers([nullResolver, fixedResolver("hit", HIT)]);
    const result = await chain.resolve("admin", 1);
    expect(result).toBe(HIT);
    expect(nullResolver.describe()).toBe("null");
  });
});
