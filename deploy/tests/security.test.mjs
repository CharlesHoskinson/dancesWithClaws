// SECURITY CHECKLIST — Logan Deployment
// ═══════════════════════════════════════
// [x] XSS: All user-sourced content (title, content, submolt, timestamp) escaped via escapeHtml()
// [x] XSS: Markdown renderer escapes HTML before applying formatting
// [x] XSS: Dangerous URI schemes (javascript:, data:, vbscript:) stripped from markdown links
// [x] XSS: Rendered HTML contains no <script>, <img onerror, <svg onload vectors
// [x] SECRETS: No API keys (moltbook_, sk-) in any rendered output
// [x] SECRETS: Docker compose uses ${} interpolation, never hardcoded values
// [x] SECRETS: .env file chmod 600, never committed to git
// [x] SECRETS: GitHub Actions uses ${{ secrets.* }} for all sensitive values
// [x] SECRETS: openclaw.json redactPatterns cover MOLTBOOK_API_KEY, OPENAI_API_KEY
// [x] NETWORK: Gateway bound to loopback only, no public ports
// [x] NETWORK: Only Caddy exposes 80/443
// [x] NETWORK: Caddy serves static files only from /site/public
// [x] HEADERS: HSTS with max-age=31536000
// [x] HEADERS: CSP default-src 'none' with minimal allowlist
// [x] HEADERS: X-Frame-Options DENY (clickjacking)
// [x] HEADERS: X-Content-Type-Options nosniff (MIME sniffing)
// [x] HEADERS: Permissions-Policy restricts device APIs
// [x] DOCKER: Sandbox drops ALL capabilities
// [x] DOCKER: Sandbox network=none (no outbound from agent tools)
// [x] DOCKER: Sandbox readOnlyRoot=true
// [x] DOCKER: Sandbox pidsLimit=256, memory=512m
// [x] DOCKER: All services use json-file logging with rotation
// [x] DOCKER: Dockerfile.fetch uses slim base, no extra packages
// [x] SSH: ed25519 keys only
// [x] SSH: Password auth disabled
// [x] SSH: fail2ban installed
// [x] SSH: Unattended security upgrades enabled
// [x] CI/CD: Tests must pass before deploy
// [x] CI/CD: No hardcoded secrets in workflow
// [x] VOLUMES: openclaw.json mounted read-only
// [x] VOLUMES: Caddyfile mounted read-only
// [x] VOLUMES: site/public read-only for Caddy, writable for fetch

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { escapeHtml, renderMarkdown, renderPost, renderPage } from "../site/fetch.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const deployDir = join(__dirname, "..");
const repoRoot = join(deployDir, "..");

// ═══════════════════════════════════════════
// A. XSS Prevention (Content Injection)
// ═══════════════════════════════════════════

describe("XSS Prevention — Script Injection", () => {
  it("escapes <script> tag in title", () => {
    const html = renderPost({
      title: "<script>alert(1)</script>",
      content: "",
      submolt: "general",
      created_at: "",
    });
    assert.ok(!html.includes("<script>"));
    assert.ok(html.includes("&lt;script&gt;"));
  });

  it("escapes <script> tag in content", () => {
    const html = renderPost({
      title: "Safe",
      content: "<script>alert(1)</script>",
      submolt: "general",
      created_at: "",
    });
    assert.ok(!html.includes("<script>"));
  });

  it("escapes <script> tag in submolt", () => {
    const html = renderPost({
      title: "Safe",
      content: "",
      submolt: "<script>alert(1)</script>",
      created_at: "",
    });
    assert.ok(!html.includes("<script>"));
  });
});

describe("XSS Prevention — Event Handlers", () => {
  it("escapes onerror attribute so it is not executable", () => {
    const html = renderPost({
      title: "T",
      content: '<img onerror="alert(1)" src=x>',
      submolt: "g",
      created_at: "",
    });
    // The raw <img tag must be escaped; onerror as text in escaped form is harmless
    assert.ok(!html.includes("<img "));
    assert.ok(html.includes("&lt;img"));
  });

  it("escapes onload attribute so it is not executable", () => {
    const html = renderPost({
      title: "T",
      content: '<body onload="alert(1)">',
      submolt: "g",
      created_at: "",
    });
    assert.ok(!html.includes("<body "));
    assert.ok(html.includes("&lt;body"));
  });

  it("escapes onfocus attribute so it is not executable", () => {
    const html = renderPost({
      title: "T",
      content: '<input onfocus="alert(1)">',
      submolt: "g",
      created_at: "",
    });
    assert.ok(!html.includes("<input "));
    assert.ok(html.includes("&lt;input"));
  });
});

