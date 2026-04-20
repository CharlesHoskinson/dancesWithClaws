import { describe, it, expect } from "vitest";
import { Capability, CapSet, intersectCaps, hasAllCaps } from "../../src/types/capability.js";

describe("CapSet", () => {
  it("is a 64-bit bitmap as bigint", () => {
    const set = CapSet.of(Capability.SignEcdsa, Capability.SignEddsa);
    expect(set).toBe((1n << BigInt(Capability.SignEcdsa)) | (1n << BigInt(Capability.SignEddsa)));
  });

  it("intersects two capability sets", () => {
    const a = CapSet.of(Capability.SignEcdsa, Capability.WrapData);
    const b = CapSet.of(Capability.WrapData, Capability.UnwrapData);
    expect(intersectCaps(a, b)).toBe(CapSet.of(Capability.WrapData));
  });

  it("reports when required caps are all present", () => {
    const have = CapSet.of(Capability.SignEcdsa, Capability.WrapData);
    const need = CapSet.of(Capability.SignEcdsa);
    expect(hasAllCaps(have, need)).toBe(true);
    expect(hasAllCaps(CapSet.empty(), need)).toBe(false);
  });
});
