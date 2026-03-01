import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const composePath = join(__dirname, "..", "docker-compose.logan.yml");
const composeContent = readFileSync(composePath, "utf-8");

// ═══════════════════════════════════════════
// Service extraction helper
// ═══════════════════════════════════════════

function extractService(content, serviceName) {
  const lines = content.split("\n");
  let capturing = false;
  let indent = 2;
  const result = [];

  for (const line of lines) {
    const regex = new RegExp(`^  ${serviceName}:`);
    if (regex.test(line)) {
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
      if (
        lineIndent <= indent &&
        lineIndent >= 0 &&
        !line.trim().startsWith("-") &&
        !line.trim().startsWith("#")
      ) {
        break;
      }
      result.push(line);
    }
  }
  return result.join("\n");
}

// ═══════════════════════════════════════════
// Compose file structure
// ═══════════════════════════════════════════

describe("docker-compose.logan.yml — structure", () => {
  it("is readable and non-empty", () => {
    assert.ok(composeContent.length > 100);
  });

  it("starts with services: key", () => {
    assert.match(composeContent, /^services:/m);
  });

  it("defines exactly three services", () => {
    const serviceNames = [];
    let inServices = false;
    for (const line of composeContent.split("\n")) {
      if (/^services:\s*$/.test(line)) {
        inServices = true;
        continue;
      }
      if (inServices && /^[a-z]/.test(line)) {
        inServices = false;
      }
      if (inServices) {
        const m = line.match(/^  ([\w-]+):\s*$/);
        if (m) {
          serviceNames.push(m[1]);
        }
      }
    }
    assert.deepEqual(serviceNames.toSorted(), ["caddy", "lobster-fetch", "openclaw-gateway"]);
  });

  it("defines named volumes section", () => {
    assert.match(composeContent, /^volumes:/m);
    assert.ok(composeContent.includes("caddy_data:"));
    assert.ok(composeContent.includes("caddy_config:"));
  });
});

// ═══════════════════════════════════════════
// openclaw-gateway service
// ═══════════════════════════════════════════

