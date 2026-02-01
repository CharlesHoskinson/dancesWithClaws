import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const composePath = join(__dirname, '..', 'docker-compose.logan.yml');
const composeContent = readFileSync(composePath, 'utf-8');

// Simple YAML parser for our needs — just validates structure
function parseSimpleYaml(text) {
  const lines = text.split('\n');
  const services = {};
  let currentService = null;

  for (const line of lines) {
    const serviceMatch = line.match(/^  (\S+):$/);
    if (serviceMatch && !line.startsWith('    ')) {
      currentService = serviceMatch[1];
      services[currentService] = { lines: [] };
    }
    if (currentService) {
      services[currentService].lines.push(line);
    }
  }
  return services;
}

describe('docker-compose.logan.yml', () => {
  it('is readable', () => {
    assert.ok(composeContent.length > 0);
  });

  it('defines exactly three services', () => {
    const serviceNames = [];
    let inServices = false;
    for (const line of composeContent.split('\n')) {
      if (/^services:\s*$/.test(line)) { inServices = true; continue; }
      if (inServices && /^[a-z]/.test(line)) { inServices = false; }
      if (inServices) {
        const m = line.match(/^  ([\w-]+):\s*$/);
        if (m) serviceNames.push(m[1]);
      }
    }
    assert.deepEqual(serviceNames.sort(), ['caddy', 'lobster-fetch', 'openclaw-gateway']);
  });

  it('openclaw-gateway has no public ports', () => {
    // Extract gateway section
    const gatewaySection = extractService(composeContent, 'openclaw-gateway');
    assert.ok(!gatewaySection.includes('ports:'), 'Gateway should not expose ports');
  });

  it('openclaw-gateway has restart policy', () => {
    const gatewaySection = extractService(composeContent, 'openclaw-gateway');
    assert.ok(gatewaySection.includes('restart: unless-stopped'));
  });

  it('openclaw-gateway references required env vars', () => {
    const gatewaySection = extractService(composeContent, 'openclaw-gateway');
    assert.ok(gatewaySection.includes('MOLTBOOK_API_KEY'));
    assert.ok(gatewaySection.includes('OPENAI_API_KEY'));
    assert.ok(gatewaySection.includes('OPENCLAW_GATEWAY_TOKEN'));
  });

  it('caddy exposes ports 80 and 443', () => {
    const caddySection = extractService(composeContent, 'caddy');
    assert.ok(caddySection.includes('"80:80"'));
    assert.ok(caddySection.includes('"443:443"'));
  });

  it('caddy mounts Caddyfile', () => {
    const caddySection = extractService(composeContent, 'caddy');
    assert.ok(caddySection.includes('Caddyfile'));
  });

  it('caddy mounts site/public as read-only', () => {
    const caddySection = extractService(composeContent, 'caddy');
    assert.ok(caddySection.includes('site/public') && caddySection.includes(':ro'));
  });

  it('lobster-fetch shares site/public volume with caddy', () => {
    const fetchSection = extractService(composeContent, 'lobster-fetch');
    assert.ok(fetchSection.includes('site/public'));
  });

  it('lobster-fetch has MOLTBOOK_API_KEY', () => {
    const fetchSection = extractService(composeContent, 'lobster-fetch');
    assert.ok(fetchSection.includes('MOLTBOOK_API_KEY'));
  });

  it('does not contain hardcoded secrets', () => {
    assert.ok(!composeContent.includes('moltbook_'));
    assert.ok(!composeContent.includes('sk-'));
    // Ensure env vars use ${} interpolation, not hardcoded values
    assert.ok(!composeContent.match(/MOLTBOOK_API_KEY=moltbook_/));
    assert.ok(!composeContent.match(/OPENAI_API_KEY=sk-/));
  });

  it('all services have json-file logging with limits', () => {
    assert.ok(composeContent.match(/max-size/g).length >= 3);
    assert.ok(composeContent.match(/max-file/g).length >= 3);
  });
});

// Extract a service block from compose content
function extractService(content, serviceName) {
  const lines = content.split('\n');
  let capturing = false;
  let indent = 0;
  const result = [];

  for (const line of lines) {
    const regex = new RegExp(`^  ${serviceName}:`);
    if (regex.test(line)) {
      capturing = true;
      indent = 2;
      result.push(line);
      continue;
    }
    if (capturing) {
      if (line.trim() === '') {
        result.push(line);
        continue;
      }
      // Check if we've left the service block (back to indent level 2 or less with content)
      const lineIndent = line.search(/\S/);
      if (lineIndent <= indent && lineIndent >= 0 && !line.trim().startsWith('-') && !line.trim().startsWith('#')) {
        break;
      }
      result.push(line);
    }
  }
  return result.join('\n');
}
