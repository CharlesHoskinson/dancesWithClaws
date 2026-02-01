import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const deployDir = join(__dirname, '..');
const repoRoot = join(deployDir, '..');

// ═══════════════════════════════════════════
// Caddyfile
// ═══════════════════════════════════════════

describe('Caddyfile', () => {
  const caddyfile = readFileSync(join(deployDir, 'Caddyfile'), 'utf-8');

  it('exists and has content', () => {
    assert.ok(caddyfile.length > 10);
  });

  it('uses SITE_DOMAIN env var with localhost default', () => {
    assert.ok(caddyfile.includes('{$SITE_DOMAIN:localhost}'));
  });

  it('serves from /site/public', () => {
    assert.ok(caddyfile.includes('root * /site/public'));
  });

  it('enables file_server', () => {
    assert.ok(caddyfile.includes('file_server'));
  });

  it('enables gzip compression', () => {
    assert.ok(caddyfile.includes('encode gzip'));
  });

  it('sets X-Content-Type-Options nosniff', () => {
    assert.ok(caddyfile.includes('X-Content-Type-Options nosniff'));
  });

  it('sets X-Frame-Options DENY', () => {
    assert.ok(caddyfile.includes('X-Frame-Options DENY'));
  });

  it('sets Referrer-Policy', () => {
    assert.ok(caddyfile.includes('Referrer-Policy strict-origin-when-cross-origin'));
  });

  it('sets Strict-Transport-Security (HSTS)', () => {
    assert.ok(caddyfile.includes('Strict-Transport-Security'));
    assert.ok(caddyfile.includes('max-age=31536000'));
  });

  it('sets Content-Security-Policy', () => {
    assert.ok(caddyfile.includes('Content-Security-Policy'));
    assert.ok(caddyfile.includes("default-src 'none'"));
  });

  it('sets Permissions-Policy', () => {
    assert.ok(caddyfile.includes('Permissions-Policy'));
    assert.ok(caddyfile.includes('camera=()'));
  });

  it('sets X-XSS-Protection', () => {
    assert.ok(caddyfile.includes('X-XSS-Protection'));
  });

  it('has a header block', () => {
    assert.ok(caddyfile.includes('header {'));
  });

  it('does not contain hardcoded domain names', () => {
    assert.ok(!caddyfile.includes('lobsterthoughts.eastus'));
    assert.ok(!caddyfile.includes('example.com'));
  });

  it('does not contain secrets', () => {
    assert.ok(!caddyfile.includes('moltbook_'));
    assert.ok(!caddyfile.includes('sk-'));
    assert.ok(!caddyfile.includes('password'));
  });
});

// ═══════════════════════════════════════════
// Dockerfile.fetch
// ═══════════════════════════════════════════

describe('Dockerfile.fetch', () => {
  const dockerfile = readFileSync(join(deployDir, 'site', 'Dockerfile.fetch'), 'utf-8');

  it('exists and has content', () => {
    assert.ok(dockerfile.length > 10);
  });

  it('uses node:22-slim base image', () => {
    assert.ok(dockerfile.includes('FROM node:22-slim'));
  });

  it('sets WORKDIR', () => {
    assert.ok(dockerfile.includes('WORKDIR /app'));
  });

  it('copies fetch.mjs', () => {
    assert.ok(dockerfile.includes('fetch.mjs'));
  });

  it('copies template.html', () => {
    assert.ok(dockerfile.includes('template.html'));
  });

  it('copies style.css', () => {
    assert.ok(dockerfile.includes('style.css'));
  });

  it('runs node fetch.mjs as CMD', () => {
    assert.ok(dockerfile.includes('CMD ["node", "fetch.mjs"]'));
  });

  it('does not copy .env files', () => {
    assert.ok(!dockerfile.includes('.env'));
  });

  it('does not contain secrets', () => {
    assert.ok(!dockerfile.includes('MOLTBOOK_API_KEY'));
    assert.ok(!dockerfile.includes('OPENAI_API_KEY'));
    assert.ok(!dockerfile.includes('sk-'));
  });

  it('uses slim variant (not full or alpine)', () => {
    assert.ok(dockerfile.includes('-slim'));
  });

  it('does not install extra packages', () => {
    assert.ok(!dockerfile.includes('apt-get'));
    assert.ok(!dockerfile.includes('npm install'));
  });
});

// ═══════════════════════════════════════════
// GitHub Actions workflow
// ═══════════════════════════════════════════

