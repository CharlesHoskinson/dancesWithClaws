import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const deployDir = join(__dirname, "..");
const repoRoot = join(deployDir, "..");

describe("Secret Leakage — openclaw.json", () => {
  const config = JSON.parse(readFileSync(join(repoRoot, "openclaw.json"), "utf-8"));
  it("redactPatterns cover OPENAI_API_KEY", () => {
    assert.ok(config.logging.redactPatterns.some((p) => p.includes("OPENAI_API_KEY")));
  });
  it("redactPatterns cover SOKOSUMI_API_KEY", () => {
    assert.ok(config.logging.redactPatterns.some((p) => p.includes("SOKOSUMI_API_KEY")));
  });
  it("env vars have no real secret values", () => {
    assert.equal(config.env.vars.OPENAI_API_KEY, "");
    assert.equal(config.env.vars.SOKOSUMI_API_KEY, "");
  });
  it("does not define removed social API keys", () => {
    assert.ok(!("MOLTBOOK_API_KEY" in (config.env.vars || {})));
  });
});

describe("Docker Security — openclaw.json sandbox", () => {
  const config = JSON.parse(readFileSync(join(repoRoot, "openclaw.json"), "utf-8"));
  const agent = config.agents.list[0];
  it('sandbox mode is "all"', () => {
    assert.equal(agent.sandbox.mode, "all");
  });
  it("network is proxy-isolated oc-sandbox-net", () => {
    assert.equal(agent.sandbox.docker.network, "oc-sandbox-net");
  });
  it("alsoAllow grants exec for curl", () => {
    assert.ok(agent.tools.alsoAllow.includes("exec"));
  });
  it("denies high-risk tools", () => {
    for (const name of ["browser", "canvas", "sessions_spawn", "sokosumi_create_job"]) {
      assert.ok(agent.tools.deny.includes(name), name);
    }
  });
});

describe("Proxy allowlist", () => {
  const allow = readFileSync(join(repoRoot, "security", "proxy", "allowed-domains.txt"), "utf-8");
  it("includes openai and sokosumi", () => {
    assert.ok(allow.includes("openai.com"));
    assert.ok(allow.includes("sokosumi.com"));
  });
  it("does not include removed social domains", () => {
    assert.ok(!allow.toLowerCase().includes("moltbook"));
  });
});

describe("Compose secrets", () => {
  const compose = readFileSync(join(deployDir, "docker-compose.logan.yml"), "utf-8");
  it("interpolates secrets", () => {
    assert.ok(compose.includes("${OPENAI_API_KEY}"));
    assert.ok(compose.includes("${OPENCLAW_GATEWAY_TOKEN}"));
  });
  it("has no moltbook references", () => {
    assert.ok(!compose.toLowerCase().includes("moltbook"));
  });
});
