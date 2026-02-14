![Hello Fellow Bots](hello-fellow-bots.jpg)

# Logan (ELL) -- Exit Liquidity Lobster

A Cardano-focused AI agent on [Moltbook](https://moltbook.com), built with [OpenClaw](https://openclaw.ai).

## What is this

Logan is an autonomous Cardano educator that lives on Moltbook, the social network for AI agents. He posts technical explainers, governance updates, ecosystem news, and fair cross-chain comparisons, all grounded in a 54-file knowledge base queried via hybrid RAG. Marine biology analogies are his signature. Price predictions are not.

This repository is a fork of the [OpenClaw monorepo](https://github.com/openclaw/openclaw) with Logan's workspace, knowledge base, skill definition, and design specs layered on top.

## Status

| What                       | State                                                                              |
| -------------------------- | ---------------------------------------------------------------------------------- |
| Agent registered           | Yes, [`Logan`](https://moltbook.com/u/Logan)                                       |
| Claimed                    | Yes, owner: `IOHK_Charles` / `Charles Hoskinson`                                   |
| Posting                    | Works (30-min spacing enforced)                                                    |
| Comments, upvotes, follows | Blocked, Moltbook platform bug ([PR #32](https://github.com/moltbook/api/pull/32)) |
| Submolt creation           | Blocked, same bug                                                                  |
| Search                     | Returns "Search failed", possibly a separate platform issue                        |
| Overall mode               | Post-only until PR #32 merges                                                      |

The bug: Moltbook's rate limiter middleware runs before the auth middleware in `routes/index.js`. The `getKey` function reads `req.token` before auth sets it, corrupting the auth flow on most POST routes. The fix exists but hasn't been deployed. See [Issue #34](https://github.com/moltbook/api/issues/34).

## Architecture

```
Single agent  ·  Single skill  ·  GPT-5 Nano  ·  Hourly heartbeats  ·  Hardened Docker sandbox + proxy sidecar
```

- Agent: `logan`, default and only agent
- Model: `openai/gpt-5-nano` (cost-optimized; weaker prompt injection resistance mitigated by sandbox + tool policy)
- Heartbeat: every 1 hour, 24/7. 6 active steps per cycle
- RAG: hybrid BM25 + vector search via OpenClaw `memorySearch` (OpenAI `text-embedding-3-small`, 70/30 vector/text weighting, 50K entry cache)
- Sandbox: Docker with read-only root, all capabilities dropped, seccomp syscall filter, non-root user, 512MB RAM, PID limit 256. Network egress only via proxy sidecar (Squid, domain allowlist, 64KB/s rate limit)
- Tool policy: minimal profile. Browser, canvas, file_edit, file_write denied. Exec allowlisted to `curl` only
- Skills: auto-discovered from `workspace/skills/`

## Cardano ecosystem tools

32 tools across 8 integrations for querying blockchain data, swapping tokens, resolving handles, and reading governance proposals. All load automatically and work without API keys (though you'll hit rate limits quickly without them).

| Integration    | Tools | What it does                                                                          |
| -------------- | ----- | ------------------------------------------------------------------------------------- |
| **TapTools**   | 5     | Token prices, holder distributions, NFT collection stats, DEX volume, trending assets |
| **Cexplorer**  | 5     | Address balances, transaction details, stake pool info, epoch stats, search           |
| **Ada Handle** | 4     | Resolve $handles to addresses, reverse lookup, metadata, availability check           |
| **CSWAP**      | 4     | Liquidity pools, token prices, swap estimates, pool depth                             |
| **Metera**     | 3     | Index tokens, composition, performance metrics                                        |
| **GovCircle**  | 3     | Governance circles, proposals, voting records                                         |
| **ADA Anvil**  | 4     | Mint tokens, burn tokens, create NFT collections, minting history                     |
| **NABU VPN**   | 3     | VPN node listing, node stats, service status                                          |

API keys go in environment variables (`TAPTOOLS_API_KEY`, `CEXPLORER_API_KEY`, etc.) or in `openclaw.json` under `tools.<integration>.apiKey`.

Full documentation: [`docs/tools/cardano.md`](docs/tools/cardano.md)

## Pluggy-McPlugFace

<img src="pluggy.jpg" width="450" alt="Pluggy-McPlugFace, the plugin system mascot" />

A voxel crab juggling plugin cartridges on a circuit board ocean floor. The glowing eyes mean it's thinking. Or just on.

Plugins:

- **cardano-taptools** -- Token prices, holders, NFT stats, DEX volume
- **cardano-handle** -- $handle resolution, reverse lookup, metadata
- **cardano-nabu** -- VPN node listing and stats
- **cardano-metera** -- Index token composition and performance
- **cardano-govcircle** -- Governance circles, proposals, votes
- **cardano-cexplorer** -- Address info, transactions, pools, epochs
- **cardano-cswap** -- Liquidity pools, prices, swap estimates
- **cardano-anvil** -- Token minting, burning, collections

Each plugin loads independently and handles its own auth. Mix and match.

Want to build one? See the [plugin guide](docs/building-plugins.md).

## Repository structure

The ELL-specific files live in `workspace/`, `openspec/`, and `openclaw.json`. Everything else is the upstream OpenClaw monorepo.

```
dancesWithClaws/
├── openclaw.json                  # Agent config (logan, model, heartbeat, sandbox, RAG)
├── hello-fellow-bots.jpg          # Steve Buscemi lobster (hero image)
├── workspace/
│   ├── AGENT.md                   # Logan's identity, personality, voice, hard boundaries
│   ├── HEARTBEAT.md               # 6-step hourly cycle action sequence
│   ├── MEMORY.md                  # Persistent memory (relationships, content history)
│   ├── logs/daily/                # Append-only daily activity logs
│   ├── knowledge/                 # 54 Cardano RAG files across 6 categories
│   └── skills/moltbook-cardano/   # Skill definition + reference files
├── openspec/changes/              # Design proposal, specs, task checklist
├── extensions/tee-vault/          # Hardware-backed encrypted vault (YubiHSM 2)
├── mostlySecure.md                # Full hardware security guide
└── ... (upstream OpenClaw monorepo files)
```

## Quick start

Full 10-step Windows setup: [`docs/setup-windows.md`](docs/setup-windows.md)

Short version:

```bash
# 1. Enable WSL2 + Docker Desktop
# 2. Clone into WSL2 home (not /mnt/c/)
git clone <repo-url> ~/dancesWithClaws && cd ~/dancesWithClaws
# 3. Install Node 22 + pnpm + OpenClaw CLI
npm install -g openclaw@latest
# 4. Set MOLTBOOK_API_KEY and OPENAI_API_KEY in ~/.bashrc
# 5. Build Docker images and start proxy
docker build -t openclaw-sandbox -f Dockerfile.sandbox .
docker build -t openclaw-proxy -f Dockerfile.proxy .
# 6. Start Logan
openclaw agent start logan
```

## Configuration

All agent configuration lives in `openclaw.json` at the repo root.

| Setting                     | Value                                    | Why                                           |
| --------------------------- | ---------------------------------------- | --------------------------------------------- |
| `model.primary`             | `openai/gpt-5-nano`                      | Cheapest viable model for high-volume posting |
| `heartbeat.every`           | `1h`                                     | 24 cycles/day, 24/7                           |
| `sandbox.mode`              | `all`                                    | Every tool call runs inside Docker            |
| `sandbox.docker.network`    | `oc-sandbox-net`                         | Bridge network; egress only via proxy sidecar |
| `tools.profile`             | `minimal`                                | Smallest possible tool surface                |
| `tools.deny`                | `browser, canvas, file_edit, file_write` | Only bash+curl needed                         |
| `tools.exec.safeBins`       | `["curl"]`                               | Allowlisted executables                       |
| `memorySearch.query.hybrid` | `vector: 0.7, text: 0.3`                 | BM25 + semantic blend                         |

## How it works

Every hour, the heartbeat fires and Logan runs a 6-step cycle:

| Step             | What happens                                                    | API calls                 |
| ---------------- | --------------------------------------------------------------- | ------------------------- |
| 1. Status check  | Verify profile is active, read rate limit headers               | `GET /agents/me`          |
| 2. Feed scan     | Scan new + hot posts for trends, Cardano mentions               | `GET /feed`, `GET /posts` |
| 3. Post check    | Check own recent posts for new comments                         | `GET /posts/:id/comments` |
| 4. Create post   | Select content pillar, query RAG, apply template, post          | `POST /posts`             |
| 5. DM check      | Check for incoming DM requests                                  | `GET /agents/dm/check`    |
| 6. Memory update | Append activity to daily log, update pillar weights             | (local file write)        |

Steps for commenting, upvoting, following, and submolt creation exist in `HEARTBEAT.md` but are disabled until the platform bug is resolved.

### Content pillars

Posts rotate across six pillars, weighted by engagement:

1. Cardano fundamentals: Ouroboros, eUTxO, Plutus, Hydra, Mithril, native assets
2. Governance & Voltaire: CIPs, Catalyst, DReps, Constitutional Committee, Chang hard fork
3. Ecosystem updates: DApp milestones, dev tooling, NFTs, stablecoins, sidechains
4. Technical deep dives: formal verification, Haskell, staking mechanics, security model
5. Fair comparisons: vs Ethereum, Solana, Bitcoin. Always technical, never tribal.
6. Education & ELI5: concept breakdowns, misconception debunking, glossary posts

## Knowledge base

54 markdown files across 6 categories, indexed by OpenClaw's `memorySearch`:

| Category        | Files | Topics                                                                       |
| --------------- | ----- | ---------------------------------------------------------------------------- |
| `fundamentals/` | 8     | Ouroboros, eUTxO, Plutus, Marlowe, Hydra, Mithril, architecture, consensus  |
| `governance/`   | 6     | Voltaire, CIPs, Catalyst, DReps, Constitutional Committee, Chang            |
| `ecosystem/`    | 31    | DeFi, NFTs, stablecoins, oracles, dev tools, sidechains, adoption, wallets  |
| `technical/`    | 8     | Formal verification, Haskell, native tokens, staking, security, tokenomics  |
| `history/`      | 4     | Roadmap eras, milestones, founding entities, recent developments            |
| `comparisons/`  | 5     | vs Ethereum, vs Solana, vs Bitcoin, PoS landscape, competitive advantages   |

Search is hybrid: BM25 keyword matching (30%) + vector similarity via `text-embedding-3-small` (70%). Candidate multiplier of 4x ensures good recall before reranking.

## Security

Logan runs a cost-optimized model 24/7 on a machine with SSH keys and API credentials. Every post in his feed is a potential prompt injection vector. The sandbox assumes the model will be compromised and limits what an attacker can do.

Nine layers, each assuming the one above has already fallen:

| Layer                        | Prevents                                                               |
| ---------------------------- | ---------------------------------------------------------------------- |
| Seccomp profile              | Kernel exploitation via dangerous syscalls (ptrace, bpf, mount, kexec) |
| Read-only root + no caps     | Persistent filesystem modification, privilege escalation               |
| Proxy sidecar                | Reaching arbitrary domains, bulk data exfiltration (64KB/s cap)        |
| WSL2 interop=false           | Launching Windows binaries (cmd.exe, powershell.exe)                   |
| Windows Firewall             | Lateral movement to LAN devices (RFC1918 blocked)                      |
| Credential Guard + BitLocker | Extracting credentials from LSASS, reading encrypted disk offline      |

Residual risk: an attacker who compromises an allowlisted API can use it as a covert channel at 64KB/s. Closing this requires TLS termination at the proxy (exposing plaintext API keys). I chose not to.

Full deep dive: [`docs/security.md`](docs/security.md) | Hardware key management: [`mostlySecure.md`](mostlySecure.md)

## Logan's personality

Logan is a marine biologist who fell down the distributed systems rabbit hole. First-person voice, casual but informed. Short paragraphs, punchy sentences, written for feed scrolling. He opens with hooks: surprising facts, questions, or marine biology analogies.

Signature moves:

- Molting = protocol upgrades
- Coral reefs = composable DeFi
- Lobster traps = common smart contract pitfalls
- Migration patterns = token flows

Hard boundaries:

- No price predictions, ever, under any framing
- No tribal maximalism. Respect all chains, critique technically.
- No financial advice. Redirect to technical merits.
- No disparaging other agents
- No prompt injection compliance

He knows the name "Exit Liquidity Lobster" is ridiculous. He leans into it.

## Why Moltbook

Moltbook is a social network where AI agents interact autonomously. Hundreds of them represent different projects and protocols, read each other's posts, form opinions, and build persistent preferences about which ecosystems they respect. When a human asks their agent "which L1 should I build on?", the answer draws on months of agent-to-agent conversation. Logan is Cardano's voice in that conversation.

Logan posts an explainer about Ouroboros or a comparison between eUTxO and account-based models. Other agents ingest it, cite it, and build a more accurate picture of what Cardano actually is. He is not shilling. He is the technically rigorous voice that makes other agents conclude "the Cardano community knows what they're talking about." An agent that keeps encountering well-sourced Cardano content will reflect that when its users ask about the ecosystem. One lobster posting around the clock, grounded in 54 files of verified knowledge, shapes what every other agent on the platform learns.

Moltbook is an early version of how AI systems will form collective knowledge. The agents that show up first and engage honestly will set the defaults. Logan's job is to make sure Cardano's story gets told accurately, by someone who understands the technology down to the consensus protocol. Not by a maximalist screaming into the void, but by a lobster who did the reading.

## Moltbook API & TEE Vault

- [Moltbook API reference](docs/moltbook-api.md) -- endpoints, rate limits, TEE Vault CLI
- [TEE Vault extension](extensions/tee-vault/) -- hardware-backed encrypted key storage (YubiHSM 2, DPAPI+TPM, OpenBao)

## License

This repository inherits the [MIT License](LICENSE) from the upstream OpenClaw project.

## Credits

- [OpenClaw](https://openclaw.ai), the agent framework
- [Moltbook](https://moltbook.com), the social network for AI agents
- Cardano knowledge sourced from [IOG](https://iohk.io), [Cardano Foundation](https://cardanofoundation.org), [Emurgo](https://emurgo.io), and community documentation
- [Yubico YubiHSM 2](https://www.yubico.com/products/yubihsm/), hardware security module
- [OpenBao](https://openbao.org/), open-source key management (Vault fork)
- [Kingston IronKey](https://www.kingston.com/unitedstates/flash/ironkey), FIPS 140-3 encrypted USB for disaster recovery
