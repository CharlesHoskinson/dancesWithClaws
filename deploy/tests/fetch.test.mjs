import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  escapeHtml,
  renderMarkdown,
  timeAgo,
  renderPost,
  renderPage,
  fetchPosts,
} from "../site/fetch.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const mockData = JSON.parse(readFileSync(join(__dirname, "fixtures", "mock-posts.json"), "utf-8"));
const template = readFileSync(join(__dirname, "..", "site", "template.html"), "utf-8");
const css = readFileSync(join(__dirname, "..", "site", "style.css"), "utf-8");

// ═══════════════════════════════════════════
// escapeHtml
// ═══════════════════════════════════════════

describe("escapeHtml", () => {
  it("escapes angle brackets", () => {
    assert.equal(
      escapeHtml('<script>alert("xss")</script>'),
      "&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;",
    );
  });

  it("escapes ampersands", () => {
    assert.equal(escapeHtml("A & B"), "A &amp; B");
  });

  it("escapes double quotes", () => {
    assert.equal(escapeHtml('say "hello"'), "say &quot;hello&quot;");
  });

  it("passes through clean text", () => {
    assert.equal(escapeHtml("hello world"), "hello world");
  });

  it("handles empty string", () => {
    assert.equal(escapeHtml(""), "");
  });

  it("handles string with only special characters", () => {
    assert.equal(escapeHtml('<>&"'), "&lt;&gt;&amp;&quot;");
  });

  it("handles unicode characters", () => {
    assert.equal(escapeHtml("🦞 Cardano™ — résumé"), "🦞 Cardano™ — résumé");
  });

  it("handles multiple ampersands in sequence", () => {
    assert.equal(escapeHtml("&&&&"), "&amp;&amp;&amp;&amp;");
  });

  it("handles already-escaped content without double-escaping", () => {
    // First escape
    const once = escapeHtml("<b>");
    assert.equal(once, "&lt;b&gt;");
    // Second escape — ampersands get escaped again (correct behavior)
    const twice = escapeHtml(once);
    assert.equal(twice, "&amp;lt;b&amp;gt;");
  });

  it("handles very long strings", () => {
    const long = "<script>".repeat(10000);
    const result = escapeHtml(long);
    assert.ok(!result.includes("<script>"));
    assert.ok(result.includes("&lt;script&gt;"));
  });

  it("handles null bytes", () => {
    const result = escapeHtml("before\0after");
    assert.ok(result.includes("before"));
    assert.ok(result.includes("after"));
  });
});

// ═══════════════════════════════════════════
// renderMarkdown
// ═══════════════════════════════════════════

describe("renderMarkdown", () => {
  it("renders bold", () => {
    assert.match(renderMarkdown("this is **bold** text"), /this is <strong>bold<\/strong> text/);
  });

  it("renders italic", () => {
    assert.match(renderMarkdown("this is *italic* text"), /this is <em>italic<\/em> text/);
  });

  it("renders inline code", () => {
    assert.match(renderMarkdown("use `Ouroboros` here"), /use <code>Ouroboros<\/code> here/);
  });

  it("renders links", () => {
    assert.match(
      renderMarkdown("[Cardano](https://cardano.org)"),
      /<a href="https:\/\/cardano.org" rel="noopener">Cardano<\/a>/,
    );
  });

  it("converts newlines to br", () => {
    assert.match(renderMarkdown("line1\nline2"), /line1<br>line2/);
  });

  it("escapes HTML inside markdown", () => {
    const result = renderMarkdown('<script>alert("xss")</script>');
    assert.ok(!result.includes("<script>"));
    assert.ok(result.includes("&lt;script&gt;"));
  });

  it("handles empty string", () => {
    assert.equal(renderMarkdown(""), "");
  });

  it("handles plain text with no markdown", () => {
    assert.equal(renderMarkdown("just plain text"), "just plain text");
  });

  it("renders multiple bold segments", () => {
    const result = renderMarkdown("**one** and **two** and **three**");
    assert.equal((result.match(/<strong>/g) || []).length, 3);
  });

  it("renders multiple inline code segments", () => {
    const result = renderMarkdown("use `foo` and `bar`");
    assert.equal((result.match(/<code>/g) || []).length, 2);
  });

  it("renders bold inside a sentence with punctuation", () => {
    const result = renderMarkdown("The **eUTxO model** is deterministic.");
    assert.ok(result.includes("<strong>eUTxO model</strong>"));
  });

  it("handles asterisks that are not markdown formatting", () => {
    // Single asterisk without closing should not render
    const result = renderMarkdown("5 * 3 = 15");
    assert.ok(result.includes("5"));
  });

  it("renders links with complex URLs", () => {
    const result = renderMarkdown("[paper](https://example.com/path?q=1&r=2#section)");
    assert.ok(result.includes('href="https://example.com/path?q=1&amp;r=2#section"'));
  });

  it("handles code blocks containing HTML", () => {
    const result = renderMarkdown("use `<div>` for layout");
    assert.ok(result.includes("<code>&lt;div&gt;</code>"));
  });

  it("handles multiple newlines", () => {
    const result = renderMarkdown("line1\n\nline2\n\nline3");
    assert.equal((result.match(/<br>/g) || []).length, 4);
  });

  it("preserves unicode emoji in markdown", () => {
    const result = renderMarkdown("🦞 **Lobster** facts");
    assert.ok(result.includes("🦞"));
    assert.ok(result.includes("<strong>Lobster</strong>"));
  });
});

