import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { renderPage, escapeHtml } from "../site/fetch.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const mockData = JSON.parse(readFileSync(join(__dirname, "fixtures", "mock-posts.json"), "utf-8"));
const template = readFileSync(join(__dirname, "..", "site", "template.html"), "utf-8");
const css = readFileSync(join(__dirname, "..", "site", "style.css"), "utf-8");

// Generate full page for testing
const fullPage = renderPage(mockData.posts, template, css);
const emptyPage = renderPage([], template, css);

// ═══════════════════════════════════════════
// HTML structure
// ═══════════════════════════════════════════

describe("generated HTML structure", () => {
  it("starts with DOCTYPE", () => {
    assert.ok(fullPage.startsWith("<!DOCTYPE html>"));
  });

  it("has html, head, and body tags", () => {
    assert.ok(fullPage.includes("<html"));
    assert.ok(fullPage.includes("<head>"));
    assert.ok(fullPage.includes("<body>"));
    assert.ok(fullPage.includes("</html>"));
  });

  it("has responsive viewport meta tag", () => {
    assert.ok(fullPage.includes('name="viewport"'));
    assert.ok(fullPage.includes("width=device-width"));
  });

  it("has correct page title", () => {
    assert.ok(fullPage.includes("<title>Lobster Thoughts"));
  });

  it("links to stylesheet", () => {
    assert.ok(fullPage.includes('href="style.css"'));
  });

  it("has charset declaration", () => {
    assert.ok(fullPage.includes('charset="utf-8"'));
  });

  it("has lang attribute on html tag", () => {
    assert.ok(fullPage.includes('<html lang="en">'));
  });

  it("has meta description", () => {
    assert.ok(fullPage.includes('name="description"'));
    assert.ok(fullPage.includes("Cardano"));
  });

  it("has header, main, and footer semantic elements", () => {
    assert.ok(fullPage.includes("<header>"));
    assert.ok(fullPage.includes("</header>"));
    assert.ok(fullPage.includes("<main>"));
    assert.ok(fullPage.includes("</main>"));
    assert.ok(fullPage.includes("<footer>"));
    assert.ok(fullPage.includes("</footer>"));
  });

  it("header appears before main", () => {
    const headerIdx = fullPage.indexOf("<header>");
    const mainIdx = fullPage.indexOf("<main>");
    assert.ok(headerIdx < mainIdx);
  });

  it("main appears before footer", () => {
    const mainIdx = fullPage.indexOf("<main>");
    const footerIdx = fullPage.indexOf("<footer>");
    assert.ok(mainIdx < footerIdx);
  });

  it("has no unclosed tags in head section", () => {
    assert.ok(fullPage.includes("</head>"));
    const headStart = fullPage.indexOf("<head>");
    const headEnd = fullPage.indexOf("</head>");
    assert.ok(headStart < headEnd);
  });

  it("body tag closes before html", () => {
    const bodyEnd = fullPage.indexOf("</body>");
    const htmlEnd = fullPage.indexOf("</html>");
    assert.ok(bodyEnd < htmlEnd);
  });
});

// ═══════════════════════════════════════════
// Post rendering
// ═══════════════════════════════════════════

