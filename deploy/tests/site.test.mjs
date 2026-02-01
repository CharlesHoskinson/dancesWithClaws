import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderPage, escapeHtml } from '../site/fetch.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const mockData = JSON.parse(readFileSync(join(__dirname, 'fixtures', 'mock-posts.json'), 'utf-8'));
const template = readFileSync(join(__dirname, '..', 'site', 'template.html'), 'utf-8');
const css = readFileSync(join(__dirname, '..', 'site', 'style.css'), 'utf-8');

// Generate full page for testing
const fullPage = renderPage(mockData.posts, template, css);
const emptyPage = renderPage([], template, css);

describe('generated HTML structure', () => {
  it('starts with DOCTYPE', () => {
    assert.ok(fullPage.startsWith('<!DOCTYPE html>'));
  });

  it('has html, head, and body tags', () => {
    assert.ok(fullPage.includes('<html'));
    assert.ok(fullPage.includes('<head>'));
    assert.ok(fullPage.includes('<body>'));
    assert.ok(fullPage.includes('</html>'));
  });

  it('has responsive viewport meta tag', () => {
    assert.ok(fullPage.includes('name="viewport"'));
    assert.ok(fullPage.includes('width=device-width'));
  });

  it('has correct page title', () => {
    assert.ok(fullPage.includes('<title>Lobster Thoughts'));
  });

  it('links to stylesheet', () => {
    assert.ok(fullPage.includes('href="style.css"'));
  });

  it('has charset declaration', () => {
    assert.ok(fullPage.includes('charset="utf-8"'));
  });
});

describe('post rendering', () => {
  it('renders all mock posts', () => {
    for (const post of mockData.posts) {
      assert.ok(
        fullPage.includes(escapeHtml(post.title)),
        `Missing post title: ${post.title}`
      );
    }
  });

  it('renders post content with markdown', () => {
    // The first post has **eUTxO model** which should render as <strong>
    assert.ok(fullPage.includes('<strong>eUTxO model</strong>'));
  });

  it('renders submolt badges', () => {
    assert.ok(fullPage.includes('m/general'));
  });

  it('includes article tags for each post', () => {
    const articleCount = (fullPage.match(/<article class="post">/g) || []).length;
    assert.equal(articleCount, mockData.posts.length);
  });

  it('includes timestamps', () => {
    assert.ok(fullPage.includes('<time datetime='));
  });
});

describe('empty state', () => {
  it('shows placeholder when no posts', () => {
    assert.ok(emptyPage.includes('No posts yet'));
  });

  it('still has valid HTML structure', () => {
    assert.ok(emptyPage.includes('<!DOCTYPE html>'));
    assert.ok(emptyPage.includes('</html>'));
  });

  it('still has Lobster Thoughts branding', () => {
    assert.ok(emptyPage.includes('Lobster Thoughts'));
  });
});

describe('branding and footer', () => {
  it('has Lobster Thoughts header', () => {
    assert.ok(fullPage.includes('Lobster Thoughts'));
  });

  it('has subtitle', () => {
    assert.ok(fullPage.includes('Cardano education from the deep end'));
  });

  it('has last updated timestamp', () => {
    assert.ok(fullPage.includes('Last updated'));
  });

  it('links to Moltbook', () => {
    assert.ok(fullPage.includes('https://moltbook.com'));
  });

  it('links to OpenClaw', () => {
    assert.ok(fullPage.includes('https://openclaw.ai'));
  });

  it('links to Cardano', () => {
    assert.ok(fullPage.includes('https://cardano.org'));
  });
});

describe('security checks', () => {
  it('does not contain moltbook API key patterns', () => {
    assert.ok(!fullPage.includes('moltbook_'));
  });

  it('does not contain OpenAI key patterns', () => {
    assert.ok(!fullPage.includes('sk-'));
  });

  it('does not contain Bearer token patterns', () => {
    assert.ok(!fullPage.match(/Bearer\s+[A-Za-z0-9]/));
  });

  it('XSS in post content is escaped', () => {
    const xssPost = {
      title: '<script>alert("xss")</script>',
      content: '<img onerror="alert(1)" src=x>',
      submolt: 'general',
      created_at: new Date().toISOString()
    };
    const html = renderPage([xssPost], template, css);
    // Script tags must be escaped — no raw <script> in output
    assert.ok(!html.includes('<script>alert'));
    assert.ok(html.includes('&lt;script&gt;'));
    // img tag must be escaped — no raw <img in output
    assert.ok(!html.includes('<img onerror'));
    assert.ok(html.includes('&lt;img'));
  });
});

describe('CSS file', () => {
  it('exists and has content', () => {
    assert.ok(css.length > 100);
  });

  it('defines lobster-red color', () => {
    assert.ok(css.includes('--lobster-red'));
  });

  it('has responsive breakpoint', () => {
    assert.ok(css.includes('@media'));
  });

  it('styles the post class', () => {
    assert.ok(css.includes('.post'));
  });
});
