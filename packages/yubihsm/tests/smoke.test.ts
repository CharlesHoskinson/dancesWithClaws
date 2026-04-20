import { describe, it, expect } from "vitest";
import * as pkg from "../src/index.js";

describe("@dancesWithClaws/yubihsm", () => {
  it("exports version", () => {
    expect(pkg.VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
