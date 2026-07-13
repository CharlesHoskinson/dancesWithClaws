import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const composePath = join(__dirname, "..", "docker-compose.logan.yml");
const composeContent = readFileSync(composePath, "utf-8");

function extractService(content, serviceName) {
  const lines = content.split("\n");
  let capturing = false;
  const indent = 2;
  const result = [];
  for (const line of lines) {
    if (new RegExp(`^  ${serviceName}:`).test(line)) {
      capturing = true;
      result.push(line);
      continue;
    }
    if (capturing) {
      if (line.trim() === "") {
        result.push(line);
        continue;
      }
      const lineIndent = line.search(/\S/);
      if (lineIndent <= indent && lineIndent >= 0 && !line.trim().startsWith("-") && !line.trim().startsWith("#")) {
        break;
      }
      result.push(line);
    }
  }
  return result.join("\n");
}

describe("docker-compose.logan.yml — structure", () => {
  it("is readable and non-empty", () => {
    assert.ok(composeContent.length > 50);
  });
  it("starts with services: key", () => {
    assert.match(composeContent, /^services:/m);
  });
  it("defines exactly two services", () => {
    assert.ok(composeContent.includes("openclaw-gateway:"));
    assert.ok(composeContent.includes("caddy:"));
    assert.ok(!composeContent.includes("lobster-fetch:"));
  });
  it("defines named volumes section", () => {
    assert.ok(composeContent.includes("volumes:"));
    assert.ok(composeContent.includes("caddy_data:"));
  });
});

describe("docker-compose — openclaw-gateway", () => {
  const section = extractService(composeContent, "openclaw-gateway");
  it("has no public ports exposed", () => {
    assert.ok(!section.includes("ports:"));
  });
  it("has restart: unless-stopped", () => {
    assert.ok(section.includes("restart: unless-stopped"));
  });
  it("has init: true for proper signal handling", () => {
    assert.ok(section.includes("init: true"));
  });
  it("sets NODE_ENV=production", () => {
    assert.ok(section.includes("NODE_ENV=production"));
  });
  it("references OPENAI_API_KEY", () => {
    assert.ok(section.includes("OPENAI_API_KEY"));
  });
  it("references OPENCLAW_GATEWAY_TOKEN", () => {
    assert.ok(section.includes("OPENCLAW_GATEWAY_TOKEN"));
  });
  it("does not reference removed social API keys", () => {
    assert.ok(!section.includes("MOLTBOOK"));
    assert.ok(!section.toLowerCase().includes("moltbook"));
  });
  it("mounts openclaw.json as read-only", () => {
    assert.ok(section.includes("openclaw.json") && section.includes(":ro"));
  });
  it("mounts workspace directory", () => {
    assert.ok(section.includes("workspace"));
  });
  it("binds gateway to loopback only", () => {
    assert.ok(section.includes("--bind loopback"));
  });
  it("uses port 18789", () => {
    assert.ok(section.includes("--port 18789"));
  });
  it("builds from parent context with Dockerfile", () => {
    assert.ok(section.includes("context: .."));
    assert.ok(section.includes("dockerfile: Dockerfile"));
  });
});

describe("docker-compose — caddy", () => {
  const section = extractService(composeContent, "caddy");
  it("uses official caddy:2-alpine image", () => {
    assert.ok(section.includes("caddy:2-alpine"));
  });
  it("exposes port 80", () => {
    assert.ok(section.includes('"80:80"') || section.includes("80:80"));
  });
  it("exposes port 443", () => {
    assert.ok(section.includes('"443:443"') || section.includes("443:443"));
  });
  it("mounts site/public as read-only", () => {
    assert.ok(section.includes("site/public") && section.includes(":ro"));
  });
});

describe("docker-compose — security", () => {
  it("does not contain hardcoded API keys", () => {
    assert.ok(!composeContent.match(/sk-[a-zA-Z0-9]{20}/));
  });
  it("uses ${} variable interpolation for secrets", () => {
    assert.ok(composeContent.includes("${OPENAI_API_KEY}"));
    assert.ok(composeContent.includes("${OPENCLAW_GATEWAY_TOKEN}"));
  });
});