// ═══════════════════════════════════════════
// timeAgo
// ═══════════════════════════════════════════

describe("timeAgo", () => {
  it("returns just now for recent timestamps", () => {
    const now = new Date().toISOString();
    assert.equal(timeAgo(now), "just now");
  });

  it("returns just now for timestamps less than 60 seconds ago", () => {
    const thirtySecAgo = new Date(Date.now() - 30 * 1000).toISOString();
    assert.equal(timeAgo(thirtySecAgo), "just now");
  });

  it("returns 1m ago for exactly 60 seconds", () => {
    const oneMinAgo = new Date(Date.now() - 60 * 1000).toISOString();
    assert.equal(timeAgo(oneMinAgo), "1m ago");
  });

  it("returns minutes for recent past", () => {
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    assert.equal(timeAgo(fiveMinAgo), "5m ago");
  });

  it("returns 59m for just under an hour", () => {
    const fiftyNineMin = new Date(Date.now() - 59 * 60 * 1000).toISOString();
    assert.equal(timeAgo(fiftyNineMin), "59m ago");
  });

  it("returns 1h ago for exactly one hour", () => {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    assert.equal(timeAgo(oneHourAgo), "1h ago");
  });

  it("returns hours for older timestamps", () => {
    const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
    assert.equal(timeAgo(threeHoursAgo), "3h ago");
  });

  it("returns 23h for just under a day", () => {
    const twentyThreeHours = new Date(Date.now() - 23 * 60 * 60 * 1000).toISOString();
    assert.equal(timeAgo(twentyThreeHours), "23h ago");
  });

  it("returns 1d ago for exactly 24 hours", () => {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    assert.equal(timeAgo(oneDayAgo), "1d ago");
  });

  it("returns days for old timestamps", () => {
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
    assert.equal(timeAgo(twoDaysAgo), "2d ago");
  });

  it("handles very old dates (365 days)", () => {
    const oneYearAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString();
    assert.equal(timeAgo(oneYearAgo), "365d ago");
  });
});

// ═══════════════════════════════════════════
// renderPost
// ═══════════════════════════════════════════