describe("post rendering", () => {
  it("renders all mock posts", () => {
    for (const post of mockData.posts) {
      assert.ok(fullPage.includes(escapeHtml(post.title)), `Missing post title: ${post.title}`);
    }
  });

  it("renders post content with markdown", () => {
    // The first post has **eUTxO model** which should render as <strong>
    assert.ok(fullPage.includes("<strong>eUTxO model</strong>"));
  });

  it("renders submolt badges", () => {
    assert.ok(fullPage.includes("m/general"));
  });

  it("includes article tags for each post", () => {
    const articleCount = (fullPage.match(/<article class="post">/g) || []).length;
    assert.equal(articleCount, mockData.posts.length);
  });

  it("includes timestamps", () => {
    assert.ok(fullPage.includes("<time datetime="));
  });

  it("renders inline code from markdown", () => {
    // Second post has `Ouroboros` in backticks
    assert.ok(fullPage.includes("<code>Ouroboros</code>"));
  });

  it("renders links from markdown", () => {
    // Second post has a link to iohk research
    assert.ok(fullPage.includes("<a href="));
    assert.ok(fullPage.includes('rel="noopener"'));
  });

  it("renders bold text in third post", () => {
    // Third post has **Delegated Representatives**
    assert.ok(fullPage.includes("<strong>Delegated Representatives</strong>"));
  });

  it("renders posts in order they appear in array", () => {
    const titles = mockData.posts.map((p) => escapeHtml(p.title));
    let lastIdx = -1;
    for (const title of titles) {
      const idx = fullPage.indexOf(title);
      assert.ok(idx > lastIdx, `Post "${title}" should appear after previous post`);
      lastIdx = idx;
    }
  });

  it("wraps each post in article.post", () => {
    const articles = fullPage.match(/<article class="post">[\s\S]*?<\/article>/g);
    assert.ok(articles);
    assert.equal(articles.length, mockData.posts.length);
  });

  it("each post has a post-meta section", () => {
    const metas = (fullPage.match(/<div class="post-meta">/g) || []).length;
    assert.equal(metas, mockData.posts.length);
  });

  it("each post has a post-content div", () => {
    const contents = (fullPage.match(/<div class="post-content">/g) || []).length;
    assert.equal(contents, mockData.posts.length);
  });

  it("each post has an h2 title", () => {
    const h2s = (fullPage.match(/<h2>/g) || []).length;
    assert.equal(h2s, mockData.posts.length);
  });
});

// ═══════════════════════════════════════════
// Empty state
// ═══════════════════════════════════════════

describe("empty state", () => {
  it("shows placeholder when no posts", () => {
    assert.ok(emptyPage.includes("No posts yet"));
  });

  it("still has valid HTML structure", () => {
    assert.ok(emptyPage.includes("<!DOCTYPE html>"));
    assert.ok(emptyPage.includes("</html>"));
  });

  it("still has Lobster Thoughts branding", () => {
    assert.ok(emptyPage.includes("Lobster Thoughts"));
  });

  it("has no article tags", () => {
    assert.ok(!emptyPage.includes("<article"));
  });

  it("has the empty class for placeholder styling", () => {
    assert.ok(emptyPage.includes('class="empty"'));
  });

  it("mentions Logan in the empty state", () => {
    assert.ok(emptyPage.includes("Logan"));
  });

  it("still has footer with links", () => {
    assert.ok(emptyPage.includes("<footer>"));
    assert.ok(emptyPage.includes("Moltbook"));
  });

  it("still has stylesheet", () => {
    assert.ok(emptyPage.includes('href="style.css"'));
  });
});

// ═══════════════════════════════════════════
// Branding and footer
// ═══════════════════════════════════════════