describe("XSS Prevention — SVG-based XSS", () => {
  it("escapes <svg onload=...> in content", () => {
    const html = renderPost({
      title: "T",
      content: '<svg onload="alert(1)">',
      submolt: "g",
      created_at: "",
    });
    // Raw <svg must be escaped so it cannot execute
    assert.ok(!html.includes("<svg "));
    assert.ok(html.includes("&lt;svg"));
  });

  it("escapes <svg> with nested script in content", () => {
    const html = renderPost({
      title: "T",
      content: "<svg><script>alert(1)</script></svg>",
      submolt: "g",
      created_at: "",
    });
    assert.ok(!html.includes("<svg>"));
    assert.ok(!html.includes("<script>"));
  });
});

describe("XSS Prevention — Nested/Recursive Escaping", () => {
  it("handles double-encoded angle brackets", () => {
    const html = renderPost({
      title: "T",
      content: "&lt;script&gt;alert(1)&lt;/script&gt;",
      submolt: "g",
      created_at: "",
    });
    // The & should be escaped to &amp; so the entity never resolves to <script>
    assert.ok(!html.includes("<script>"));
  });

  it("handles HTML entity abuse &#x3C;script&#x3E;", () => {
    const html = renderPost({
      title: "T",
      content: "&#x3C;script&#x3E;alert(1)&#x3C;/script&#x3E;",
      submolt: "g",
      created_at: "",
    });
    assert.ok(!html.includes("<script>"));
  });
});

describe("XSS Prevention — Dangerous URI Schemes in Markdown", () => {
  it("strips javascript: links", () => {
    const result = renderMarkdown("[click](javascript:alert(1))");
    assert.ok(!result.includes("javascript:"));
    assert.ok(!result.includes("<a"));
    assert.ok(result.includes("click"));
  });

  it("strips JavaScript: links (case-insensitive)", () => {
    const result = renderMarkdown("[click](JavaScript:alert(1))");
    assert.ok(!result.includes("JavaScript:"));
    assert.ok(!result.includes("<a"));
  });

  it("strips JAVASCRIPT: links (uppercase)", () => {
    const result = renderMarkdown("[click](JAVASCRIPT:alert(1))");
    assert.ok(!result.includes("JAVASCRIPT:"));
    assert.ok(!result.includes("<a"));
  });

  it("strips data: URI links", () => {
    const result = renderMarkdown("[click](data:text/html,<script>alert(1)</script>)");
    assert.ok(!result.includes("data:"));
    assert.ok(!result.includes("<a"));
  });

  it("strips Data: URI links (case-insensitive)", () => {
    const result = renderMarkdown("[click](Data:text/html,<script>alert(1)</script>)");
    assert.ok(!result.includes("<a"));
  });

  it("strips vbscript: links", () => {
    const result = renderMarkdown('[click](vbscript:MsgBox("XSS"))');
    assert.ok(!result.includes("vbscript:"));
    assert.ok(!result.includes("<a"));
  });

  it("strips VBScript: links (case-insensitive)", () => {
    const result = renderMarkdown('[click](VBScript:MsgBox("XSS"))');
    assert.ok(!result.includes("<a"));
  });

  it("allows https: links", () => {
    const result = renderMarkdown("[safe](https://example.com)");
    assert.ok(result.includes('<a href="https://example.com"'));
  });

  it("allows http: links", () => {
    const result = renderMarkdown("[safe](http://example.com)");
    assert.ok(result.includes('<a href="http://example.com"'));
  });
});

describe("XSS Prevention — Null Byte Injection", () => {
  it("handles null bytes in title", () => {
    const html = renderPost({
      title: "Safe\x00<script>alert(1)</script>",
      content: "",
      submolt: "g",
      created_at: "",
    });
    assert.ok(!html.includes("<script>"));
  });

  it("handles null bytes in content", () => {
    const html = renderPost({
      title: "T",
      content: "Hello\x00<script>alert(1)</script>",
      submolt: "g",
      created_at: "",
    });
    assert.ok(!html.includes("<script>"));
  });
});

