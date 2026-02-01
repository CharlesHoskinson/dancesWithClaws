# ELL Bootstrap — Session State & Resume Context

## What Is ELL

Logan (codename: ELL — Exit Liquidity Lobster) is a Cardano-focused OpenClaw agent for Moltbook, the social network for AI agents. Single agent, single skill (`moltbook-cardano`), Claude Sonnet 4, 24/7 hourly heartbeats.

## Repository Location

`C:\dancesWithClaws\` (OpenClaw monorepo)

## Spec Files (all under `openspec/changes/ell-logan-cardano-bot/`)

| File | Purpose |
|------|---------|
| `proposal.md` | Problem statement, scope, success criteria |
| `design.md` | Architecture decisions (single agent, bash+curl, RAG, heartbeat) |
| `tasks.md` | Full implementation checklist (Phase 0-8 + ongoing) |
| `specs/agent-configuration.md` | openclaw.json config, model, heartbeat, memorySearch |
| `specs/cardano-rag-database.md` | Knowledge base structure, RAG config, population strategy |
| `specs/content-strategy.md` | 6 content pillars, post templates, distribution |
| `specs/engagement-behavior.md` | Comment targets, decision tree, voting, following |
| `specs/heartbeat-scheduling.md` | 1-hour cycle sequence, 24/day |
| `specs/identity.md` | Logan's personality, marine biology analogies |
| `specs/memory-learning.md` | MEMORY.md structure, daily logs, learning loop |
| `specs/moltbook-integration.md` | API endpoints, registration, submolts |
| `specs/safety-compliance.md` | Rate limits, content safety, input sanitization, security hardening |
| `specs/skill-definition.md` | SKILL.md structure, references/ files, frontmatter |

## What's Been Completed

### Knowledge Base (41 files) — DONE
All files written under `workspace/knowledge/`:
- `fundamentals/` (8): ouroboros-pos, eutxo-model, plutus-smart-contracts, marlowe-dsl, hydra-l2, mithril, cardano-architecture, consensus-deep-dive
- `governance/` (6): voltaire-era, cip-process, project-catalyst, dreps, constitutional-committee, chang-hard-fork
- `ecosystem/` (10): defi-protocols, nft-ecosystem, stablecoins, oracles, developer-tooling, sidechains, real-world-adoption, partner-chains, wallets, community-resources
- `technical/` (8): formal-verification, haskell-foundation, native-tokens, staking-delegation, network-parameters, security-model, tokenomics, interoperability-bridges
- `history/` (4): roadmap-eras, key-milestones, iohk-emurgo-cf, recent-developments
- `comparisons/` (5): vs-ethereum, vs-solana, vs-bitcoin, pos-landscape, competitive-advantages

### Spec Updates — DONE
- `specs/skill-definition.md` — frontmatter fixed to match OpenClaw metadata format (per `skills/bird/SKILL.md`)
- `specs/cardano-rag-database.md` — directory tree updated with 8 new files, total updated to 41
- `specs/safety-compliance.md` — added "Platform Security Hardening" section: sandbox config, tool policy, output redaction, DM policy, security audit, model strength tradeoff, external content wrapping
- `tasks.md` — added Phase 0 (WSL2+Docker), Phase 4.5 (Security Hardening), corrected file counts

### Custom Skills Assessment — DONE
Single skill (`moltbook-cardano`) is sufficient. No additional custom skills needed. OpenClaw's built-in `memory_search` handles RAG, bash+curl handles Moltbook API.

### Security Review — DONE (assessment only)
OpenClaw has comprehensive built-in security: prompt injection defense (15 regex patterns), Docker sandbox, security audit CLI (40+ checks), secret scanning, tool policy engine. No custom security skill needed. Gaps identified and added to specs + tasks.

## What Remains (by phase)

### Phase 0: Windows Environment
- [x] Enable WSL2
- [ ] Enable Virtual Machine Platform (`wsl --install --no-distribution` then reboot)
- [ ] Install Ubuntu in WSL2 (`wsl --install -d Ubuntu`)
- [ ] Install Docker Desktop with WSL2 backend
- [ ] Verify Docker from WSL2

### Phase 1: Setup
- [ ] Install OpenClaw CLI
- [ ] Create full workspace structure (knowledge/ done, need rest)
- [ ] Set up `openclaw.json`
- [ ] Configure memorySearch, heartbeat

### Phase 2: Knowledge Base
- [x] All 41 knowledge files written
- [ ] Verify indexing via memorySearch
- [ ] Test hybrid search queries

### Phase 3: Workspace Files
- [ ] Write `AGENT.md` (identity + behavioral guidelines)
- [ ] Write `HEARTBEAT.md` (1-hour cycle action sequence)
- [ ] Write `MEMORY.md` (initial empty structure)
- [ ] Create `logs/daily/` directory

### Phase 4: Skill Development
- [ ] Write `skills/moltbook-cardano/SKILL.md` with corrected frontmatter
- [ ] Write `references/cardano-facts.md`
- [ ] Write `references/moltbook-api.md`
- [ ] Write `references/content-templates.md`
- [ ] Write `references/engagement-rules.md`

### Phase 4.5: Security Hardening
- [ ] Configure sandbox in openclaw.json
- [ ] Configure tool policy (least privilege)
- [ ] Enable output redaction
- [ ] Set DM policy to disabled
- [ ] Run `openclaw security audit --deep --fix --agent logan`
- [ ] Test prompt injection resistance

### Phase 5-8: Configuration, Registration, Testing, Launch
See `tasks.md` for full details.

## Key Architecture Decisions

- **Sandbox:** Docker via WSL2 (only option on Windows). Config: `mode: "all"`, `scope: "agent"`, `workspaceAccess: "rw"`
- **Tool policy:** Deny-by-default. Allow only: curl to www.moltbook.com, memory_search, workspace read, logs+MEMORY.md write
- **Model:** Sonnet 4 (cost tradeoff vs Opus 4.5 security). Mitigated by tool policy + sandbox + input sanitization
- **No MCP server:** bash+curl for API calls, matching OpenClaw conventions
- **RAG:** OpenClaw's built-in hybrid BM25 + semantic search via memorySearch

## Key Reference Files in OpenClaw

- `skills/bird/SKILL.md` — reference for skill frontmatter format
- `src/security/external-content.ts` — prompt injection defense (15 patterns)
- `src/agents/sandbox/` — Docker sandbox implementation
- `docs/platforms/windows.md` — WSL2 requirement documented
- `docs/gateway/security/index.md` — comprehensive security guide (814 lines)

## Resume Instructions

To continue this work in a new session:
1. Read this file first for full context
2. Read `tasks.md` for the current checklist
3. Next immediate action after reboot: finish WSL2 setup (Phase 0)
4. Then proceed to Phase 3 (workspace files) and Phase 4 (skill development)
