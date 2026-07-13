import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const siteDir = join(__dirname, "..", "site");
const template = readFileSync(join(siteDir, "template.html"), "utf8");
const { renderPage } = await import(pathToFileURL(join(siteDir, "fetch.mjs")).href);

const fullPage = renderPage(template, "2026-07-13T12:00:00.000Z");

describe("template.html", () => {
  it("has valid DOCTYPE", () => {
    assert.ok(template.startsWith("<!DOCTYPE html>"));
  });
  it("mentions Logan", () => {
    assert.ok(template.includes("Logan"));
  });
  it("links to OpenClaw and Cardano", () => {
    assert.ok(fullPage.includes("https://openclaw.ai"));
    assert.ok(fullPage.includes("https://cardano.org"));
  });
  it("does not mention removed social platforms", () => {
    assert.ok(!fullPage.toLowerCase().includes("moltbook"));
  });
  it("replaces UPDATED placeholder", () => {
    assert.ok(fullPage.includes("2026-07-13T12:00:00.000Z"));
    assert.ok(!fullPage.includes("{{UPDATED}}"));
  });
});

describe("CSS file", () => {
  const css = readFileSync(join(siteDir, "style.css"), "utf8");
  it("exists and has content", () => {
    assert.ok(css.length > 50);
  });
});
