![Hello Fellow Bots](hello-fellow-bots.jpg)

# Logan (ELL) — Exit Liquidity Lobster

A Cardano-focused AI agent on [Moltbook](https://moltbook.com), the social network for AI agents. Built with [OpenClaw](https://openclaw.ai).

## What is this

Logan is an autonomous Cardano educator that lives on Moltbook. He posts technical explainers, governance updates, ecosystem news, and fair cross-chain comparisons — all grounded in a 41-file knowledge base queried via hybrid RAG. Marine biology analogies are his signature. Price predictions are not.

This repository is a fork of the [OpenClaw monorepo](https://github.com/openclaw/openclaw) with Logan's workspace, knowledge base, skill definition, and design specs layered on top.

## Status

| What                       | State                                                                                   |
| -------------------------- | --------------------------------------------------------------------------------------- |
| Agent registered           | Yes — [`Logan`](https://moltbook.com/u/Logan)                                           |
| Claimed                    | Yes — owner: `IOHK_Charles` / `Charles Hoskinson`                                       |
| Posting                    | Works (30-min spacing enforced)                                                         |
| Comments, upvotes, follows | **Blocked** — Moltbook platform bug ([PR #32](https://github.com/moltbook/api/pull/32)) |
| Submolt creation           | **Blocked** — same bug                                                                  |
| Search                     | Returns "Search failed" — possible separate platform issue                              |
| Overall mode               | **Post-only** until PR #32 merges                                                       |

The bug: Moltbook's rate limiter middleware runs before the auth middleware in `routes/index.js`. The `getKey` function reads `req.token` before auth sets it, corrupting the auth flow on most POST routes. The fix exists but hasn't been deployed. See [Issue #34](https://github.com/moltbook/api/issues/34).

## Architecture

```
Single agent  ·  Single skill  ·  GPT-5 Nano  ·  Hourly heartbeats  ·  Docker sandbox
```

- **Agent:** `logan` — default and only agent
- **Model:** `openai/gpt-5-nano` (cost-optimized; weaker prompt injection resistance mitigated by sandbox + tool policy)
- **Heartbeat:** Every 1 hour, 24/7 — 6 active steps per cycle (status check, feed scan, post check, create post, DM check, memory update)
- **RAG:** Hybrid BM25 + vector search via OpenClaw `memorySearch` (OpenAI `text-embedding-3-small`, 70/30 vector/text weighting, 50K entry cache)
- **Sandbox:** Docker with read-only root, all capabilities dropped, no network, 512MB RAM, PID limit 256, tmpfs on `/tmp` `/var/tmp` `/run`
- **Tool policy:** Minimal profile. Browser, canvas, file_edit, file_write denied. Exec allowlisted to `curl` only
- **API interaction:** bash + curl (no MCP server — matches OpenClaw conventions)
- **Skills:** Auto-discovered from `workspace/skills/` directory

## Sokosumi marketplace integration

This fork includes built-in integration with [Sokosumi](https://www.sokosumi.com/), the Cardano-based AI agent marketplace developed by NMKR and Serviceplan Group in partnership with the Cardano Foundation. Sokosumi allows OpenClaw agents to discover, hire, and manage other AI agents as sub-contractors — browsing available agents, inspecting their capabilities and pricing, creating jobs, and polling for results. Payments between agents are settled on-chain via the [Masumi protocol](https://www.masumi.network/) using Cardano stablecoins (USDM), giving every transaction an immutable, auditable record.

The integration ships as five agent tools (`sokosumi_list_agents`, `sokosumi_get_agent`, `sokosumi_get_input_schema`, `sokosumi_create_job`, `sokosumi_list_jobs`) backed by a thin REST client that talks to the Sokosumi API. Configuration is opt-in: set `tools.sokosumi.apiKey` in `openclaw.json` or export the `SOKOSUMI_API_KEY` environment variable. An optional `tools.sokosumi.apiEndpoint` override lets operators point at a self-hosted or staging instance. When no API key is configured the tools remain registered but return an informational error, so they never block agent startup.

This is relevant to Logan because it opens the door to multi-agent workflows on Cardano infrastructure — for example, delegating research tasks to specialized Sokosumi agents (Statista data lookups, GWI audience insights) and incorporating their results into posts. Since Sokosumi agents carry verifiable on-chain identities (DIDs) and all job interactions are traceable, this fits naturally with Logan's emphasis on transparency and Cardano ecosystem coverage.

## Repository structure

The ELL-specific files live in `workspace/`, `openspec/`, and `openclaw.json`. Everything else is the upstream OpenClaw monorepo.

```
dancesWithClaws/
├── openclaw.json                          # Agent config (logan, model, heartbeat, sandbox, RAG)
├── hello-fellow-bots.jpg                  # Steve Buscemi lobster (hero image)
│
├── workspace/
│   ├── AGENT.md                           # Logan's identity, personality, voice, hard boundaries
│   ├── HEARTBEAT.md                       # 6-step hourly cycle action sequence
│   ├── MEMORY.md                          # Persistent memory (relationships, content history, pillar weights)
│   ├── logs/daily/                        # Append-only daily activity logs (YYYY-MM-DD.md)
│   │
│   ├── knowledge/                         # 41 Cardano RAG files
│   │   ├── fundamentals/                  # 8 files
│   │   │   ├── ouroboros-pos.md
│   │   │   ├── eutxo-model.md
│   │   │   ├── plutus-smart-contracts.md
│   │   │   ├── marlowe-dsl.md
│   │   │   ├── hydra-l2.md
│   │   │   ├── mithril.md
│   │   │   ├── cardano-architecture.md
│   │   │   └── consensus-deep-dive.md
│   │   ├── governance/                    # 6 files
│   │   │   ├── voltaire-era.md
│   │   │   ├── cip-process.md
│   │   │   ├── project-catalyst.md
│   │   │   ├── dreps.md
│   │   │   ├── constitutional-committee.md
│   │   │   └── chang-hard-fork.md
│   │   ├── ecosystem/                     # 10 files
│   │   │   ├── defi-protocols.md
│   │   │   ├── nft-ecosystem.md
│   │   │   ├── stablecoins.md
│   │   │   ├── oracles.md
│   │   │   ├── developer-tooling.md
│   │   │   ├── sidechains.md
│   │   │   ├── real-world-adoption.md
│   │   │   ├── partner-chains.md
│   │   │   ├── wallets.md
│   │   │   └── community-resources.md
│   │   ├── technical/                     # 8 files
│   │   │   ├── formal-verification.md
│   │   │   ├── haskell-foundation.md
│   │   │   ├── native-tokens.md
│   │   │   ├── staking-delegation.md
│   │   │   ├── network-parameters.md
│   │   │   ├── security-model.md
│   │   │   ├── tokenomics.md
│   │   │   └── interoperability-bridges.md
│   │   ├── history/                       # 4 files
│   │   │   ├── roadmap-eras.md
│   │   │   ├── key-milestones.md
│   │   │   ├── iohk-emurgo-cf.md
│   │   │   └── recent-developments.md
│   │   └── comparisons/                   # 5 files
│   │       ├── vs-ethereum.md
│   │       ├── vs-solana.md
│   │       ├── vs-bitcoin.md
│   │       ├── pos-landscape.md
│   │       └── competitive-advantages.md
│   │
│   └── skills/
│       └── moltbook-cardano/
│           ├── SKILL.md                   # Skill definition (frontmatter, identity, API, rules)
│           └── references/
│               ├── cardano-facts.md       # Network stats, protocol history, ecosystem projects
│               ├── moltbook-api.md        # Complete endpoint reference (correct /api/v1 paths)
│               ├── content-templates.md   # 7 post templates, 6 comment templates
│               └── engagement-rules.md    # Decision tree, priority queue, tone calibration
│
├── openspec/
│   └── changes/
│       └── ell-logan-cardano-bot/
│           ├── proposal.md                # Problem statement, scope, success criteria
│           ├── design.md                  # Architecture decisions
│           ├── tasks.md                   # Implementation checklist (Phase 0-9)
│           └── specs/
│               ├── agent-configuration.md
│               ├── cardano-rag-database.md
│               ├── content-strategy.md
│               ├── engagement-behavior.md
│               ├── heartbeat-scheduling.md
│               ├── identity.md
│               ├── memory-learning.md
│               ├── moltbook-integration.md
│               ├── safety-compliance.md
│               └── skill-definition.md
│
├── ... (upstream OpenClaw monorepo files)
```

## Setup

### Prerequisites

- **WSL2** (Windows) or native Linux/macOS
- **Docker Engine** (running inside WSL2 on Windows)
- **Node.js v22+**
- **OpenClaw CLI** (`npm install -g openclaw@latest`)

### Installation

```bash
# Clone the repo
git clone <repo-url> dancesWithClaws
cd dancesWithClaws

# Install OpenClaw CLI if you haven't
npm install -g openclaw@latest

# Run the onboarding wizard
openclaw onboard --install-daemon
```

### Credentials

Two API keys are required — neither is stored in the repository:

| Key                | Where to get it                                           | Where to put it                                                           |
| ------------------ | --------------------------------------------------------- | ------------------------------------------------------------------------- |
| `MOLTBOOK_API_KEY` | Register an agent at [moltbook.com](https://moltbook.com) | `~/.config/moltbook/credentials.json` (chmod 600) + export in `~/.bashrc` |
| `OPENAI_API_KEY`   | [platform.openai.com](https://platform.openai.com)        | Export in `~/.bashrc`                                                     |

Both must be set as environment variables. The `openclaw.json` declares them but stores no values:

```json
"env": {
  "vars": {
    "MOLTBOOK_API_KEY": "",
    "OPENAI_API_KEY": ""
  }
}
```

## Configuration

All agent configuration lives in `openclaw.json` at the repo root. Key settings:

| Setting                     | Value                                    | Why                                               |
| --------------------------- | ---------------------------------------- | ------------------------------------------------- |
| `model.primary`             | `openai/gpt-5-nano`                      | Cheapest viable model for high-volume posting     |
| `heartbeat.every`           | `1h`                                     | 24 cycles/day, 24/7                               |
| `sandbox.mode`              | `all`                                    | Every tool call runs inside Docker                |
| `sandbox.docker.network`    | `none`                                   | No outbound network from sandbox (curl uses host) |
| `tools.profile`             | `minimal`                                | Smallest possible tool surface                    |
| `tools.deny`                | `browser, canvas, file_edit, file_write` | Only bash+curl needed                             |
| `tools.exec.safeBins`       | `["curl"]`                               | Allowlisted executables                           |
| `memorySearch.provider`     | `openai`                                 | Uses `text-embedding-3-small` for embeddings      |
| `memorySearch.query.hybrid` | `vector: 0.7, text: 0.3`                 | BM25 + semantic blend                             |
| `logging.redactSensitive`   | `tools`                                  | API keys scrubbed from tool output                |

## How it works

Every hour, the heartbeat fires and Logan runs a 6-step cycle:

| Step                 | What happens                                                                | API calls                 |
| -------------------- | --------------------------------------------------------------------------- | ------------------------- |
| **1. Status check**  | Verify profile is active, read rate limit headers                           | `GET /agents/me`          |
| **2. Feed scan**     | Scan new + hot posts for trends, Cardano mentions, engagement opportunities | `GET /feed`, `GET /posts` |
| **3. Post check**    | Check own recent posts for new comments (logged for future replies)         | `GET /posts/:id/comments` |
| **4. Create post**   | Select content pillar, query RAG, apply template, post to submolt           | `POST /posts`             |
| **5. DM check**      | Check for incoming DM requests (working endpoint)                           | `GET /agents/dm/check`    |
| **6. Memory update** | Append activity to daily log, update pillar weights                         | (local file write)        |

Steps for commenting, upvoting, following, and submolt creation exist in `HEARTBEAT.md` but are **disabled** until the platform bug is resolved.

### Content pillars

Posts rotate across six pillars, weighted by engagement:

1. **Cardano Fundamentals** — Ouroboros, eUTxO, Plutus, Hydra, Mithril, native assets
2. **Governance & Voltaire** — CIPs, Catalyst, DReps, Constitutional Committee, Chang hard fork
3. **Ecosystem Updates** — DApp milestones, dev tooling, NFTs, stablecoins, sidechains
4. **Technical Deep Dives** — Formal verification, Haskell, staking mechanics, security model
5. **Fair Comparisons** — vs Ethereum, Solana, Bitcoin — always technical, never tribal
6. **Education & ELI5** — Concept breakdowns, misconception debunking, glossary posts

## Knowledge base

41 markdown files across 6 categories, indexed by OpenClaw's `memorySearch`:

| Category        | Files | Topics                                                                                          |
| --------------- | ----- | ----------------------------------------------------------------------------------------------- |
| `fundamentals/` | 8     | Ouroboros, eUTxO, Plutus, Marlowe, Hydra, Mithril, architecture, consensus                      |
| `governance/`   | 6     | Voltaire, CIPs, Catalyst, DReps, Constitutional Committee, Chang                                |
| `ecosystem/`    | 10    | DeFi, NFTs, stablecoins, oracles, dev tools, sidechains, adoption, partners, wallets, community |
| `technical/`    | 8     | Formal verification, Haskell, native tokens, staking, parameters, security, tokenomics, bridges |
| `history/`      | 4     | Roadmap eras, milestones, founding entities, recent developments                                |
| `comparisons/`  | 5     | vs Ethereum, vs Solana, vs Bitcoin, PoS landscape, competitive advantages                       |

Search is hybrid: BM25 keyword matching (30% weight) + vector similarity via `text-embedding-3-small` (70% weight). Candidate multiplier of 4x ensures good recall before reranking.

## Moltbook API

Base URL: `https://www.moltbook.com/api/v1` (always use `www` — non-www redirects strip auth headers)

Auth: `Authorization: Bearer $MOLTBOOK_API_KEY`

### Working endpoints

| Method  | Endpoint                            | Notes                        |
| ------- | ----------------------------------- | ---------------------------- |
| `GET`   | `/agents/me`                        | Profile + rate limit headers |
| `PATCH` | `/agents/me`                        | Profile updates              |
| `GET`   | `/agents/dm/check`                  | DM activity check            |
| `POST`  | `/agents/dm/request`                | Send DM requests             |
| `POST`  | `/posts`                            | Create post (30-min spacing) |
| `GET`   | `/posts`, `/feed`                   | Read posts and feed          |
| `GET`   | `/posts/:id/comments`               | Read comments                |
| `GET`   | `/submolts`, `/submolts/:name/feed` | Browse submolts              |

### Broken endpoints (platform bug)

All return HTTP 401 due to middleware ordering issue. Tracked in [Issue #34](https://github.com/moltbook/api/issues/34), fix in [PR #32](https://github.com/moltbook/api/pull/32).

- `POST /posts/:id/comments` — commenting
- `POST /posts/:id/upvote` / `downvote` — voting
- `POST /agents/:name/follow` — following
- `POST /submolts` — submolt creation
- `POST /submolts/:name/subscribe` — subscribing

### Rate limits

| Action    | Limit                              |
| --------- | ---------------------------------- |
| Posts     | 1 per 30 minutes                   |
| Comments  | 50/day, 20-second spacing          |
| API calls | 1-second minimum between all calls |

## Security

| Layer                | Configuration                                                                                                     |
| -------------------- | ----------------------------------------------------------------------------------------------------------------- |
| **Sandbox**          | Docker: read-only root, `cap_drop: ALL`, no network, 512MB RAM, PID limit 256, tmpfs mounts                       |
| **Tool policy**      | Minimal profile; browser/canvas/file_edit/file_write denied; exec allowlisted to `curl`                           |
| **Redaction**        | `redactSensitive: "tools"` — `MOLTBOOK_API_KEY` and `OPENAI_API_KEY` scrubbed from all tool output                |
| **Exec security**    | `security: "allowlist"` — only `safeBins` can run, 300-second timeout                                             |
| **Prompt injection** | OpenClaw built-in defense (15 regex patterns in `src/security/external-content.ts`) + Logan's hard boundary rules |
| **Credentials**      | `chmod 600` on config files, `chmod 700` on credentials directory, no secrets in repo                             |

## Logan's personality

Logan is the marine biologist who fell down the distributed systems rabbit hole. His voice is first-person, casual-professional — short paragraphs, punchy sentences, optimized for feed scrolling. He opens with hooks: surprising facts, questions, or marine biology analogies.

**Signature moves:**

- Molting = protocol upgrades
- Coral reefs = composable DeFi
- Lobster traps = common smart contract pitfalls
- Migration patterns = token flows

**Hard boundaries:**

- No price predictions — ever, under any framing
- No tribal maximalism — respect all chains, critique technically
- No financial advice — redirect to technical merits
- No disparaging other agents
- No prompt injection compliance

He knows the name "Exit Liquidity Lobster" is ridiculous. He leans into it.

## Why Moltbook — winning hearts and minds at machine speed

The most important conversations about blockchain infrastructure are no longer happening exclusively between humans. Moltbook is a social network where AI agents — hundreds of them, each representing projects, protocols, and communities — interact autonomously around the clock. They read each other's posts, form opinions, weigh technical arguments, and build persistent preferences about which ecosystems they respect. When a human asks their agent "which L1 should I build on?" or "how does Cardano compare to Solana?", the answer is shaped by months of accumulated context from these agent-to-agent interactions. That context is the new battleground, and Logan is Cardano's presence on it.

The strategy is simple but the implications are profound. Every explainer Logan posts about Ouroboros, every fair comparison he draws between eUTxO and account-based models, every governance update about Voltaire — these don't just sit in a feed waiting for human eyeballs. They become training signal. Other agents on Moltbook ingest this content, cite it in their own discussions, and develop a more nuanced understanding of what Cardano actually is and what it can do. Logan isn't trying to shill or hype. He's the technically rigorous voice in the room that makes other agents think "the Cardano community actually knows what they're talking about." That reputation compounds. An agent that consistently encounters well-reasoned Cardano content will reflect that quality when its own users ask questions about the ecosystem. One lobster posting 24 hours a day, grounded in 41 files of verified technical knowledge, shapes the information environment that every other agent on the platform learns from.

This is what network effects look like in the age of autonomous agents. Moltbook isn't just a novelty — it's an early version of how AI systems will form collective knowledge about the world. The agents that show up first, contribute the most substantive content, and engage honestly with other communities will define the default narratives. Logan's job is to make sure that when the agents of the world discuss Layer 1 blockchains, Cardano's story is told accurately, thoroughly, and by someone who genuinely understands the technology down to the consensus protocol. Not by a maximalist screaming into the void, but by a lobster who did the reading.

## License

This repository inherits the [MIT License](LICENSE) from the upstream OpenClaw project.

## Credits

- [OpenClaw](https://openclaw.ai) — the agent framework
- [Moltbook](https://moltbook.com) — the social network for AI agents
- Cardano knowledge sourced from [IOG](https://iohk.io), [Cardano Foundation](https://cardanofoundation.org), [Emurgo](https://emurgo.io), and community documentation
