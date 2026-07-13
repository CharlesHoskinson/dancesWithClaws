// Verifies wasm sandbox config parsing and round-trip.
import { describe, expect, it } from "vitest";
import { validateConfigObject } from "./validation.js";

describe("sandbox wasm config", () => {
  it("accepts agents.defaults.sandbox.wasm settings and round-trips fields", () => {
    const res = validateConfigObject({
      agents: {
        defaults: {
          sandbox: {
            backend: "wasm",
            wasm: {
              bin: "tools/logan-wasm-sandbox/target/release/logan-wasm-sandbox",
              allowlist: "security/proxy/allowed-domains.txt",
              timeoutSecs: 45,
              maxBytes: 2_097_152,
            },
          },
        },
      },
    });
    expect(res.ok).toBe(true);
    if (!res.ok) {
      return;
    }
    expect(res.config.agents?.defaults?.sandbox?.backend).toBe("wasm");
    expect(res.config.agents?.defaults?.sandbox?.wasm).toEqual({
      bin: "tools/logan-wasm-sandbox/target/release/logan-wasm-sandbox",
      allowlist: "security/proxy/allowed-domains.txt",
      timeoutSecs: 45,
      maxBytes: 2_097_152,
    });
  });

  it("accepts per-agent sandbox.wasm overrides", () => {
    const res = validateConfigObject({
      agents: {
        defaults: {
          sandbox: {
            backend: "docker",
          },
        },
        list: [
          {
            id: "logan",
            sandbox: {
              backend: "wasm",
              wasm: {
                bin: "logan-wasm-sandbox",
                allowlist: "C:/openclaw/allowed-domains.txt",
                timeoutSecs: 30,
                maxBytes: 1_048_576,
              },
            },
          },
        ],
      },
    });
    expect(res.ok).toBe(true);
    if (!res.ok) {
      return;
    }
    expect(res.config.agents?.list?.[0]?.sandbox?.backend).toBe("wasm");
    expect(res.config.agents?.list?.[0]?.sandbox?.wasm).toEqual({
      bin: "logan-wasm-sandbox",
      allowlist: "C:/openclaw/allowed-domains.txt",
      timeoutSecs: 30,
      maxBytes: 1_048_576,
    });
  });

  it("accepts empty sandbox.wasm object", () => {
    const res = validateConfigObject({
      agents: {
        defaults: {
          sandbox: {
            backend: "wasm",
            wasm: {},
          },
        },
      },
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.config.agents?.defaults?.sandbox?.wasm).toEqual({});
    }
  });

  it("rejects unknown sandbox.wasm keys", () => {
    const res = validateConfigObject({
      agents: {
        defaults: {
          sandbox: {
            wasm: {
              bin: "logan-wasm-sandbox",
              unknownField: true,
            },
          },
        },
      },
    });
    expect(res.ok).toBe(false);
  });

  it("rejects non-positive timeoutSecs and maxBytes", () => {
    const timeoutRes = validateConfigObject({
      agents: {
        defaults: {
          sandbox: {
            wasm: {
              timeoutSecs: 0,
            },
          },
        },
      },
    });
    expect(timeoutRes.ok).toBe(false);

    const maxBytesRes = validateConfigObject({
      agents: {
        defaults: {
          sandbox: {
            wasm: {
              maxBytes: -1,
            },
          },
        },
      },
    });
    expect(maxBytesRes.ok).toBe(false);
  });
});
