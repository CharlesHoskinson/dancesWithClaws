import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MockAgent, setGlobalDispatcher, getGlobalDispatcher } from "undici";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runMain } from "../run.js";

const TEST_BLUEPRINT_YAML = `version: 1
device:
  min_firmware: "2.4.0"
domains:
  1: { label: "core", purpose: "signing" }
  2: { label: "plugins", purpose: "wrap" }
auth_keys:
  - id: 2
    role: admin
    domains: [1, 2]
    capabilities:
      [generate-asymmetric-key, put-authentication-key, delete-asymmetric-key]
    delegated_capabilities: [sign-ecdsa, wrap-data, unwrap-data]
    credential_ref: cred:TeeVault-YubiHSM-Admin
  - id: 10
    role: gateway-signer
    domains: [1]
    capabilities: [sign-ecdsa]
    credential_ref: cred:TeeVault-YubiHSM-SSHSigner
wrap_keys: []
policies:
  audit: { drain_every: "30s", permanent_force_audit: true }
  sessions: { pool_size: 4, idle_timeout: "60s" }
`;

const ORIGINAL_HOME = process.env["HOME"];
const ORIGINAL_USERPROFILE = process.env["USERPROFILE"];

describe("hsm-logan-e2e smoke (simulator + mocked externals)", () => {
  let tempHome: string;
  let tempDir: string;
  let mockAgent: MockAgent;
  let previousDispatcher: ReturnType<typeof getGlobalDispatcher>;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "logan-e2e-"));
    tempHome = mkdtempSync(join(tmpdir(), "logan-e2e-home-"));
    process.env["HOME"] = tempHome;
    process.env["USERPROFILE"] = tempHome;

    previousDispatcher = getGlobalDispatcher();
    mockAgent = new MockAgent();
    // Critical: keep connections to our in-process simulator AND to the
    // Ollama mock pool working. `enableNetConnect(regex)` whitelists real
    // network paths; everything else routes through the interceptors.
    mockAgent.disableNetConnect();
    mockAgent.enableNetConnect(/127\.0\.0\.1:\d+/);
    setGlobalDispatcher(mockAgent);
  });

  afterEach(async () => {
    await mockAgent.close();
    setGlobalDispatcher(previousDispatcher);
    if (ORIGINAL_HOME === undefined) {
      delete process.env["HOME"];
    } else {
      process.env["HOME"] = ORIGINAL_HOME;
    }
    if (ORIGINAL_USERPROFILE === undefined) {
      delete process.env["USERPROFILE"];
    } else {
      process.env["USERPROFILE"] = ORIGINAL_USERPROFILE;
    }
  });

  it("bootstraps, seals creds, and drives Logan to a Moltbook post", async () => {
    const blueprintPath = join(tempDir, "blueprint.yaml");
    writeFileSync(blueprintPath, TEST_BLUEPRINT_YAML);

    const perplexityPool = mockAgent.get("https://api.perplexity.ai");
    perplexityPool.intercept({ path: "/chat/completions", method: "POST" }).reply(
      200,
      JSON.stringify({
        choices: [
          {
            message: {
              content: "Cardano's Intersect MBO ratified two new committee seats this week.",
            },
          },
        ],
      }),
      { headers: { "content-type": "application/json" } },
    );

    const moltbookPool = mockAgent.get("https://www.moltbook.com");
    moltbookPool
      .intercept({ path: "/api/v1/posts", method: "POST" })
      .reply(201, JSON.stringify({ id: "mlt_42", url: "https://www.moltbook.com/posts/mlt_42" }), {
        headers: { "content-type": "application/json" },
      });

    // The test harness passes skipOllamaProbe + its own mocked port, but the
    // logan-task still calls /api/generate — intercept that too. Since the
    // dispatcher whitelists 127.0.0.1:* for the simulator, and Ollama runs on
    // 127.0.0.1:11434 in production, we need to send Ollama traffic through a
    // different host that does NOT match the whitelist. Override the port to
    // something non-127.0.0.1; point the mock at that virtual host.
    const ollamaPool = mockAgent.get("http://ollama.test");
    ollamaPool.intercept({ path: "/api/generate", method: "POST" }).reply(
      200,
      JSON.stringify({
        response:
          "Cardano MBO just grew two new arms. More limbs = better grip on the seafloor. #Cardano",
      }),
      { headers: { "content-type": "application/json" } },
    );

    // Force logan-task + ollama.ts to hit ollama.test by monkey-patching the
    // URL helpers via env. The ollama module uses http://127.0.0.1:<port>;
    // we override baseUrl indirectly by aliasing the DNS-free mocked host.
    // Easiest: intercept 127.0.0.1:11434 through a pool of that authority.
    const ollamaLocalPool = mockAgent.get("http://127.0.0.1:11434");
    ollamaLocalPool.intercept({ path: "/api/generate", method: "POST" }).reply(
      200,
      JSON.stringify({
        response:
          "Cardano MBO just grew two new arms. More limbs = better grip on the seafloor. #Cardano",
      }),
      { headers: { "content-type": "application/json" } },
    );

    const captured: string[] = [];
    const result = await runMain({
      blueprint: blueprintPath,
      credsFile: join(tempDir, "creds.json"),
      moltbookEndpoint: "https://www.moltbook.com/api/v1/posts",
      topic: "Cardano governance",
      secrets: { moltbook: "mb-live-test-key", perplexity: "pplx-live-test-key" },
      skipOllamaProbe: true,
      log: (line) => captured.push(line),
    });

    expect(result.moltbookPostId).toBe("mlt_42");
    expect(result.loganPost).toContain("Cardano");
    expect(result.rotated).toBe(true);

    // Sealed secrets landed on disk under the temp HOME.
    expect(existsSync(join(tempHome, ".openclaw", "sealed-secrets", "MOLTBOOK_API_KEY.json"))).toBe(
      true,
    );
    expect(
      existsSync(join(tempHome, ".openclaw", "sealed-secrets", "PERPLEXITY_API_KEY.json")),
    ).toBe(true);
    const moltbookBlob = JSON.parse(
      readFileSync(join(tempHome, ".openclaw", "sealed-secrets", "MOLTBOOK_API_KEY.json"), "utf-8"),
    ) as { iv: string; tag: string; ciphertext: string };
    expect(moltbookBlob.iv).toMatch(/^[0-9a-f]{24}$/);
    expect(moltbookBlob.tag).toMatch(/^[0-9a-f]{32}$/);
    expect(moltbookBlob.ciphertext.length).toBeGreaterThan(0);
    // The plaintext must NOT appear in the sealed blob.
    expect(moltbookBlob.ciphertext).not.toContain(
      Buffer.from("mb-live-test-key", "utf-8").toString("hex"),
    );

    // Mocked endpoints were all invoked (implicit: `mockAgent.close` would
    // throw on pending interceptors when strict, but we enumerate logs).
    expect(captured.some((l) => l.includes("bootstrap done"))).toBe(true);
    expect(captured.some((l) => l.includes("Logan posted"))).toBe(true);
    expect(captured.some((l) => l.includes("started simulator"))).toBe(true);

    // Confirm the researchSummary / loganPost plumbing routed through our
    // mocked Perplexity + Ollama responses (not a cached default).
    expect(result.loganPost).toContain("arms");
  });
});
