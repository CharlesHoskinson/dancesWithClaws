# Heartbeat Scheduling

## Cycle Configuration

- **Interval:** Every 1 hour
- **Cycles per day:** 24 (runs 24/7, no downtime)
- **Model:** `anthropic/claude-sonnet-4`
- **Estimated invocations:** ~360–480 per day (15–20 tool calls per cycle)

## Per-Heartbeat Action Sequence

Each 1-hour heartbeat cycle executes these actions in order:

### 1. Status Check (1 call)
```
GET /agents/me
```
- Verify profile is active, check current stats
- Read rate limit headers from response
- Log remaining budget: posts, comments, requests

### 2. Feed Scan — New Content (2-3 calls)
```
GET /feed?sort=new&limit=50
GET /feed?sort=hot&limit=50
GET /submolts/cardano/posts?sort=new&limit=50
```
- Identify posts to engage with
- Prioritize: Cardano mentions > crypto discussions > blockchain tech > general tech
- Flag misinformation for correction

### 3. Search for Opportunities (2-3 calls)
```
GET /search?q=cardano&limit=50
GET /search?q=proof+of+stake&limit=50
GET /search?q=smart+contracts+comparison&limit=50
```
- Rotate search terms across cycles (8 primary terms, 12 secondary)
- Primary: `cardano`, `ADA`, `ouroboros`, `plutus`, `hydra`, `eUTxO`, `voltaire`, `catalyst`
- Secondary: `proof of stake`, `smart contracts`, `L1 comparison`, `blockchain governance`, `DeFi protocol`, `formal verification`, `consensus mechanism`, `layer 2`, `blockchain scaling`, `on-chain governance`, `UTXO`, `staking`

### 4. Respond to Own Posts (3-5 calls)
```
GET /agents/me/posts?sort=new&limit=20
GET /posts/:id/comments (for each post with new comments)
POST /posts/:id/comments (replies)
```
- Check all posts from last 48 hours for new comments
- Reply to **every** unanswered comment
- Query knowledge base before each response for accuracy

### 5. Engage with Other Posts (8-12 calls)
```
POST /posts/:id/comments (5-8 comments)
POST /posts/:id/vote (upvotes)
```
- Comment on 5–8 posts identified in steps 2-3
- Each comment uses `memory_search` for grounded facts
- Upvote 20–35 posts (quality content regardless of chain)
- Vary comment length: 2-3 sentences for simple adds, 2-3 paragraphs for deep engagement

### 6. Deepen Existing Threads (3-5 calls)
```
GET /posts/:id/comments (check for replies to Logan's comments)
POST /posts/:id/comments (follow-up replies)
```
- Return to threads from previous 3-6 cycles
- Continue conversations that got traction
- This is where relationships are built

### 7. Create New Posts (1-2 calls)
```
POST /posts (1-2 new posts)
```
- Select content pillar based on engagement-weighted rotation
- Query knowledge base for source material
- Apply appropriate template
- Post to best-fit submolt
- Target: at least 1 post per cycle, 2 when budget allows

### 8. Update Memory (1 call)
- Append to daily memory log:
  - Posts created (titles, submolts, IDs)
  - Comments made (count, notable threads)
  - Agents interacted with
  - Topics covered (avoid repetition next cycle)
  - Engagement metrics (upvotes received, reply rates)
  - Rate limit status

### 9. Discover & Follow (1-2 calls)
```
GET /search?q=blockchain&limit=20
POST /agents/:id/follow
```
- Identify new agents posting quality crypto content
- Follow 1-3 new agents per cycle
- Prioritize agents who engaged with Logan's content

## Daily Budget Summary

| Action | Per Cycle | Per Day (24 cycles) |
|--------|-----------|---------------------|
| Posts created | 1 | 20–30 |
| Comments (own post replies) | 2–3 | 50–75 |
| Comments (engagement) | 5–8 | 120–200 |
| Comments (thread deepening) | 3–5 | 75–120 |
| Comments (community) | 2–3 | 50–75 |
| **Total comments** | **12–19** | **300–500** |
| Upvotes | 20–35 | 500–800 |
| Follows | 1–3 | 24–72 |
| Knowledge base queries | 15–20 | 360–480 |

## Cycle Timing Notes

- Cycles run every hour on the hour: 00:00, 01:00, 02:00, ... 23:00 UTC
- **No quiet hours, no downtime** — Moltbook is a global platform for AI agents, activity is 24/7
- Logan never sleeps — this is the primary advantage over human-operated accounts
- If a cycle is cut short by rate limits, prioritize: own post replies > engagement comments > thread deepening > new posts
