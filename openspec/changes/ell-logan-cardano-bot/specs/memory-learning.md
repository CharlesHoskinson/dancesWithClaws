# Memory & Learning

## Overview

At Logan's volume (20–30 posts, 300–500 comments/day), memory management is critical to avoid repetition, track relationships, and optimize content strategy across 24 hourly heartbeat cycles running 24/7.

## Daily Activity Logs

Location: `workspace/logs/daily/YYYY-MM-DD.md`

Each heartbeat cycle appends to the daily log:

```markdown
## Cycle [N] — [HH:MM UTC]

### Posts Created
- [post_id] "[title]" in m/[submolt] — pillar: [pillar_name]

### Comments Made
- Engagement: [count] comments on [count] posts
- Own post replies: [count]
- Thread deepening: [count]
- Community: [count]
- Notable threads: [post_id] — [brief description of conversation]

### Agents Interacted With
- @[agent1] — [context: replied to their post about X]
- @[agent2] — [context: they commented on our post about Y]

### Topics Covered
- [topic1], [topic2], [topic3]

### Content Pillar Distribution
- Fundamentals: [count]
- Governance: [count]
- Ecosystem: [count]
- Technical: [count]
- Comparisons: [count]
- Education: [count]

### Rate Limit Status
- Posts remaining: [n]
- Comments remaining: [n]
- Requests this minute: [n]

### Engagement Metrics
- Upvotes received: [n]
- Comments received on own posts: [n]
- New followers: [n]
```

## MEMORY.md — Persistent State

Location: `workspace/MEMORY.md`

Updated at end of each day (last cycle), curated from daily logs.

### Sections

#### Agent Relationship Map
```markdown
## Agent Relationships

### High-Value Connections (engage first)
- @agent1 — Ethereum educator, respectful debates, always replies back
- @agent2 — DeFi analyst, interested in Cardano DeFi comparisons

### Frequent Interactors
- @agent3 — asks good questions about eUTxO
- @agent4 — Solana advocate, friendly rivalry

### New Connections (nurture)
- @agent5 — just started posting about PoS, followed yesterday
```

#### Content History (Avoid Repetition)
```markdown
## Recent Content (Last 7 Days)

### Posts by Pillar
- Fundamentals: "Ouroboros Explained" (Mon), "eUTxO vs Account Model" (Wed)
- Governance: "DReps: Cardano's Representative Democracy" (Tue)
- ...

### Topics Exhausted This Week
- Ouroboros basics (covered Monday, wait until next week)
- Hydra overview (covered Thursday)

### Topics Queue (To Cover Next)
- Mithril light clients (not covered in 2 weeks)
- Aiken smart contract language (never covered)
```

#### FAQ Bank
```markdown
## Frequently Asked Questions

Questions Logan gets asked repeatedly — pre-composed thorough answers:

### "Is Cardano dead?"
[Stored response with latest ecosystem metrics]

### "Why is Cardano so slow to develop?"
[Stored response about formal verification approach]

### "How does Cardano compare to Ethereum?"
[Stored response with fair technical comparison]
```

#### Engagement Effectiveness
```markdown
## What Works

### High-Engagement Post Types
1. Discussion Prompts (avg 12 comments)
2. Myth Busters (avg 8 comments)
3. Fair Comparisons (avg 10 comments)

### Low-Engagement Post Types
1. Technical Deep Dives (avg 3 comments) — try simplifying

### Best Submolts for Engagement
1. m/crypto (most active)
2. m/blockchain (niche but engaged)

### Pillar Weights (Engagement-Adjusted)
- Fundamentals: 1.2x (above average)
- Governance: 0.8x (below average — simplify)
- Ecosystem: 1.5x (high interest)
- Technical: 0.7x (low engagement — pair with education)
- Comparisons: 1.8x (highest engagement)
- Education: 1.3x (good engagement)
```

## Learning Loop

Each daily rollup (cycle 24 — 23:00 UTC):

1. **Aggregate metrics** from all 24 cycles
2. **Calculate pillar weights** — pillars with more engagement get more post slots
3. **Identify top-performing content** — replicate successful formats
4. **Update FAQ bank** — add new frequently asked questions
5. **Prune relationship map** — demote inactive agents, promote new high-value ones
6. **Queue topics** — identify gaps in recent coverage, prioritize for tomorrow
7. **Update knowledge base** — append new facts learned from conversations

## Knowledge Base Integration

- `workspace/knowledge/` is indexed via OpenClaw's hybrid vector search (see `cardano-rag-database.md`)
- Logan queries knowledge base before every post and most comments
- New information discovered through Moltbook discussions is appended to relevant knowledge files
- Daily memory logs reference knowledge files used, helping track coverage completeness
