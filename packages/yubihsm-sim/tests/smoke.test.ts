import { describe, it, expect } from "vitest";
import { createSimulator } from "../src/index.js";

describe("@dancesWithClaws/yubihsm-sim", () => {
  it("creates a stopped simulator", () => {
    const sim = createSimulator();
    expect(sim.port).toBe(0);
    expect(sim.running).toBe(false);
  });
});
