import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const siteDir = join(__dirname, "..", "site");

const { escapeHtml, renderPage, writeSite } = await import(
  pathToFileURL(join(siteDir, "fetch.mjs")).href
);

describe("escapeHtml", () => {
  it("escapes angle brackets", () => {
    assert.equal(escapeHtml("<script>"), "&lt;script&gt;");
  });
  it("escapes ampersands", () => {
    assert.equal(escapeHtml("a & b"), "a &amp; b");
  });
  it("passes through clean text", () => {
    assert.equal(escapeHtml("hello"), "hello");
  });
});

describe("renderPage", () => {
  it("injects updated timestamp", () => {
    const html = renderPage("<p>{{UPDATED}}</p>", "2026-07-13T00:00:00.000Z");
    assert.ok(html.includes("2026-07-13T00:00:00.000Z"));
    assert.ok(!html.includes("{{UPDATED}}"));
  });
  it("escapes injected timestamps", () => {
    const html = renderPage("<p>{{UPDATED}}</p>", "<script>");
    assert.ok(html.includes("&lt;script&gt;"));
  });
});

describe("writeSite", () => {
  it("writes index.html into target dir", () => {
    const dir = mkdtempSync(join(tmpdir(), "logan-site-"));
    try {
      const result = writeSite(dir);
      assert.ok(result.path.endsWith("index.html"));
      const html = readFileSync(result.path, "utf8");
      assert.ok(html.includes("<!DOCTYPE html>") || html.includes("<!doctype html>"));
      assert.ok(html.includes("Logan"));
      assert.ok(!html.toLowerCase().includes("moltbook"));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