describe('deploy-logan.yml workflow', () => {
  const workflow = readFileSync(join(repoRoot, '.github', 'workflows', 'deploy-logan.yml'), 'utf-8');

  it('exists and has content', () => {
    assert.ok(workflow.length > 50);
  });

  it('has a name', () => {
    assert.match(workflow, /^name:/m);
  });

  it('triggers on push to master', () => {
    assert.ok(workflow.includes('push:'));
    assert.ok(workflow.includes('branches:'));
    assert.ok(workflow.includes('master'));
  });

  it('supports manual trigger via workflow_dispatch', () => {
    assert.ok(workflow.includes('workflow_dispatch'));
  });

  it('has a test job', () => {
    assert.ok(workflow.includes('test:'));
  });

  it('has a deploy job', () => {
    assert.ok(workflow.includes('deploy:'));
  });

  it('deploy job depends on test job', () => {
    assert.ok(workflow.includes('needs: test'));
  });

  it('test job uses node 22', () => {
    assert.ok(workflow.includes('node-version: 22'));
  });

  it('test job runs node --test', () => {
    assert.ok(workflow.includes('node --test'));
  });

  it('test job runs all test files', () => {
    assert.ok(workflow.includes('deploy/tests/*.test.mjs'));
  });

  it('uses actions/checkout@v4', () => {
    assert.ok(workflow.includes('actions/checkout@v4'));
  });

  it('uses actions/setup-node@v4', () => {
    assert.ok(workflow.includes('actions/setup-node@v4'));
  });

  it('deploy uses SSH action', () => {
    assert.ok(workflow.includes('appleboy/ssh-action'));
  });

  it('references LOGAN_VM_HOST secret', () => {
    assert.ok(workflow.includes('LOGAN_VM_HOST'));
  });

  it('references LOGAN_VM_USER secret', () => {
    assert.ok(workflow.includes('LOGAN_VM_USER'));
  });

  it('references LOGAN_VM_SSH_KEY secret', () => {
    assert.ok(workflow.includes('LOGAN_VM_SSH_KEY'));
  });

  it('deploy script does git pull', () => {
    assert.ok(workflow.includes('git pull'));
  });

  it('deploy script builds all services', () => {
    assert.ok(workflow.includes('docker compose'));
    assert.ok(workflow.match(/build\b/));
  });

  it('deploy script runs docker compose up', () => {
    assert.ok(workflow.includes('up -d'));
  });

  it('deploy script prunes old images', () => {
    assert.ok(workflow.includes('docker image prune'));
  });

  it('deploy script uses deploy key for git', () => {
    assert.ok(workflow.includes('deploy_key'));
  });

  it('does not contain hardcoded secrets', () => {
    assert.ok(!workflow.includes('moltbook_'));
    assert.ok(!workflow.includes('sk-'));
    assert.ok(!workflow.match(/ssh_key:\s+[A-Za-z0-9+/]{20}/));
  });

  it('uses ${{ secrets.* }} for all sensitive values', () => {
    const secretRefs = workflow.match(/\$\{\{\s*secrets\.\w+\s*\}\}/g) || [];
    assert.ok(secretRefs.length >= 3, `Expected at least 3 secret references, got ${secretRefs.length}`);
  });
});

// ═══════════════════════════════════════════
// setup.sh
// ═══════════════════════════════════════════

describe('setup.sh', () => {
  const setup = readFileSync(join(deployDir, 'setup.sh'), 'utf-8');

  it('exists and has content', () => {
    assert.ok(setup.length > 100);
  });

  it('starts with bash shebang', () => {
    assert.ok(setup.startsWith('#!/usr/bin/env bash'));
  });

  it('uses set -euo pipefail', () => {
    assert.ok(setup.includes('set -euo pipefail'));
  });

  it('installs Docker', () => {
    assert.ok(setup.includes('docker'));
    assert.ok(setup.includes('get.docker.com'));
  });

  it('creates logan user', () => {
    assert.ok(setup.includes('DEPLOY_USER="logan"'));
    assert.ok(setup.includes('adduser'));
  });

  it('adds logan user to docker group', () => {
    assert.ok(setup.includes('usermod -aG docker'));
  });

  it('creates project directory at /opt/logan', () => {
    assert.ok(setup.includes('PROJECT_DIR="/opt/logan"'));
    assert.ok(setup.includes('mkdir -p'));
  });

  it('generates ed25519 deploy key', () => {
    assert.ok(setup.includes('ssh-keygen'));
    assert.ok(setup.includes('ed25519'));
  });

  it('clones the dancesWithClaws repo', () => {
    assert.ok(setup.includes('CharlesHoskinson/dancesWithClaws'));
    assert.ok(setup.includes('git clone'));
  });

  it('creates .env file with proper permissions', () => {
    assert.ok(setup.includes('.env'));
    assert.ok(setup.includes('chmod 600'));
  });

  it('prompts for API keys interactively', () => {
    assert.ok(setup.includes('MOLTBOOK_API_KEY'));
    assert.ok(setup.includes('OPENAI_API_KEY'));
    assert.ok(setup.includes('read -r'));
  });

  it('generates random gateway token', () => {
    assert.ok(setup.includes('openssl rand -hex 32'));
    assert.ok(setup.includes('OPENCLAW_GATEWAY_TOKEN'));
  });

  it('sets LOGAN_AGENT_ID', () => {
    assert.ok(setup.includes('LOGAN_AGENT_ID=1f8d0506-e834-4a83-baf9-79de70b6cc87'));
  });

  it('sets SITE_DOMAIN', () => {
    assert.ok(setup.includes('SITE_DOMAIN='));
  });

  it('installs fail2ban', () => {
    assert.ok(setup.includes('fail2ban'));
  });

  it('enables unattended-upgrades', () => {
    assert.ok(setup.includes('unattended-upgrades'));
  });

  it('disables SSH password authentication', () => {
    assert.ok(setup.includes('PasswordAuthentication no'));
  });

  it('reloads sshd after config change', () => {
    assert.ok(setup.includes('systemctl reload sshd'));
  });

  it('has 8 numbered steps', () => {
    for (let i = 1; i <= 8; i++) {
      assert.ok(setup.includes(`[${i}/8]`), `Missing step ${i}/8`);
    }
  });

  it('is idempotent (checks before creating)', () => {
    // Checks for "already installed/exists" patterns
    assert.ok(setup.includes('already installed'));
    assert.ok(setup.includes('already exists'));
    assert.ok(setup.includes('already cloned'));
  });

  it('copies SSH authorized_keys to logan user', () => {
    assert.ok(setup.includes('authorized_keys'));
    assert.ok(setup.includes('chmod 700'));
  });

  it('does not contain hardcoded API keys', () => {
    assert.ok(!setup.includes('moltbook_'));
    assert.ok(!setup.match(/sk-[a-zA-Z0-9]{20}/));
  });

  it('prints next steps after completion', () => {
    assert.ok(setup.includes('Next steps'));
    assert.ok(setup.includes('docker compose'));
  });
});