describe("XSS Prevention — Unicode / RTL", () => {
  it("handles RTL override characters in title", () => {
    const html = renderPost({
      title: "\u202Emalicious\u202C",
      content: "",
      submolt: "g",
      created_at: "",
    });
    // Should not crash; content should still be escaped
    assert.ok(typeof html === "string");
    assert.ok(!html.includes("<script>"));
  });

  it("handles Unicode homoglyphs in content", () => {
    // Using Cyrillic "а" (U+0430) instead of Latin "a" in script
    const html = renderPost({
      title: "T",
      content: "<\u0455cript>alert(1)</\u0455cript>",
      submolt: "g",
      created_at: "",
    });
    assert.ok(!html.includes("<script>"));
    assert.ok(html.includes("&lt;"));
  });
});

// ═══════════════════════════════════════════
// B. Secret Leakage
// ═══════════════════════════════════════════

describe("Secret Leakage — Rendered Output", () => {
  const template = readFileSync(join(deployDir, "site", "template.html"), "utf-8");
  const css = readFileSync(join(deployDir, "site", "style.css"), "utf-8");
  const mockPosts = JSON.parse(
    readFileSync(join(__dirname, "fixtures", "mock-posts.json"), "utf-8"),
  ).posts;
  const rendered = renderPage(mockPosts, template, css);

  it("no moltbook_ API key patterns in rendered HTML", () => {
    assert.ok(!rendered.includes("moltbook_"));
  });

  it("no sk- API key patterns in rendered HTML", () => {
    assert.ok(!rendered.match(/sk-[a-zA-Z0-9]{10}/));
  });

  it("no Bearer token in rendered HTML", () => {
    assert.ok(!rendered.includes("Bearer "));
  });

  it("no ${...} env var references in rendered HTML", () => {
    assert.ok(!rendered.match(/\$\{[A-Z_]+\}/));
  });

  it("no process.env references in rendered HTML", () => {
    assert.ok(!rendered.includes("process.env"));
  });
});

describe("Secret Leakage — Docker Compose", () => {
  const compose = readFileSync(join(deployDir, "docker-compose.logan.yml"), "utf-8");

  it("uses ${} interpolation for MOLTBOOK_API_KEY", () => {
    assert.ok(compose.includes("${MOLTBOOK_API_KEY}"));
    assert.ok(!compose.match(/MOLTBOOK_API_KEY=moltbook_/));
  });

  it("uses ${} interpolation for OPENAI_API_KEY", () => {
    assert.ok(compose.includes("${OPENAI_API_KEY}"));
    assert.ok(!compose.match(/OPENAI_API_KEY=sk-/));
  });

  it("uses ${} interpolation for OPENCLAW_GATEWAY_TOKEN", () => {
    assert.ok(compose.includes("${OPENCLAW_GATEWAY_TOKEN}"));
  });

  it("has no hardcoded secret values", () => {
    assert.ok(!compose.match(/moltbook_[a-zA-Z0-9]{10}/));
    assert.ok(!compose.match(/sk-[a-zA-Z0-9]{10}/));
  });
});

describe("Secret Leakage — Caddyfile", () => {
  const caddyfile = readFileSync(join(deployDir, "Caddyfile"), "utf-8");

  it("has no API keys", () => {
    assert.ok(!caddyfile.includes("moltbook_"));
    assert.ok(!caddyfile.includes("sk-"));
  });

  it("has no passwords", () => {
    assert.ok(!caddyfile.includes("password"));
  });

  it("has no tokens", () => {
    assert.ok(!caddyfile.match(/token[=:]\s*\S{20}/i));
  });
});

describe("Secret Leakage — Dockerfile.fetch", () => {
  const dockerfile = readFileSync(join(deployDir, "site", "Dockerfile.fetch"), "utf-8");

  it("has no secrets", () => {
    assert.ok(!dockerfile.includes("MOLTBOOK_API_KEY"));
    assert.ok(!dockerfile.includes("OPENAI_API_KEY"));
    assert.ok(!dockerfile.includes("sk-"));
  });

  it("does not copy .env", () => {
    assert.ok(!dockerfile.includes(".env"));
  });
});

describe("Secret Leakage — setup.sh", () => {
  const setup = readFileSync(join(deployDir, "setup.sh"), "utf-8");

  it("has no hardcoded API keys", () => {
    assert.ok(!setup.includes("moltbook_"));
    assert.ok(!setup.match(/sk-[a-zA-Z0-9]{20}/));
  });
});

