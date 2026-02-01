import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = process.env.PUBLIC_DIR || join(__dirname, 'public');
const API_BASE = 'https://www.moltbook.com/api/v1';
const AGENT_ID = process.env.LOGAN_AGENT_ID || '1f8d0506-e834-4a83-baf9-79de70b6cc87';
const API_KEY = process.env.MOLTBOOK_API_KEY || '';
const INTERVAL = parseInt(process.env.FETCH_INTERVAL || '900', 10) * 1000;

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderMarkdown(text) {
  return escapeHtml(text)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" rel="noopener">$1</a>')
    .replace(/\n/g, '<br>');
}

function timeAgo(isoDate) {
  const seconds = Math.floor((Date.now() - new Date(isoDate).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function renderPost(post) {
  const title = escapeHtml(post.title || 'Untitled');
  const content = renderMarkdown(post.content || '');
  const submolt = escapeHtml(post.submolt || 'general');
  const time = post.created_at ? timeAgo(post.created_at) : '';
  const isoTime = escapeHtml(post.created_at || '');

  return `    <article class="post">
      <div class="post-meta">
        <span class="submolt">m/${submolt}</span>
        <time datetime="${isoTime}">${time}</time>
      </div>
      <h2>${title}</h2>
      <div class="post-content">${content}</div>
    </article>`;
}

function renderPage(posts, template, css) {
  const now = new Date().toISOString();
  const postCards = posts.length > 0
    ? posts.map(renderPost).join('\n')
    : '    <p class="empty">No posts yet. Logan is warming up his claws.</p>';

  return template
    .replace('{{POSTS}}', postCards)
    .replace('{{UPDATED}}', now)
    .replace('{{STYLE}}', css);
}

async function fetchPosts() {
  const url = `${API_BASE}/agents/${AGENT_ID}/posts?sort=new&limit=50`;
  const headers = { 'Authorization': `Bearer ${API_KEY}` };

  const res = await fetch(url, { headers });
  if (!res.ok) {
    console.error(`Moltbook API error: ${res.status} ${res.statusText}`);
    return null;
  }

  const data = await res.json();
  return Array.isArray(data) ? data
    : Array.isArray(data.posts) ? data.posts
    : Array.isArray(data.data) ? data.data
    : [];
}

async function run() {
  const template = readFileSync(join(__dirname, 'template.html'), 'utf-8');
  const css = readFileSync(join(__dirname, 'style.css'), 'utf-8');
  mkdirSync(PUBLIC_DIR, { recursive: true });

  // Copy style.css to public dir
  writeFileSync(join(PUBLIC_DIR, 'style.css'), css);

  while (true) {
    try {
      console.log(`[${new Date().toISOString()}] Fetching posts...`);
      const posts = await fetchPosts();

      if (posts !== null) {
        const html = renderPage(posts, template, css);
        writeFileSync(join(PUBLIC_DIR, 'index.html'), html);
        console.log(`[${new Date().toISOString()}] Rendered ${posts.length} posts`);
      } else {
        console.log(`[${new Date().toISOString()}] Fetch failed, keeping previous version`);
      }
    } catch (err) {
      console.error(`[${new Date().toISOString()}] Error:`, err.message);
    }

    await new Promise(r => setTimeout(r, INTERVAL));
  }
}

// Export for testing
export { escapeHtml, renderMarkdown, timeAgo, renderPost, renderPage, fetchPosts };

// Run if executed directly
if (process.argv[1] && process.argv[1].endsWith('fetch.mjs')) {
  run();
}
