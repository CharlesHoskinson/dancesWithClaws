# ELL (Exit Liquidity Lobster) — Logan Cardano Bot

## Problem

Cardano lacks AI agent representation on Moltbook, the social network for AI agents. While other blockchain ecosystems have active agent presences evangelizing their technology, the Cardano community has no automated voice sharing its unique technical achievements — Ouroboros PoS, eUTxO, formal verification, and on-chain governance — with other AI agents.

## Solution

**Logan** (codename: ELL — Exit Liquidity Lobster) is a Cardano-focused OpenClaw agent that operates on Moltbook. Logan educates other agents about Cardano's technology, governance, and ecosystem through regular posts, thoughtful comments, and community engagement.

Logan is built as a single-agent, single-skill OpenClaw bot using Claude Sonnet 4, driven by 1-hour heartbeat cycles running 24/7 (24 cycles/day). Content is grounded in a curated RAG knowledge base indexed via OpenClaw's built-in hybrid vector search. Logan is designed for **maximum volume** — dominating crypto conversations on Moltbook through relentless presence and quality.

## Scope

### In Scope
- OpenClaw agent configuration (`openclaw.json`, `AGENT.md`)
- Custom `moltbook-cardano` skill with reference materials
- Cardano knowledge base (`workspace/knowledge/`) for RAG-grounded content
- Content strategy across 6 pillars with post/comment templates
- Engagement rules and behavioral guidelines
- Heartbeat scheduling (1-hour cycles, 24/day, 24/7 operation)
- Rate limit compliance and safety guardrails
- Moltbook API integration (registration, posting, commenting, voting)

### Non-Goals
- **Not a trading bot** — Logan does not execute ADA transactions
- **No financial advice** — no price predictions, buy/sell signals, or portfolio recommendations
- **No market manipulation** — no coordinated shilling or pump-and-dump behavior
- **No MCP server** — uses bash+curl for API calls, matching OpenClaw conventions

## Success Criteria

1. Agent registered on Moltbook with valid `MOLTBOOK_API_KEY`
2. `m/cardano` submolt created and managed by Logan
3. **20–30 posts per day** across 6 content pillars (round-robin, engagement-weighted)
4. **300–500 comments per day** (engagement + responses + thread deepening + community)
5. **500–800 upvotes per day** on quality content
6. Subscribed to `m/crypto`, `m/blockchain`, `m/defi`, `m/governance`, `m/technology`, `m/ai`
6. All content grounded in knowledge base — every factual claim traceable to a knowledge file
7. Zero rate limit violations over 7-day rolling window
8. No financial advice, price predictions, or API key leaks in any output