describe("renderPost", () => {
  const post = mockData.posts[0];

  it("includes the post title", () => {
    const html = renderPost(post);
    assert.ok(html.includes("Why Cardano Validates Before It Executes"));
  });

  it("includes the submolt", () => {
    const html = renderPost(post);
    assert.ok(html.includes("m/general"));
  });

  it("renders markdown in content", () => {
    const html = renderPost(post);
    assert.ok(html.includes("<strong>eUTxO model</strong>"));
  });

  it("wraps in article tag", () => {
    const html = renderPost(post);
    assert.match(html, /<article class="post">/);
  });

  it("closes article tag", () => {
    const html = renderPost(post);
    assert.ok(html.includes("</article>"));
  });

  it("includes datetime attribute on time element", () => {
    const html = renderPost(post);
    assert.ok(html.includes(`datetime="${escapeHtml(post.created_at)}"`));
  });

  it("handles missing title", () => {
    const html = renderPost({ content: "test" });
    assert.ok(html.includes("Untitled"));
  });

  it("handles missing content", () => {
    const html = renderPost({ title: "test" });
    assert.match(html, /<article/);
    assert.ok(html.includes('<div class="post-content">'));
  });

  it("handles missing submolt", () => {
    const html = renderPost({ title: "test", content: "body" });
    assert.ok(html.includes("m/general"));
  });

  it("handles missing created_at", () => {
    const html = renderPost({ title: "test", content: "body" });
    assert.ok(html.includes('<time datetime="">'));
  });

  it("handles completely empty object", () => {
    const html = renderPost({});
    assert.ok(html.includes("Untitled"));
    assert.ok(html.includes("m/general"));
    assert.match(html, /<article/);
  });

  it("escapes XSS in title", () => {
    const html = renderPost({
      title: "<img src=x onerror=alert(1)>",
      content: "safe",
    });
    assert.ok(!html.includes("<img src=x"));
    assert.ok(html.includes("&lt;img"));
  });

  it("escapes XSS in submolt", () => {
    const html = renderPost({
      title: "test",
      content: "test",
      submolt: '"><script>alert(1)</script>',
    });
    assert.ok(!html.includes("<script>"));
  });

  it("escapes XSS in created_at", () => {
    const html = renderPost({
      title: "test",
      content: "test",
      created_at: '"><script>alert(1)</script>',
    });
    assert.ok(!html.includes("<script>"));
  });

  it("preserves post order when rendering multiple posts", () => {
    const posts = mockData.posts;
    const html = posts.map(renderPost).join("\n");
    const firstIdx = html.indexOf(escapeHtml(posts[0].title));
    const lastIdx = html.indexOf(escapeHtml(posts[posts.length - 1].title));
    assert.ok(firstIdx < lastIdx, "Posts should appear in array order");
  });
});

// ═══════════════════════════════════════════
// renderPage
// ═══════════════════════════════════════════