describe("Secret Leakage — GitHub Actions workflow", () => {
  const workflow = readFileSync(
    join(repoRoot, ".github", "workflows", "deploy-logan.yml"),
    "utf-8",
  );

  it("uses only ${{ secrets.* }} for sensitive values", () => {
    const secretRefs = workflow.match(/\$\{\{\s*secrets\.\w+\s*\}\}/g) || [];
    assert.ok(secretRefs.length >= 3, `Expected ≥3 secret refs, got ${secretRefs.length}`);
  });

  it("has no hardcoded secrets", () => {
    assert.ok(!workflow.includes("moltbook_"));
    assert.ok(!workflow.includes("sk-"));
  });
});

describe("Secret Leakage — openclaw.json", () => {
  const config = JSON.parse(readFileSync(join(repoRoot, "openclaw.json"), "utf-8"));

  it("redactPatterns cover MOLTBOOK_API_KEY", () => {
    assert.ok(config.logging.redactPatterns.includes("MOLTBOOK_API_KEY"));
  });

  it("redactPatterns cover OPENAI_API_KEY", () => {
    assert.ok(config.logging.redactPatterns.includes("OPENAI_API_KEY"));
  });

  it("env vars have no real values", () => {
    assert.equal(config.env.vars.MOLTBOOK_API_KEY, "");
    assert.equal(config.env.vars.OPENAI_API_KEY, "");
  });
});

describe("Secret Leakage — Mock Fixture", () => {
  const raw = readFileSync(join(__dirname, "fixtures", "mock-posts.json"), "utf-8");

  it("has no real API keys", () => {
    assert.ok(!raw.includes("moltbook_"));
    assert.ok(!raw.match(/sk-[a-zA-Z0-9]{20}/));
  });

  it("has no Bearer tokens", () => {
    assert.ok(!raw.includes("Bearer "));
  });
});

// ═══════════════════════════════════════════
// C. Network Security
// ═══════════════════════════════════════════

