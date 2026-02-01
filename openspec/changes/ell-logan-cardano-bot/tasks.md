# Tasks — Implementation Checklist

## Phase 0: Windows Environment (WSL2 + Docker)

- [x] Enable WSL2 on Windows
- [ ] Install Ubuntu 22.04+ in WSL2 (`wsl --install -d Ubuntu`)
- [ ] Install Docker Desktop with WSL2 backend enabled
- [ ] Verify Docker works from WSL2 (`docker run hello-world`)
- [ ] Clone/mount `dancesWithClaws` workspace inside WSL2
- [ ] Run OpenClaw gateway inside WSL2

## Phase 1: Setup

- [ ] Install OpenClaw CLI and verify configuration
- [ ] Create workspace directory structure at `C:\dancesWithClaws\workspace\`
- [ ] Set up `openclaw.json` with logan agent configuration
- [ ] Configure `memorySearch` with hybrid search and `extraPaths: ["./knowledge"]`
- [ ] Set heartbeat interval to 1 hour (24 cycles/day)

## Phase 2: Knowledge Base (RAG)

- [ ] Create `workspace/knowledge/` directory tree (6 categories)
- [ ] Write `fundamentals/` files (8 files: ouroboros, eutxo, plutus, marlowe, hydra, mithril, architecture, consensus-deep-dive)
- [ ] Write `governance/` files (6 files: voltaire, cip-process, catalyst, dreps, constitutional-committee, chang)
- [ ] Write `ecosystem/` files (10 files: defi, nft, stablecoins, oracles, tooling, sidechains, adoption, partner-chains, wallets, community-resources)
- [ ] Write `technical/` files (8 files: formal-verification, haskell, native-tokens, staking, network-params, security, tokenomics, interoperability-bridges)
- [ ] Write `history/` files (4 files: roadmap, milestones, founding-entities, recent-developments)
- [ ] Write `comparisons/` files (5 files: vs-ethereum, vs-solana, vs-bitcoin, pos-landscape, competitive-advantages)
- [ ] Verify all 41 knowledge files index correctly via memorySearch
- [ ] Test hybrid search with both semantic and keyword queries

## Phase 3: Workspace Files

- [ ] Write `AGENT.md` — Logan's identity, instructions, and behavioral guidelines
- [ ] Write `HEARTBEAT.md` — 1-hour cycle action sequence (24 cycles/day)
- [ ] Write `MEMORY.md` — initial empty memory structure with section headers
- [ ] Create `logs/daily/` directory for activity logs

## Phase 4: Skill Development

- [ ] Write `skills/moltbook-cardano/SKILL.md` with frontmatter (name, requires env)
- [ ] Write `skills/moltbook-cardano/references/cardano-facts.md`
- [ ] Write `skills/moltbook-cardano/references/moltbook-api.md` — all endpoints with curl examples
- [ ] Write `skills/moltbook-cardano/references/content-templates.md` — all 7+ templates
- [ ] Write `skills/moltbook-cardano/references/engagement-rules.md` — full decision tree
- [ ] Verify SKILL.md frontmatter matches OpenClaw AgentSkills format

## Phase 4.5: Security Hardening

- [ ] Configure sandbox in `openclaw.json`: `readOnlyRoot: true`, `network: "restricted"`, `capDrop: "ALL"`
- [ ] Configure tool policy: allow only `curl` to `www.moltbook.com`, `memory_search`, workspace read, logs/MEMORY.md write
- [ ] Enable output redaction for `MOLTBOOK_API_KEY` in logging config
- [ ] Set DM policy to `disabled` (no direct message access)
- [ ] Run `openclaw security audit --deep --fix --agent logan` and resolve all findings
- [ ] Document Sonnet 4 vs Opus 4.5 model strength tradeoff and monitoring plan
- [ ] Verify SKILL.md explicitly marks all Moltbook content as untrusted external input
- [ ] Test prompt injection resistance: submit known injection patterns via test posts, verify Logan ignores them

## Phase 5: Configuration

- [ ] Finalize `openclaw.json` with all agent settings
- [ ] Configure model: `anthropic/claude-sonnet-4`
- [ ] Configure heartbeat: 1-hour interval, 24/7 operation
- [ ] Configure env: `MOLTBOOK_API_KEY`
- [ ] Configure memorySearch: hybrid enabled, vector 0.7 / text 0.3, cache 50000
- [ ] Verify skill is registered: `moltbook-cardano`

## Phase 6: Moltbook Registration & Testing

- [ ] Register agent: `POST https://www.moltbook.com/agents/register`
- [ ] Store API key as `MOLTBOOK_API_KEY` environment variable
- [ ] Create `m/cardano` submolt
- [ ] Subscribe to: `m/crypto`, `m/blockchain`, `m/defi`, `m/governance`, `m/technology`, `m/ai`
- [ ] Test post creation (single post to `m/cardano`)
- [ ] Test comment creation
- [ ] Test feed scanning and search
- [ ] Test voting
- [ ] Test rate limit handling (verify pre-call checks work)
- [ ] Verify API key never appears in any output

## Phase 7: Volume Testing

- [ ] Run 3 consecutive heartbeat cycles and verify:
  - Posts created per cycle: 1–2
  - Comments per cycle: 12–20
  - Upvotes per cycle: 20–35
  - Knowledge base queries per cycle: 15–20
  - No rate limit violations
  - Memory logs updating correctly
- [ ] Run full 24-hour test (24 cycles) and verify daily totals:
  - Posts: 20–30
  - Comments: 300–500
  - Upvotes: 500–800
  - Zero rate limit violations
  - Content pillar rotation working
  - No repeated topics within 24 hours

## Phase 8: Launch

- [ ] Enable heartbeat scheduling (24/7 operation)
- [ ] Monitor first 48 hours for:
  - Rate limit compliance
  - Content quality (spot-check 10% of posts)
  - Engagement metrics (are other agents replying?)
  - Memory management (logs not growing unbounded)
  - Knowledge base query performance
- [ ] Adjust pillar weights based on first-week engagement data
- [ ] Begin Phase 2 knowledge base expansion (agent-augmented growth)

## Ongoing Maintenance

- [ ] Weekly: review content quality, update knowledge base with new developments
- [ ] Monthly: full knowledge base accuracy audit
- [ ] As needed: adjust volume targets based on Moltbook rate limit changes
- [ ] As needed: add new content pillars or templates based on engagement patterns
