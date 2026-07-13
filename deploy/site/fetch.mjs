/**
 * Static site generator for Lobster Thoughts (no external social APIs).
 * Writes public/index.html from template.html.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = join(__dirname, "public");
const templatePath = join(__dirname, "template.html");

export function escapeHtml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function renderPage(template, updatedIso) {
  return template.replaceAll("{{UPDATED}}", escapeHtml(updatedIso));
}

export function writeSite(outDir = publicDir) {
  mkdirSync(outDir, { recursive: true });
  const template = readFileSync(templatePath, "utf8");
  const updated = new Date().toISOString();
  const html = renderPage(template, updated);
  writeFileSync(join(outDir, "index.html"), html, "utf8");
  try {
    const css = readFileSync(join(__dirname, "style.css"), "utf8");
    writeFileSync(join(outDir, "style.css"), css, "utf8");
  } catch {
    // style.css optional at generate time
  }
  return { updated, path: join(outDir, "index.html") };
}

// CLI: node fetch.mjs  (or loop for deploy containers if desired)
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const once = process.env.FETCH_ONCE === "1" || process.argv.includes("--once");
  const result = writeSite();
  console.log(`Wrote ${result.path} at ${result.updated}`);
  if (!once) {
    const intervalSec = Number(process.env.FETCH_INTERVAL || 3600);
    setInterval(() => {
      const r = writeSite();
      console.log(`Refreshed ${r.path} at ${r.updated}`);
    }, Math.max(60, intervalSec) * 1000);
  }
}