describe("renderPage", () => {
  it("produces valid HTML with posts", () => {
    const html = renderPage(mockData.posts, template, css);
    assert.ok(html.includes("<!DOCTYPE html>"));
    assert.ok(html.includes("</html>"));
    assert.ok(html.includes("Lobster Thoughts"));
  });

  it("includes all posts", () => {
    const html = renderPage(mockData.posts, template, css);
    for (const post of mockData.posts) {
      assert.ok(html.includes(escapeHtml(post.title)), `Missing post: ${post.title}`);
    }
  });

  it("includes updated timestamp in ISO format", () => {
    const html = renderPage(mockData.posts, template, css);
    assert.match(html, /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  it("renders empty state when no posts", () => {
    const html = renderPage([], template, css);
    assert.ok(html.includes("No posts yet"));
    assert.ok(html.includes("warming up his claws"));
  });

  it("empty state has no article tags", () => {
    const html = renderPage([], template, css);
    assert.ok(!html.includes("<article"));
  });

  it("includes stylesheet link", () => {
    const html = renderPage(mockData.posts, template, css);
    assert.ok(html.includes('href="style.css"'));
  });

  it("includes responsive viewport meta", () => {
    const html = renderPage(mockData.posts, template, css);
    assert.ok(html.includes('name="viewport"'));
  });

  it("does not contain API key patterns", () => {
    const html = renderPage(mockData.posts, template, css);
    assert.ok(!html.includes("moltbook_"));
    assert.ok(!html.includes("sk-"));
    assert.ok(!html.match(/Bearer\s+\S/));
  });

  it("replaces all template placeholders", () => {
    const html = renderPage(mockData.posts, template, css);
    assert.ok(!html.includes("{{POSTS}}"), "Unreplaced {{POSTS}} placeholder");
    assert.ok(!html.includes("{{UPDATED}}"), "Unreplaced {{UPDATED}} placeholder");
  });

  it("handles single post", () => {
    const html = renderPage([mockData.posts[0]], template, css);
    const count = (html.match(/<article class="post">/g) || []).length;
    assert.equal(count, 1);
  });

  it("handles large number of posts (100)", () => {
    const manyPosts = Array.from({ length: 100 }, (_, i) => ({
      title: `Post ${i}`,
      content: `Content for post ${i} with **bold** and \`code\``,
      submolt: "general",
      created_at: new Date(Date.now() - i * 3600000).toISOString(),
    }));
    const html = renderPage(manyPosts, template, css);
    const count = (html.match(/<article class="post">/g) || []).length;
    assert.equal(count, 100);
    assert.ok(html.includes("Post 0"));
    assert.ok(html.includes("Post 99"));
  });

  it("handles posts with very long content", () => {
    const longPost = [
      {
        title: "Long post",
        content: "A".repeat(50000),
        submolt: "general",
        created_at: new Date().toISOString(),
      },
    ];
    const html = renderPage(longPost, template, css);
    assert.ok(html.includes("A".repeat(1000)));
    assert.ok(html.includes("<!DOCTYPE html>"));
  });

  it("handles posts with unicode and emoji", () => {
    const emojiPost = [
      {
        title: "🦞 Lobster Update",
        content: "日本語テスト — résumé — über — 中文",
        submolt: "general",
        created_at: new Date().toISOString(),
      },
    ];
    const html = renderPage(emojiPost, template, css);
    assert.ok(html.includes("🦞"));
    assert.ok(html.includes("日本語テスト"));
  });
});

// ═══════════════════════════════════════════
// fetchPosts (mocked network)
// ═══════════════════════════════════════════

describe("fetchPosts", () => {
  it("returns posts array from { posts: [...] } response", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => ({
      ok: true,
      json: async () => ({ posts: mockData.posts }),
    });
    try {
      const posts = await fetchPosts();
      assert.equal(posts.length, 3);
      assert.equal(posts[0].title, mockData.posts[0].title);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("returns posts from { data: [...] } response", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => ({
      ok: true,
      json: async () => ({ data: mockData.posts }),
    });
    try {
      const posts = await fetchPosts();
      assert.equal(posts.length, 3);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("returns posts from bare array response", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => ({
      ok: true,
      json: async () => mockData.posts,
    });
    try {
      const posts = await fetchPosts();
      assert.equal(posts.length, 3);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("returns empty array for unknown response shape", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => ({
      ok: true,
      json: async () => ({ unexpected: "shape" }),
    });
    try {
      const posts = await fetchPosts();
      assert.deepEqual(posts, []);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("returns null on HTTP 401", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => ({
      ok: false,
      status: 401,
      statusText: "Unauthorized",
    });
    try {
      const posts = await fetchPosts();
      assert.equal(posts, null);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("returns null on HTTP 500", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => ({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
    });
    try {
      const posts = await fetchPosts();
      assert.equal(posts, null);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("returns null on HTTP 429 rate limit", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => ({
      ok: false,
      status: 429,
      statusText: "Too Many Requests",
    });
    try {
      const posts = await fetchPosts();
      assert.equal(posts, null);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("returns empty array for { posts: [] }", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => ({
      ok: true,
      json: async () => ({ posts: [] }),
    });
    try {
      const posts = await fetchPosts();
      assert.deepEqual(posts, []);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("constructs correct API URL with agent ID", async () => {
    const originalFetch = globalThis.fetch;
    let capturedUrl;
    globalThis.fetch = async (url) => {
      capturedUrl = url;
      return { ok: true, json: async () => ({ posts: [] }) };
    };
    try {
      await fetchPosts();
      assert.ok(capturedUrl.includes("/api/v1/agents/"));
      assert.ok(capturedUrl.includes("/posts"));
      assert.ok(capturedUrl.includes("sort=new"));
      assert.ok(capturedUrl.includes("limit=50"));
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("sends Authorization header", async () => {
    const originalFetch = globalThis.fetch;
    let capturedHeaders;
    globalThis.fetch = async (url, opts) => {
      capturedHeaders = opts.headers;
      return { ok: true, json: async () => ({ posts: [] }) };
    };
    try {
      await fetchPosts();
      assert.ok("Authorization" in capturedHeaders);
      assert.ok(capturedHeaders.Authorization.startsWith("Bearer "));
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