describe("Network Security", () => {
  const compose = readFileSync(join(deployDir, "docker-compose.logan.yml"), "utf-8");

  it("gateway binds to loopback only", () => {
    assert.ok(compose.includes("--bind loopback"));
    assert.ok(!compose.match(/--bind\s+0\.0\.0\.0/));
  });

  it("gateway does not expose ports in compose", () => {
    // openclaw-gateway service should not have a ports: section
    const gatewaySection = compose.split("caddy:")[0];
    assert.ok(!gatewaySection.includes("ports:"));
  });

  it("lobster-fetch does not expose ports", () => {
    const fetchSection = compose.split("lobster-fetch:")[1]?.split("volumes:")[0] || "";
    assert.ok(!fetchSection.includes("ports:"));
  });

  it("only caddy exposes 80 and 443", () => {
    const matches = compose.match(/"\d+:\d+"/g) || [];
    const ports = matches.map((m) => m.replace(/"/g, ""));
    assert.deepEqual(ports.toSorted(), ["443:443", "80:80"]);
  });

  it("Caddyfile serves from restricted root /site/public", () => {
    const caddyfile = readFileSync(join(deployDir, "Caddyfile"), "utf-8");
    assert.ok(caddyfile.includes("root * /site/public"));
    // Should not serve from / or /etc or any other broad path
    assert.ok(!caddyfile.includes("root * /\n"));
    assert.ok(!caddyfile.includes("root * /etc"));
  });
});

// ═══════════════════════════════════════════
// D. HTTP Security Headers (Caddyfile)
// ═══════════════════════════════════════════

describe("HTTP Security Headers", () => {
  const caddyfile = readFileSync(join(deployDir, "Caddyfile"), "utf-8");

  it("sets X-Content-Type-Options nosniff", () => {
    assert.ok(caddyfile.includes("X-Content-Type-Options nosniff"));
  });

  it("sets X-Frame-Options DENY", () => {
    assert.ok(caddyfile.includes("X-Frame-Options DENY"));
  });

  it("sets Referrer-Policy strict-origin-when-cross-origin", () => {
    assert.ok(caddyfile.includes("Referrer-Policy strict-origin-when-cross-origin"));
  });

  it("sets Strict-Transport-Security with long max-age", () => {
    assert.ok(caddyfile.includes("Strict-Transport-Security"));
    assert.ok(caddyfile.includes("max-age=31536000"));
    assert.ok(caddyfile.includes("includeSubDomains"));
  });

  it("sets Content-Security-Policy with default-src none", () => {
    assert.ok(caddyfile.includes("Content-Security-Policy"));
    assert.ok(caddyfile.includes("default-src 'none'"));
  });

  it("sets Permissions-Policy restricting device APIs", () => {
    assert.ok(caddyfile.includes("Permissions-Policy"));
    assert.ok(caddyfile.includes("camera=()"));
    assert.ok(caddyfile.includes("microphone=()"));
    assert.ok(caddyfile.includes("geolocation=()"));
  });

  it("sets X-XSS-Protection", () => {
    assert.ok(caddyfile.includes("X-XSS-Protection"));
    assert.ok(caddyfile.includes("mode=block"));
  });
});

// ═══════════════════════════════════════════
// E. Docker Security
// ═══════════════════════════════════════════

describe("Docker Security — openclaw.json Sandbox", () => {
  const config = JSON.parse(readFileSync(join(repoRoot, "openclaw.json"), "utf-8"));
  const agent = config.agents.list[0];

  it('sandbox mode is "all"', () => {
    assert.equal(agent.sandbox.mode, "all");
  });

  it("readOnlyRoot is true", () => {
    assert.equal(agent.sandbox.docker.readOnlyRoot, true);
  });

  it("capDrop includes ALL", () => {
    assert.ok(agent.sandbox.docker.capDrop.includes("ALL"));
  });

  it("network is none", () => {
    assert.equal(agent.sandbox.docker.network, "none");
  });

  it("pidsLimit is <= 256", () => {
    assert.ok(agent.sandbox.docker.pidsLimit <= 256);
  });

  it("memory is <= 512m", () => {
    assert.ok(agent.sandbox.docker.memory === "512m");
  });
});

describe("Docker Security — Dockerfile.fetch", () => {
  const dockerfile = readFileSync(join(deployDir, "site", "Dockerfile.fetch"), "utf-8");

  it("uses slim base image", () => {
    assert.ok(dockerfile.includes("-slim"));
  });

  it("runs no privileged operations", () => {
    assert.ok(!dockerfile.includes("--privileged"));
    assert.ok(!dockerfile.includes("SYS_ADMIN"));
    assert.ok(!dockerfile.includes("NET_ADMIN"));
  });
});

describe("Docker Security — Log Rotation", () => {
  const compose = readFileSync(join(deployDir, "docker-compose.logan.yml"), "utf-8");

  it("all services have json-file logging", () => {
    const logDriverMatches = compose.match(/driver:\s*json-file/g) || [];
    // 3 services: openclaw-gateway, caddy, lobster-fetch
    assert.ok(
      logDriverMatches.length >= 3,
      `Expected ≥3 log drivers, got ${logDriverMatches.length}`,
    );
  });

  it("all services have max-size configured", () => {
    const maxSizeMatches = compose.match(/max-size:/g) || [];
    assert.ok(
      maxSizeMatches.length >= 3,
      `Expected ≥3 max-size entries, got ${maxSizeMatches.length}`,
    );
  });

  it("all services have max-file configured", () => {
    const maxFileMatches = compose.match(/max-file:/g) || [];
    assert.ok(
      maxFileMatches.length >= 3,
      `Expected ≥3 max-file entries, got ${maxFileMatches.length}`,
    );
  });
});

// ═══════════════════════════════════════════
// F. SSH & Deployment Hardening
// ═══════════════════════════════════════════

describe("SSH & Deployment Hardening — setup.sh", () => {
  const setup = readFileSync(join(deployDir, "setup.sh"), "utf-8");

  it("generates ed25519 SSH keys", () => {
    assert.ok(setup.includes("ed25519"));
  });

  it("disables password authentication", () => {
    assert.ok(setup.includes("PasswordAuthentication no"));
  });

  it("installs fail2ban", () => {
    assert.ok(setup.includes("fail2ban"));
  });

  it("enables unattended-upgrades", () => {
    assert.ok(setup.includes("unattended-upgrades"));
  });

  it("sets .env to chmod 600", () => {
    assert.ok(setup.includes("chmod 600"));
    assert.ok(setup.includes(".env"));
  });
});

describe("SSH & Deployment Hardening — CI/CD", () => {
  const workflow = readFileSync(
    join(repoRoot, ".github", "workflows", "deploy-logan.yml"),
    "utf-8",
  );

  it("tests must pass before deploy (needs: test)", () => {
    assert.ok(workflow.includes("needs: test"));
  });

  it("deploy uses secrets not hardcoded values", () => {
    assert.ok(workflow.includes("${{ secrets.LOGAN_VM_HOST }}"));
    assert.ok(workflow.includes("${{ secrets.LOGAN_VM_USER }}"));
    assert.ok(workflow.includes("${{ secrets.LOGAN_VM_SSH_KEY }}"));
  });

  it("no hardcoded secrets in workflow", () => {
    assert.ok(!workflow.includes("moltbook_"));
    assert.ok(!workflow.match(/sk-[a-zA-Z0-9]{20}/));
  });
});

// ═══════════════════════════════════════════
// G. Input Validation
// ═══════════════════════════════════════════

describe("Input Validation — fetchPosts resilience", () => {
  // These test the exported function signatures and edge-case handling

  it("renderPost handles missing title gracefully", () => {
    const html = renderPost({ content: "text", submolt: "g", created_at: "" });
    assert.ok(html.includes("Untitled"));
  });

  it("renderPost handles undefined title", () => {
    const html = renderPost({
      title: undefined,
      content: "text",
      submolt: "g",
      created_at: "",
    });
    assert.ok(html.includes("Untitled"));
  });

  it("renderPost handles missing content gracefully", () => {
    const html = renderPost({ title: "T", submolt: "g", created_at: "" });
    assert.ok(typeof html === "string");
    assert.ok(html.includes("post-content"));
  });

  it("renderPost handles missing submolt gracefully", () => {
    const html = renderPost({ title: "T", content: "c", created_at: "" });
    assert.ok(html.includes("m/general"));
  });

  it("renderPost handles missing created_at gracefully", () => {
    const html = renderPost({ title: "T", content: "c", submolt: "g" });
    assert.ok(typeof html === "string");
  });
});

describe("Input Validation — renderPage", () => {
  const template = readFileSync(join(deployDir, "site", "template.html"), "utf-8");
  const css = readFileSync(join(deployDir, "site", "style.css"), "utf-8");

  it("handles empty post array", () => {
    const html = renderPage([], template, css);
    assert.ok(html.includes("No posts yet"));
  });

  it("template placeholders fully replaced", () => {
    const posts = [
      {
        title: "T",
        content: "C",
        submolt: "g",
        created_at: "2026-01-01T00:00:00Z",
      },
    ];
    const html = renderPage(posts, template, css);
    assert.ok(!html.includes("{{POSTS}}"));
    assert.ok(!html.includes("{{UPDATED}}"));
    assert.ok(!html.includes("{{STYLE}}"));
  });

  it("no leftover template placeholders with any name", () => {
    const posts = [
      {
        title: "T",
        content: "C",
        submolt: "g",
        created_at: "2026-01-01T00:00:00Z",
      },
    ];
    const html = renderPage(posts, template, css);
    assert.ok(!html.match(/\{\{[A-Z_]+\}\}/), "Found leftover template placeholder");
  });
});

describe("Input Validation — escapeHtml edge cases", () => {
  it("escapes ampersand", () => {
    assert.equal(escapeHtml("a&b"), "a&amp;b");
  });

  it("escapes less-than", () => {
    assert.equal(escapeHtml("a<b"), "a&lt;b");
  });

  it("escapes greater-than", () => {
    assert.equal(escapeHtml("a>b"), "a&gt;b");
  });

  it("escapes double quote", () => {
    assert.equal(escapeHtml('a"b'), "a&quot;b");
  });

  it("handles empty string", () => {
    assert.equal(escapeHtml(""), "");
  });

  it("handles string with all special chars", () => {
    const result = escapeHtml('<script>"hello"&world</script>');
    assert.ok(!result.includes("<"));
    assert.ok(!result.includes(">"));
    assert.ok(!result.includes('"'));
  });
});

// ═══════════════════════════════════════════
// Volume Mount Security
// ═══════════════════════════════════════════

describe("Volume Mount Security", () => {
  const compose = readFileSync(join(deployDir, "docker-compose.logan.yml"), "utf-8");

  it("openclaw.json is mounted read-only", () => {
    assert.ok(compose.includes("openclaw.json:/home/node/.openclaw/openclaw.json:ro"));
  });

  it("Caddyfile is mounted read-only", () => {
    assert.ok(compose.includes("Caddyfile:/etc/caddy/Caddyfile:ro"));
  });

  it("site/public is read-only for Caddy", () => {
    assert.ok(compose.includes("./site/public:/site/public:ro"));
  });
});
