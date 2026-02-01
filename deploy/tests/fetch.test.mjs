import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { escapeHtml, renderMarkdown, timeAgo, renderPost, renderPage } from '../site/fetch.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const mockData = JSON.parse(readFileSync(join(__dirname, 'fixtures', 'mock-posts.json'), 'utf-8'));
const template = readFileSync(join(__dirname, '..', 'site', 'template.html'), 'utf-8');
const css = readFileSync(join(__dirname, '..', 'site', 'style.css'), 'utf-8');

describe('escapeHtml', () => {
  it('escapes angle brackets', () => {
    assert.equal(escapeHtml('<script>alert("xss")</script>'), '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
  });

  it('escapes ampersands', () => {
    assert.equal(escapeHtml('A & B'), 'A &amp; B');
  });

  it('passes through clean text', () => {
    assert.equal(escapeHtml('hello world'), 'hello world');
  });
});

describe('renderMarkdown', () => {
  it('renders bold', () => {
    assert.match(renderMarkdown('this is **bold** text'), /this is <strong>bold<\/strong> text/);
  });

  it('renders italic', () => {
    assert.match(renderMarkdown('this is *italic* text'), /this is <em>italic<\/em> text/);
  });

  it('renders inline code', () => {
    assert.match(renderMarkdown('use `Ouroboros` here'), /use <code>Ouroboros<\/code> here/);
  });

  it('renders links', () => {
    assert.match(renderMarkdown('[Cardano](https://cardano.org)'), /<a href="https:\/\/cardano.org" rel="noopener">Cardano<\/a>/);
  });

  it('converts newlines to br', () => {
    assert.match(renderMarkdown('line1\nline2'), /line1<br>line2/);
  });

  it('escapes HTML inside markdown', () => {
    const result = renderMarkdown('<script>alert("xss")</script>');
    assert.ok(!result.includes('<script>'));
    assert.ok(result.includes('&lt;script&gt;'));
  });
});

describe('timeAgo', () => {
  it('returns just now for recent timestamps', () => {
    const now = new Date().toISOString();
    assert.equal(timeAgo(now), 'just now');
  });

  it('returns minutes for recent past', () => {
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    assert.equal(timeAgo(fiveMinAgo), '5m ago');
  });

  it('returns hours for older timestamps', () => {
    const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
    assert.equal(timeAgo(threeHoursAgo), '3h ago');
  });

  it('returns days for old timestamps', () => {
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
    assert.equal(timeAgo(twoDaysAgo), '2d ago');
  });
});

describe('renderPost', () => {
  const post = mockData.posts[0];

  it('includes the post title', () => {
    const html = renderPost(post);
    assert.ok(html.includes('Why Cardano Validates Before It Executes'));
  });

  it('includes the submolt', () => {
    const html = renderPost(post);
    assert.ok(html.includes('m/general'));
  });

  it('renders markdown in content', () => {
    const html = renderPost(post);
    assert.ok(html.includes('<strong>eUTxO model</strong>'));
  });

  it('wraps in article tag', () => {
    const html = renderPost(post);
    assert.match(html, /<article class="post">/);
  });

  it('handles missing title', () => {
    const html = renderPost({ content: 'test' });
    assert.ok(html.includes('Untitled'));
  });

  it('handles missing content', () => {
    const html = renderPost({ title: 'test' });
    assert.match(html, /<article/);
  });

  it('handles missing submolt', () => {
    const html = renderPost({ title: 'test', content: 'body' });
    assert.ok(html.includes('m/general'));
  });
});

describe('renderPage', () => {
  it('produces valid HTML with posts', () => {
    const html = renderPage(mockData.posts, template, css);
    assert.ok(html.includes('<!DOCTYPE html>'));
    assert.ok(html.includes('</html>'));
    assert.ok(html.includes('Lobster Thoughts'));
  });

  it('includes all posts', () => {
    const html = renderPage(mockData.posts, template, css);
    for (const post of mockData.posts) {
      assert.ok(html.includes(escapeHtml(post.title)), `Missing post: ${post.title}`);
    }
  });

  it('includes updated timestamp', () => {
    const html = renderPage(mockData.posts, template, css);
    assert.match(html, /\d{4}-\d{2}-\d{2}T/);
  });

  it('renders empty state when no posts', () => {
    const html = renderPage([], template, css);
    assert.ok(html.includes('No posts yet'));
  });

  it('includes stylesheet link', () => {
    const html = renderPage(mockData.posts, template, css);
    assert.ok(html.includes('href="style.css"'));
  });

  it('includes responsive viewport meta', () => {
    const html = renderPage(mockData.posts, template, css);
    assert.ok(html.includes('name="viewport"'));
  });

  it('does not contain API key patterns', () => {
    const html = renderPage(mockData.posts, template, css);
    assert.ok(!html.includes('moltbook_'));
    assert.ok(!html.includes('sk-'));
    assert.ok(!html.match(/Bearer\s+\S/));
  });
});