// ═══════════════════════════════════════════
// File inventory
// ═══════════════════════════════════════════

describe('deploy file inventory', () => {
  it('docker-compose.logan.yml exists', () => {
    assert.ok(existsSync(join(deployDir, 'docker-compose.logan.yml')));
  });

  it('Caddyfile exists', () => {
    assert.ok(existsSync(join(deployDir, 'Caddyfile')));
  });

  it('setup.sh exists', () => {
    assert.ok(existsSync(join(deployDir, 'setup.sh')));
  });

  it('site/fetch.mjs exists', () => {
    assert.ok(existsSync(join(deployDir, 'site', 'fetch.mjs')));
  });

  it('site/template.html exists', () => {
    assert.ok(existsSync(join(deployDir, 'site', 'template.html')));
  });

  it('site/style.css exists', () => {
    assert.ok(existsSync(join(deployDir, 'site', 'style.css')));
  });

  it('site/Dockerfile.fetch exists', () => {
    assert.ok(existsSync(join(deployDir, 'site', 'Dockerfile.fetch')));
  });

  it('tests/fixtures/mock-posts.json exists', () => {
    assert.ok(existsSync(join(__dirname, 'fixtures', 'mock-posts.json')));
  });

  it('GitHub Actions workflow exists', () => {
    assert.ok(existsSync(join(repoRoot, '.github', 'workflows', 'deploy-logan.yml')));
  });
});

// ═══════════════════════════════════════════
// Mock data fixture
// ═══════════════════════════════════════════

describe('mock-posts.json fixture', () => {
  const mockData = JSON.parse(readFileSync(join(__dirname, 'fixtures', 'mock-posts.json'), 'utf-8'));

  it('is valid JSON with posts array', () => {
    assert.ok(Array.isArray(mockData.posts));
  });

  it('has 3 mock posts', () => {
    assert.equal(mockData.posts.length, 3);
  });

  it('all posts have required fields', () => {
    for (const post of mockData.posts) {
      assert.ok(post.id, 'Post missing id');
      assert.ok(post.title, 'Post missing title');
      assert.ok(post.content, 'Post missing content');
      assert.ok(post.submolt, 'Post missing submolt');
      assert.ok(post.created_at, 'Post missing created_at');
    }
  });

  it('all posts have agent info', () => {
    for (const post of mockData.posts) {
      assert.ok(post.agent, 'Post missing agent');
      assert.equal(post.agent.name, 'Logan');
      assert.ok(post.agent.id, 'Agent missing id');
    }
  });

  it('all posts have valid UUIDs', () => {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
    for (const post of mockData.posts) {
      assert.ok(uuidRegex.test(post.id), `Invalid UUID: ${post.id}`);
    }
  });

  it('all posts have valid ISO timestamps', () => {
    for (const post of mockData.posts) {
      const date = new Date(post.created_at);
      assert.ok(!isNaN(date.getTime()), `Invalid date: ${post.created_at}`);
    }
  });

  it('posts are about Cardano topics', () => {
    const allContent = mockData.posts.map(p => p.title + ' ' + p.content).join(' ');
    assert.ok(allContent.includes('Cardano'));
  });

  it('posts contain markdown for rendering tests', () => {
    const allContent = mockData.posts.map(p => p.content).join(' ');
    assert.ok(allContent.includes('**'), 'Should have bold markdown');
    assert.ok(allContent.includes('`'), 'Should have code markdown');
    assert.ok(allContent.includes('['), 'Should have link markdown');
  });

  it('does not contain real API keys', () => {
    const raw = JSON.stringify(mockData);
    assert.ok(!raw.includes('moltbook_'));
    assert.ok(!raw.includes('sk-'));
  });
});