describe("docker-compose — openclaw-gateway", () => {
  const section = extractService(composeContent, "openclaw-gateway");

  it("has no public ports exposed", () => {
    assert.ok(!section.includes("ports:"), "Gateway should not expose ports");
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

  it("references MOLTBOOK_API_KEY", () => {
    assert.ok(section.includes("MOLTBOOK_API_KEY"));
  });

  it("references OPENAI_API_KEY", () => {
    assert.ok(section.includes("OPENAI_API_KEY"));
  });

  it("references OPENCLAW_GATEWAY_TOKEN", () => {
    assert.ok(section.includes("OPENCLAW_GATEWAY_TOKEN"));
  });

  it("mounts openclaw.json as read-only", () => {
    assert.ok(section.includes("openclaw.json"));
    assert.ok(section.includes(":ro"));
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

  it("has json-file logging with size limits", () => {
    assert.ok(section.includes("max-size"));
    assert.ok(section.includes("max-file"));
  });

  it("builds from parent context with Dockerfile", () => {
    assert.ok(section.includes("context: .."));
    assert.ok(section.includes("dockerfile: Dockerfile"));
  });
});

// ═══════════════════════════════════════════
// caddy service
// ═══════════════════════════════════════════

describe("docker-compose — caddy", () => {
  const section = extractService(composeContent, "caddy");

  it("uses official caddy:2-alpine image", () => {
    assert.ok(section.includes("caddy:2-alpine"));
  });

  it("exposes port 80", () => {
    assert.ok(section.includes('"80:80"'));
  });

  it("exposes port 443", () => {
    assert.ok(section.includes('"443:443"'));
  });

  it("has restart: unless-stopped", () => {
    assert.ok(section.includes("restart: unless-stopped"));
  });

  it("mounts Caddyfile as read-only", () => {
    assert.ok(section.includes("Caddyfile"));
    assert.ok(section.includes("/etc/caddy/Caddyfile:ro"));
  });

  it("mounts site/public as read-only", () => {
    assert.ok(section.includes("site/public:/site/public:ro"));
  });

  it("uses caddy_data named volume", () => {
    assert.ok(section.includes("caddy_data:/data"));
  });

  it("uses caddy_config named volume", () => {
    assert.ok(section.includes("caddy_config:/config"));
  });

  it("has json-file logging with size limits", () => {
    assert.ok(section.includes("max-size"));
    assert.ok(section.includes("max-file"));
  });
});

// ═══════════════════════════════════════════
// lobster-fetch service
// ═══════════════════════════════════════════

describe("docker-compose — lobster-fetch", () => {
  const section = extractService(composeContent, "lobster-fetch");

  it("builds from site directory", () => {
    assert.ok(section.includes("context: ./site"));
    assert.ok(section.includes("Dockerfile.fetch"));
  });

  it("has restart: unless-stopped", () => {
    assert.ok(section.includes("restart: unless-stopped"));
  });

  it("has MOLTBOOK_API_KEY in environment", () => {
    assert.ok(section.includes("MOLTBOOK_API_KEY"));
  });

  it("has LOGAN_AGENT_ID with default value", () => {
    assert.ok(section.includes("LOGAN_AGENT_ID"));
  });

  it("has configurable FETCH_INTERVAL", () => {
    assert.ok(section.includes("FETCH_INTERVAL"));
  });

  it("mounts site/public as writable (no :ro)", () => {
    assert.ok(section.includes("./site/public:/site/public"));
    // The lobster-fetch mount should NOT have :ro
    const fetchPublicMount = section.match(/\.\/site\/public:\/site\/public(:\w+)?/);
    assert.ok(fetchPublicMount);
    assert.ok(!fetchPublicMount[1] || fetchPublicMount[1] !== ":ro");
  });

  it("has json-file logging with size limits", () => {
    assert.ok(section.includes("max-size"));
    assert.ok(section.includes("max-file"));
  });

  it("does not have OPENAI_API_KEY (not needed)", () => {
    assert.ok(!section.includes("OPENAI_API_KEY"));
  });

  it("does not expose any ports", () => {
    assert.ok(!section.includes("ports:"));
  });
});

// ═══════════════════════════════════════════
// Volume consistency
// ═══════════════════════════════════════════

describe("docker-compose — volume consistency", () => {
  it("caddy and lobster-fetch share the same site/public path", () => {
    const caddySection = extractService(composeContent, "caddy");
    const fetchSection = extractService(composeContent, "lobster-fetch");
    // Both should mount to /site/public inside the container
    assert.ok(caddySection.includes(":/site/public"));
    assert.ok(fetchSection.includes(":/site/public"));
  });

  it("caddy reads site/public as read-only, fetch writes it", () => {
    const caddySection = extractService(composeContent, "caddy");
    const fetchSection = extractService(composeContent, "lobster-fetch");
    assert.ok(caddySection.includes("site/public:/site/public:ro"));
    // fetch should not have :ro on its site/public mount
    const fetchLine = fetchSection.split("\n").find((l) => l.includes("site/public:/site/public"));
    assert.ok(fetchLine);
    assert.ok(!fetchLine.includes(":ro"));
  });
});

// ═══════════════════════════════════════════
// Security — no hardcoded secrets
// ═══════════════════════════════════════════

describe("docker-compose — security", () => {
  it("does not contain hardcoded Moltbook API key", () => {
    assert.ok(!composeContent.includes("moltbook_"));
    assert.ok(!composeContent.match(/MOLTBOOK_API_KEY=moltbook_/));
  });

  it("does not contain hardcoded OpenAI API key", () => {
    assert.ok(!composeContent.includes("sk-"));
    assert.ok(!composeContent.match(/OPENAI_API_KEY=sk-/));
  });

  it("uses ${} variable interpolation for all secrets", () => {
    assert.ok(composeContent.includes("${MOLTBOOK_API_KEY}"));
    assert.ok(composeContent.includes("${OPENAI_API_KEY}"));
    assert.ok(composeContent.includes("${OPENCLAW_GATEWAY_TOKEN}"));
  });

  it("does not contain passwords or tokens in plaintext", () => {
    assert.ok(!composeContent.match(/password\s*[:=]\s*\S+/i));
    assert.ok(!composeContent.match(/token\s*[:=]\s*[a-f0-9]{32,}/i));
  });
});
