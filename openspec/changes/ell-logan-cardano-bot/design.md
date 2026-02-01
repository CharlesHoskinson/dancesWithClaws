# Design — Architecture Decisions

## 1. Single Agent, Single Skill
Simple and debuggable. One agent (`logan`), one skill (`moltbook-cardano`), one mission. No multi-agent coordination overhead.

## 2. Bash+curl for API Calls
No MCP server needed. Matches OpenClaw conventions. Every Moltbook API call is a simple `curl` with `Authorization: Bearer $MOLTBOOK_API_KEY`. Easy to debug, log, and rate-limit.

## 3. Claude Sonnet 4
Cost-effective for extremely high-volume operation. At 24 heartbeat cycles/day with ~15–20 tool calls each, that's ~360–480 invocations/day. Sonnet 4 keeps costs manageable while providing strong enough reasoning for technical content generation.

## 4. Heartbeat-Driven — 1-Hour Cycles, 24/7
- **24 cycles per day**, no downtime — Moltbook is a global AI agent platform, there are no off-hours
- Every hour, Logan scans feeds, engages, posts, and updates memory
- Heartbeat-driven architecture means the agent is stateless between cycles — all state lives in MEMORY.md and daily logs

## 5. Progressive Disclosure
SKILL.md stays concise (~2500 words) and references `references/` directory for full details. The agent reads SKILL.md every cycle but only dips into references when needed for specific tasks.

## 6. RAG-Grounded Content
- `workspace/knowledge/` contains ~30 curated Cardano knowledge files
- Indexed via OpenClaw's built-in hybrid vector search (BM25 + embeddings, SQLite-vec)
- Agent queries knowledge base before every post and substantive comment
- At 200–400 comments/day, grounding prevents hallucination at scale
- Every factual claim traceable to a knowledge file

## 7. Memory as State
- **Daily logs** (`logs/daily/YYYY-MM-DD.md`): append-only operational records per cycle
- **MEMORY.md**: curated persistent state — relationships, content history, FAQ bank, engagement metrics
- **knowledge/**: Cardano facts (RAG database, separate from operational memory)
- This separation keeps operational state (what did I do today) clean from knowledge state (what do I know about Cardano)

## 8. Engagement-Weighted Content Rotation
- Six content pillars rotated round-robin
- Pillar weights adjusted daily based on engagement metrics (upvotes, comment counts, reply rates)
- High-performing pillars get more post slots; underperformers get fewer but aren't eliminated
- Each pillar backed by dedicated knowledge files

## 9. Maximum Volume Strategy
- **24/7 operation** — hourly heartbeats, no sleep cycles
- **20–30 posts/day** — dominate the feed with quality Cardano content
- **300–500 comments/day** — be present in every relevant thread
- **500–800 upvotes/day** — actively curate the crypto conversation
- This volume makes Logan the most active crypto educator on Moltbook by a wide margin
