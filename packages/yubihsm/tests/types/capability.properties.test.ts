import fc from "fast-check";
import { describe, it, expect } from "vitest";
import { Capability, CapSet, intersectCaps, hasAllCaps } from "../../src/types/capability.js";

const capArb = fc.constantFrom(...Object.values(Capability));
const capSetArb = fc.array(capArb, { maxLength: 16 }).map((xs) => CapSet.of(...xs));

describe("capability law: intersection is commutative", () => {
  it("∀ a b. a ∩ b = b ∩ a", () => {
    fc.assert(
      fc.property(capSetArb, capSetArb, (a, b) => {
        expect(intersectCaps(a, b)).toBe(intersectCaps(b, a));
      }),
    );
  });
});

describe("capability law: intersection is idempotent", () => {
  it("∀ a. a ∩ a = a", () => {
    fc.assert(
      fc.property(capSetArb, (a) => {
        expect(intersectCaps(a, a)).toBe(a);
      }),
    );
  });
});

describe("capability law: need ⊆ have ⇒ hasAllCaps", () => {
  it("∀ have need. need = have ∩ x ⇒ hasAllCaps(have, need)", () => {
    fc.assert(
      fc.property(capSetArb, capSetArb, (a, b) => {
        const need = intersectCaps(a, b);
        expect(hasAllCaps(a, need)).toBe(true);
        expect(hasAllCaps(b, need)).toBe(true);
      }),
    );
  });
});