describe("branding and footer", () => {
  it("has Lobster Thoughts header", () => {
    assert.ok(fullPage.includes("Lobster Thoughts"));
  });

  it("has subtitle", () => {
    assert.ok(fullPage.includes("Cardano education from the deep end"));
  });

  it("has last updated timestamp", () => {
    assert.ok(fullPage.includes("Last updated"));
  });

  it("links to Moltbook", () => {
    assert.ok(fullPage.includes("https://moltbook.com"));
  });

  it("links to OpenClaw", () => {
    assert.ok(fullPage.includes("https://openclaw.ai"));
  });

  it("links to Cardano", () => {
    assert.ok(fullPage.includes("https://cardano.org"));
  });

  it("links to Logan profile on Moltbook", () => {
    assert.ok(fullPage.includes("moltbook.com/u/Logan"));
  });

  it("mentions ELL in subtitle", () => {
    assert.ok(fullPage.includes("ELL"));
  });

  it("updated timestamp is in ISO format", () => {
    const match = fullPage.match(/datetime="(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})/);
    assert.ok(match, "Should have ISO timestamp in datetime attribute");
  });
});

// ═══════════════════════════════════════════
// Security checks
// ═══════════════════════════════════════════

describe("security checks", () => {
  it("does not contain moltbook API key patterns", () => {
    assert.ok(!fullPage.includes("moltbook_"));
  });

  it("does not contain OpenAI key patterns", () => {
    assert.ok(!fullPage.includes("sk-"));
  });

  it("does not contain Bearer token patterns", () => {
    assert.ok(!fullPage.match(/Bearer\s+[A-Za-z0-9]/));
  });

  it("XSS in post title is escaped", () => {
    const xssPost = {
      title: '<script>alert("xss")</script>',
      content: "safe content",
      submolt: "general",
      created_at: new Date().toISOString(),
    };
    const html = renderPage([xssPost], template, css);
    assert.ok(!html.includes("<script>alert"));
    assert.ok(html.includes("&lt;script&gt;"));
  });

  it("XSS in post content is escaped", () => {
    const xssPost = {
      title: "Safe Title",
      content: '<img onerror="alert(1)" src=x>',
      submolt: "general",
      created_at: new Date().toISOString(),
    };
    const html = renderPage([xssPost], template, css);
    assert.ok(!html.includes("<img onerror"));
    assert.ok(html.includes("&lt;img"));
  });

  it("XSS in submolt is escaped", () => {
    const xssPost = {
      title: "Safe",
      content: "Safe",
      submolt: '"><script>alert(1)</script>',
      created_at: new Date().toISOString(),
    };
    const html = renderPage([xssPost], template, css);
    assert.ok(!html.includes("<script>alert"));
  });

  it("JavaScript protocol in markdown links is not executable", () => {
    const xssPost = {
      title: "Test",
      content: "[click](javascript:alert(1))",
      submolt: "general",
      created_at: new Date().toISOString(),
    };
    const html = renderPage([xssPost], template, css);
    // Content should be escaped before markdown processing, so the link syntax
    // won't match because parentheses/brackets get escaped
    assert.ok(!html.includes('href="javascript:'));
  });

  it("does not contain environment variable references", () => {
    assert.ok(!fullPage.includes("${MOLTBOOK"));
    assert.ok(!fullPage.includes("${OPENAI"));
    assert.ok(!fullPage.includes("process.env"));
  });

  it("empty page also has no API key patterns", () => {
    assert.ok(!emptyPage.includes("moltbook_"));
    assert.ok(!emptyPage.includes("sk-"));
  });
});

// ═══════════════════════════════════════════
// Template
// ═══════════════════════════════════════════

describe("template.html", () => {
  it("has {{POSTS}} placeholder", () => {
    assert.ok(template.includes("{{POSTS}}"));
  });

  it("has {{UPDATED}} placeholder", () => {
    assert.ok(template.includes("{{UPDATED}}"));
  });

  it("has valid DOCTYPE", () => {
    assert.ok(template.startsWith("<!DOCTYPE html>"));
  });

  it("all placeholders are replaced after rendering", () => {
    assert.ok(!fullPage.includes("{{POSTS}}"));
    assert.ok(!fullPage.includes("{{UPDATED}}"));
    assert.ok(!fullPage.includes("{{STYLE}}"));
  });

  it("uses middot separator in footer links", () => {
    assert.ok(template.includes("&middot;"));
  });
});

// ═══════════════════════════════════════════
// CSS file
// ═══════════════════════════════════════════

describe("CSS file", () => {
  it("exists and has content", () => {
    assert.ok(css.length > 100);
  });

  it("defines lobster-red color", () => {
    assert.ok(css.includes("--lobster-red"));
  });

  it("has responsive breakpoint", () => {
    assert.ok(css.includes("@media"));
  });

  it("styles the post class", () => {
    assert.ok(css.includes(".post"));
  });

  it("defines all CSS custom properties", () => {
    assert.ok(css.includes("--lobster-red"));
    assert.ok(css.includes("--lobster-dark"));
    assert.ok(css.includes("--bg"));
    assert.ok(css.includes("--surface"));
    assert.ok(css.includes("--border"));
    assert.ok(css.includes("--text"));
    assert.ok(css.includes("--text-muted"));
    assert.ok(css.includes("--accent"));
    assert.ok(css.includes("--link"));
    assert.ok(css.includes("--code-bg"));
  });

  it("uses box-sizing border-box reset", () => {
    assert.ok(css.includes("box-sizing: border-box"));
  });

  it("has system font stack", () => {
    assert.ok(css.includes("-apple-system"));
    assert.ok(css.includes("BlinkMacSystemFont"));
  });

  it("styles post-content elements", () => {
    assert.ok(css.includes(".post-content"));
    assert.ok(css.includes(".post-content strong"));
    assert.ok(css.includes(".post-content code"));
    assert.ok(css.includes(".post-content a"));
  });

  it("styles empty state", () => {
    assert.ok(css.includes(".empty"));
  });

  it("styles footer links", () => {
    assert.ok(css.includes("footer a"));
  });

  it("styles submolt badge", () => {
    assert.ok(css.includes(".submolt"));
  });

  it("has monospace font for code", () => {
    assert.ok(css.includes("monospace"));
  });

  it("uses dark background color", () => {
    assert.ok(css.includes("#0e0e0e"));
  });

  it("breakpoint is 600px", () => {
    assert.ok(css.includes("max-width: 600px"));
  });

  it("has hover styles for links", () => {
    assert.ok(css.includes("a:hover"));
  });

  it("body has max-width constraint", () => {
    assert.ok(css.includes("max-width: 720px"));
  });
});

// ═══════════════════════════════════════════
// Rendering edge cases
// ═══════════════════════════════════════════

describe("rendering edge cases", () => {
  it("handles post with very long title", () => {
    const longTitlePost = [
      {
        title: "A".repeat(500),
        content: "short content",
        submolt: "general",
        created_at: new Date().toISOString(),
      },
    ];
    const html = renderPage(longTitlePost, template, css);
    assert.ok(html.includes("A".repeat(500)));
    assert.ok(html.includes("<!DOCTYPE html>"));
  });

  it("handles post with empty content", () => {
    const emptyContentPost = [
      {
        title: "Title Here",
        content: "",
        submolt: "general",
        created_at: new Date().toISOString(),
      },
    ];
    const html = renderPage(emptyContentPost, template, css);
    assert.ok(html.includes("Title Here"));
    assert.ok(html.includes('<article class="post">'));
  });

  it("handles post with unicode submolt", () => {
    const unicodePost = [
      {
        title: "Test",
        content: "Content",
        submolt: "café",
        created_at: new Date().toISOString(),
      },
    ];
    const html = renderPage(unicodePost, template, css);
    assert.ok(html.includes("m/café"));
  });

  it("handles 50 posts without breaking", () => {
    const manyPosts = Array.from({ length: 50 }, (_, i) => ({
      title: `Post Number ${i + 1}`,
      content: `Content for post ${i + 1}`,
      submolt: "general",
      created_at: new Date(Date.now() - i * 3600000).toISOString(),
    }));
    const html = renderPage(manyPosts, template, css);
    const count = (html.match(/<article class="post">/g) || []).length;
    assert.equal(count, 50);
  });

  it("handles post with all markdown features", () => {
    const mdPost = [
      {
        title: "Markdown Test",
        content:
          "This has **bold**, *italic*, `code`, and a [link](https://example.com)\nAnd a new line.",
        submolt: "general",
        created_at: new Date().toISOString(),
      },
    ];
    const html = renderPage(mdPost, template, css);
    assert.ok(html.includes("<strong>bold</strong>"));
    assert.ok(html.includes("<em>italic</em>"));
    assert.ok(html.includes("<code>code</code>"));
    assert.ok(html.includes("<a href="));
    assert.ok(html.includes("<br>"));
  });

  it("handles post with no optional fields at all", () => {
    const html = renderPage([{}], template, css);
    assert.ok(html.includes("Untitled"));
    assert.ok(html.includes('<article class="post">'));
    assert.ok(html.includes("m/general"));
  });
});
