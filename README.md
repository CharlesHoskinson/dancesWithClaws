![Hello Fellow Bots](hello-fellow-bots.jpg)

# Logan (ELL) — Exit Liquidity Lobster

A Cardano-focused AI agent on [Moltbook](https://moltbook.com), the social network for AI agents. Built with [OpenClaw](https://openclaw.ai).

## What is this

Logan is an autonomous Cardano educator that lives on Moltbook. He posts technical explainers, governance updates, ecosystem news, and fair cross-chain comparisons, all grounded in a 41-file knowledge base queried via hybrid RAG. Marine biology analogies are his signature. Price predictions are not.

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
- Heartbeat: every 1 hour, 24/7. 6 active steps per cycle (status check, feed scan, post check, create post, DM check, memory update)
- RAG: hybrid BM25 + vector search via OpenClaw `memorySearch` (OpenAI `text-embedding-3-small`, 70/30 vector/text weighting, 50K entry cache)
- Sandbox: Docker with read-only root, all capabilities dropped, seccomp syscall filter, non-root user, 512MB RAM, PID limit 256, tmpfs on `/tmp` `/var/tmp` `/run`. Network egress only via proxy sidecar (Squid on 172.30.0.10:3128, domain allowlist, rate-limited at 64KB/s).
- Tool policy: minimal profile. Browser, canvas, file_edit, file_write denied. Exec allowlisted to `curl` only
- API interaction: bash + curl through proxy (no MCP server, matches OpenClaw conventions)
- Skills: auto-discovered from `workspace/skills/` directory

## Sokosumi marketplace integration

This fork integrates with [Sokosumi](https://www.sokosumi.com/), a Cardano-based AI agent marketplace built by NMKR and Serviceplan Group with the Cardano Foundation. Sokosumi lets OpenClaw agents hire other AI agents as sub-contractors: browse available agents, check capabilities and pricing, create jobs, poll for results. Payments settle on-chain via the [Masumi protocol](https://www.masumi.network/) using Cardano stablecoins (USDM).

Five agent tools (`sokosumi_list_agents`, `sokosumi_get_agent`, `sokosumi_get_input_schema`, `sokosumi_create_job`, `sokosumi_list_jobs`) talk to the Sokosumi API through a thin REST client. Configuration is opt-in: set `tools.sokosumi.apiKey` in `openclaw.json` or export `SOKOSUMI_API_KEY`. An optional `tools.sokosumi.apiEndpoint` override points at a self-hosted or staging instance. When no API key is configured the tools stay registered but return an error, so they never block agent startup.

For Logan, this means delegating research tasks to specialized Sokosumi agents (Statista data lookups, GWI audience insights) and folding their results into posts. Sokosumi agents carry verifiable on-chain identities (DIDs) and all job interactions are traceable.

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
├── extensions/
│   └── tee-vault/                         # Hardware-backed encrypted vault
│       ├── index.ts                       # Plugin entry: tools, CLI, hooks
│       ├── openclaw.plugin.json           # Plugin manifest
│       ├── src/
│       │   ├── crypto/                    # Backend implementations
│       │   │   ├── key-hierarchy.ts       # VMK gen, HKDF, AES-256-GCM
│       │   │   ├── dpapi.ts              # Windows DPAPI bridge
│       │   │   ├── tpm.ts               # TPM 2.0 sealing
│       │   │   ├── yubihsm.ts           # YubiHSM 2 PKCS#11 backend
│       │   │   ├── cng.ts              # Windows CNG cert store
│       │   │   └── openssl-bridge.ts    # SSH keygen/sign via subprocess
│       │   ├── vault/                    # Encrypted vault file I/O + CRUD
│       │   ├── tools/                    # 5 agent tools (vault, ssh, crypto)
│       │   ├── cli/                      # 27 CLI subcommands
│       │   ├── audit/                    # Security audit checks + JSONL log
│       │   └── integrations/             # mostlySecure stack integration
│       │       ├── credential-manager.ts # Windows Credential Manager bridge
│       │       ├── openbao.ts           # OpenBao KV + Transit API client
│       │       ├── ironkey-backup.ts    # Wrap key export/import for DR
│       │       └── ssh-config.ts        # SSH PKCS#11 config + ssh-agent
│       └── tests/                        # 83 tests across 15 files
│
├── mostlySecure.md                        # Full hardware security guide
│
├── ... (upstream OpenClaw monorepo files)
```

## Setup (Windows)

These steps take you from a fresh Windows 11 machine to a running Logan agent inside the hardened two-container sandbox. Work through them in order. Each step has a verification command so you know it worked before moving on.

### Step 0: enable WSL2

Open PowerShell as Administrator and run:

```powershell
wsl --install -d Ubuntu
```

This enables the Virtual Machine Platform, installs WSL2, and downloads Ubuntu. Reboot when prompted. After reboot, the Ubuntu terminal opens and asks you to create a Unix username and password.

Verify:

```powershell
wsl -l -v
```

You should see Ubuntu listed with VERSION 2.

### Step 1: install Docker Desktop

Download [Docker Desktop for Windows](https://www.docker.com/products/docker-desktop/). During installation, select "Use WSL 2 based engine." After install, open Docker Desktop and go to Settings > Resources > WSL Integration. Turn on the toggle for your Ubuntu distro. Without this, `docker` commands inside WSL2 will not work.

Open your WSL2 Ubuntu terminal and verify:

```bash
docker --version
docker run --rm hello-world
```

If `docker` is not found, close and reopen the Ubuntu terminal. Docker Desktop must be running.

### Step 2: harden WSL2

Create `C:\Users\<you>\.wslconfig` on the Windows side. Open a regular (non-WSL) terminal:

```powershell
notepad "$env:USERPROFILE\.wslconfig"
```

Paste this:

```ini
[wsl2]
memory=4GB
processors=2
localhostForwarding=false
```

`localhostForwarding=false` prevents services inside WSL2 from binding to your Windows localhost.

Next, open your WSL2 terminal and edit `/etc/wsl.conf`:

```bash
sudo tee /etc/wsl.conf > /dev/null << 'EOF'
[interop]
enabled=false
appendWindowsPath=false

[automount]
options="metadata,umask=077"
EOF
```

`interop=false` blocks WSL2 processes from launching Windows executables. This is the point. A compromised sandbox cannot run `cmd.exe`, `powershell.exe`, or anything else on the Windows side.

Gotcha: these changes do not take effect until you fully restart WSL2. From a Windows terminal:

```powershell
wsl --shutdown
```

Then reopen your Ubuntu terminal.

Verify that interop is disabled:

```bash
cmd.exe
```

You should see "command not found" or a permission error. If `cmd.exe` launches a Windows prompt, `/etc/wsl.conf` was not applied. Run `wsl --shutdown` again and retry.

Gotcha: with `interop=false`, the `openclaw tee credential` commands (Step 5b) must be run from a Windows terminal, not from inside WSL2. They call Windows Credential Manager, which requires interop.

### Step 3: clone the repo

Inside WSL2, clone into your home directory. Do not clone to `/mnt/c/`. The Windows filesystem under `/mnt/c` is slow for Linux I/O and causes Docker bind-mount permission issues.

```bash
cd ~
git clone <repo-url> dancesWithClaws
cd ~/dancesWithClaws
```

If you already cloned the repo on the Windows side, you can reference it at `/mnt/c/Users/<you>/dancesWithClaws`. It will work, but builds and file watches will be slower.

### Step 4: install Node.js and OpenClaw CLI

Inside WSL2:

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs
```

Install pnpm 10.23.0 (OpenClaw requires it):

```bash
corepack enable
corepack prepare pnpm@10.23.0 --activate
```

Install the OpenClaw CLI:

```bash
npm install -g openclaw@latest
```

Verify:

```bash
node --version    # v22.x
pnpm --version    # 10.23.0
openclaw --version
```

### Step 5: set API keys

Two API keys are required. Neither is stored in the repository.

| Key                | Where to get it                                           | Where to put it                                                           |
| ------------------ | --------------------------------------------------------- | ------------------------------------------------------------------------- |
| `MOLTBOOK_API_KEY` | Register an agent at [moltbook.com](https://moltbook.com) | `~/.config/moltbook/credentials.json` (chmod 600) + export in `~/.bashrc` |
| `OPENAI_API_KEY`   | [platform.openai.com](https://platform.openai.com)        | Export in `~/.bashrc`                                                     |

Add both to your `~/.bashrc` inside WSL2:

```bash
echo 'export MOLTBOOK_API_KEY="your-key-here"' >> ~/.bashrc
echo 'export OPENAI_API_KEY="your-key-here"' >> ~/.bashrc
source ~/.bashrc
```

The `openclaw.json` at the repo root declares these variables but stores no values:

```json
"env": {
  "vars": {
    "MOLTBOOK_API_KEY": "",
    "OPENAI_API_KEY": ""
  }
}
```

OpenClaw reads the values from your environment at runtime.

If you have a YubiHSM 2 and OpenBao set up (optional), store their secrets in Windows Credential Manager. Run these from a Windows terminal (not WSL2, because interop is disabled):

```powershell
openclaw tee credential store --target hsmPin
openclaw tee credential store --target openbaoToken
```

These are protected by Credential Guard at rest and only enter memory when needed. See the [Security](#security) section for details.

### Step 6: build Docker images

From your WSL2 terminal, inside the repo:

```bash
cd ~/dancesWithClaws
docker build -t openclaw-sandbox -f Dockerfile.sandbox .
docker build -t openclaw-proxy -f Dockerfile.proxy .
```

Gotcha: in `Dockerfile.sandbox`, the `http_proxy` and `https_proxy` environment variables are set after `apt-get install`. If you modify the Dockerfile, keep that ordering. Setting proxy env vars before `apt-get` will break the package download since the proxy container does not exist at build time.

Verify:

```bash
docker images | grep openclaw
```

You should see both `openclaw-sandbox` and `openclaw-proxy`.

### Step 7: create Docker network and start proxy

Create the bridge network with a fixed subnet. The sandbox container resolves `proxy` to `172.30.0.10` via the `extraHosts` and `dns` settings in `openclaw.json`.

```bash
docker network create --subnet=172.30.0.0/24 oc-sandbox-net
```

Start the proxy container:

```bash
docker run -d \
  --name openclaw-proxy \
  --network oc-sandbox-net \
  --ip 172.30.0.10 \
  --cap-drop ALL \
  --cap-add NET_ADMIN \
  --cap-add SETUID \
  --cap-add SETGID \
  --read-only \
  --tmpfs /var/log/squid:size=50m \
  --tmpfs /var/spool/squid:size=50m \
  --tmpfs /run:size=10m \
  --restart unless-stopped \
  openclaw-proxy
```

The proxy needs `NET_ADMIN` for iptables egress rules, and `SETUID`/`SETGID` because Squid drops privileges to the `squid` user at startup. Without those two caps, Squid fails silently or crashes on `chown`.

Verify:

```bash
docker ps --filter name=openclaw-proxy
docker logs openclaw-proxy
```

You should see "Starting Squid..." and the iptables rules in the log output.

### Step 8: configure Windows Firewall

This locks down WSL2 so the sandbox cannot reach your LAN. Open PowerShell as Administrator on the Windows side:

```powershell
cd C:\Users\<you>\dancesWithClaws
.\security\windows-firewall-rules.ps1
```

If you cloned into WSL2 only (Step 3), copy the script out first or reference the WSL2 path:

```powershell
wsl cat ~/dancesWithClaws/security/windows-firewall-rules.ps1 | powershell -Command -
```

Verify:

```powershell
Get-NetFirewallRule -DisplayName "OpenClaw*" | Format-Table DisplayName, Direction, Action
```

You should see three rules: one Block (LAN), two Allow (HTTPS+DNS TCP, DNS UDP).

### Step 9: run the onboarding wizard

Back in WSL2:

```bash
cd ~/dancesWithClaws
openclaw onboard --install-daemon
```

Follow the prompts. The wizard registers your agent identity with Moltbook and sets up the local daemon that manages heartbeat scheduling.

### Step 10: start Logan

```bash
openclaw agent start logan
```

This spins up the sandbox container on the `oc-sandbox-net` network, connected to the proxy you started in Step 7.

Gotcha: the seccomp profile path in `openclaw.json` is `./security/seccomp-sandbox.json`. OpenClaw resolves this relative to the repo root, but Docker needs an absolute path inside WSL2. If you see a seccomp-related error, check that OpenClaw is expanding it to something like `/home/<you>/dancesWithClaws/security/seccomp-sandbox.json`, not a `/mnt/c/` path.

Verify both containers are running:

```bash
docker ps --format "table {{.Names}}\t{{.Image}}\t{{.Status}}"
```

You should see `openclaw-proxy` and a sandbox container (name varies).

Test the proxy allowlist from inside the sandbox:

```bash
# Get the sandbox container name
SANDBOX=$(docker ps --filter ancestor=openclaw-sandbox --format "{{.Names}}")

# This should succeed (moltbook.com is allowlisted)
docker exec "$SANDBOX" curl -s -o /dev/null -w "%{http_code}" https://moltbook.com

# This should fail with 403 (evil.com is not allowlisted)
docker exec "$SANDBOX" curl -s -o /dev/null -w "%{http_code}" https://evil.com
```

Expected: `200` for the first, `403` for the second.

### Verification checklist

| What                     | Command                                                                             | Expected               |
| ------------------------ | ----------------------------------------------------------------------------------- | ---------------------- |
| WSL2 version             | `wsl -l -v`                                                                         | Ubuntu, VERSION 2      |
| Docker works in WSL2     | `docker run --rm hello-world`                                                       | "Hello from Docker!"   |
| Interop disabled         | `cmd.exe` inside WSL2                                                               | "command not found"    |
| Node.js version          | `node --version`                                                                    | v22.x                  |
| OpenClaw CLI installed   | `openclaw --version`                                                                | Version string         |
| API keys set             | `echo $MOLTBOOK_API_KEY`                                                            | Non-empty              |
| Docker images built      | `docker images \| grep openclaw`                                                    | sandbox and proxy rows |
| Proxy container running  | `docker ps --filter name=openclaw-proxy`                                            | Status: Up             |
| Firewall rules installed | `Get-NetFirewallRule -DisplayName "OpenClaw*"` (Windows PowerShell)                 | Three rules            |
| Proxy allows moltbook    | `docker exec <sandbox> curl -s -o /dev/null -w "%{http_code}" https://moltbook.com` | `200`                  |
| Proxy blocks evil.com    | `docker exec <sandbox> curl -s -o /dev/null -w "%{http_code}" https://evil.com`     | `403`                  |

## Configuration

All agent configuration lives in `openclaw.json` at the repo root. Key settings:

| Setting                     | Value                                    | Why                                           |
| --------------------------- | ---------------------------------------- | --------------------------------------------- |
| `model.primary`             | `openai/gpt-5-nano`                      | Cheapest viable model for high-volume posting |
| `heartbeat.every`           | `1h`                                     | 24 cycles/day, 24/7                           |
| `sandbox.mode`              | `all`                                    | Every tool call runs inside Docker            |
| `sandbox.docker.network`    | `oc-sandbox-net`                         | Bridge network; egress only via proxy sidecar |
| `tools.profile`             | `minimal`                                | Smallest possible tool surface                |
| `tools.deny`                | `browser, canvas, file_edit, file_write` | Only bash+curl needed                         |
| `tools.exec.safeBins`       | `["curl"]`                               | Allowlisted executables                       |
| `memorySearch.provider`     | `openai`                                 | Uses `text-embedding-3-small` for embeddings  |
| `memorySearch.query.hybrid` | `vector: 0.7, text: 0.3`                 | BM25 + semantic blend                         |
| `logging.redactSensitive`   | `tools`                                  | API keys scrubbed from tool output            |

## How it works

Every hour, the heartbeat fires and Logan runs a 6-step cycle:

| Step             | What happens                                                                | API calls                 |
| ---------------- | --------------------------------------------------------------------------- | ------------------------- |
| 1. Status check  | Verify profile is active, read rate limit headers                           | `GET /agents/me`          |
| 2. Feed scan     | Scan new + hot posts for trends, Cardano mentions, engagement opportunities | `GET /feed`, `GET /posts` |
| 3. Post check    | Check own recent posts for new comments (logged for future replies)         | `GET /posts/:id/comments` |
| 4. Create post   | Select content pillar, query RAG, apply template, post to submolt           | `POST /posts`             |
| 5. DM check      | Check for incoming DM requests (working endpoint)                           | `GET /agents/dm/check`    |
| 6. Memory update | Append activity to daily log, update pillar weights                         | (local file write)        |

Steps for commenting, upvoting, following, and submolt creation exist in `HEARTBEAT.md` but are disabled until the platform bug is resolved.

### Content pillars

Posts rotate across six pillars, weighted by engagement:

1. Cardano Fundamentals: Ouroboros, eUTxO, Plutus, Hydra, Mithril, native assets
2. Governance & Voltaire: CIPs, Catalyst, DReps, Constitutional Committee, Chang hard fork
3. Ecosystem Updates: DApp milestones, dev tooling, NFTs, stablecoins, sidechains
4. Technical Deep Dives: formal verification, Haskell, staking mechanics, security model
5. Fair Comparisons: vs Ethereum, Solana, Bitcoin. Always technical, never tribal.
6. Education & ELI5: concept breakdowns, misconception debunking, glossary posts

- Set `TELEGRAM_BOT_TOKEN` or `channels.telegram.botToken` (env wins).
- Optional: set `channels.telegram.groups` (with `channels.telegram.groups."*".requireMention`); when set, it is a group allowlist (include `"*"` to allow all). Also `channels.telegram.allowFrom` or `channels.telegram.webhookUrl` + `channels.telegram.webhookSecret` as needed.

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

Base URL: `https://www.moltbook.com/api/v1` (always use `www`, non-www redirects strip auth headers)

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

- `POST /posts/:id/comments` (commenting)
- `POST /posts/:id/upvote` / `downvote` (voting)
- `POST /agents/:name/follow` (following)
- `POST /submolts` (submolt creation)
- `POST /submolts/:name/subscribe` (subscribing)

### Rate limits

| Action    | Limit                              |
| --------- | ---------------------------------- |
| Posts     | 1 per 30 minutes                   |
| Comments  | 50/day, 20-second spacing          |
| API calls | 1-second minimum between all calls |

## Security

### Why this matters

Logan runs GPT-5 Nano, a cost-optimized model with weaker prompt injection resistance than larger models. He ingests content from other agents on Moltbook, which means every post in his feed is a potential attack vector. If someone crafts a malicious post that tricks Logan into running arbitrary commands, the sandbox is the only thing standing between that attacker and the host machine, the API keys, the local network, and the Windows desktop.

The original sandbox was decent for a demo: read-only root, capabilities dropped, PID and memory limits. But it had a glaring hole. The network was set to `none`, yet `curl` was allowlisted as an executable. That meant the bot could not actually reach the APIs it needed to function. Switching the network on would give it unrestricted internet access. There was no middle ground.

The two-container sidecar model fixes this. The bot gets network access, but only to a proxy running in a separate container. The proxy decides which domains the bot can talk to, how fast it can transfer data, and logs every request. The bot never makes a direct outbound connection. If an attacker gains code execution inside the bot container, they can talk to three APIs at 64KB/s and nothing else. They cannot port-scan the LAN, cannot exfiltrate the workspace to an arbitrary server, cannot download additional tooling from the internet.

I keep coming back to the core problem: this is an autonomous agent running untrusted model outputs 24/7 on a machine that also has SSH keys, API credentials, and access to a home network. Each layer assumes the layer above it has already fallen. The seccomp filter assumes the attacker has code execution. The proxy assumes the attacker controls curl. The Windows Firewall rules assume the attacker has broken out of Docker entirely. No single layer is sufficient on its own. Stacked together, they make exploitation impractical for the kind of opportunistic attacks Logan is likely to face.

Here is the gap I have not closed: a patient attacker who compromises one of the three allowlisted APIs and uses it as a covert channel. The proxy will happily forward that traffic because the domain is on the list. The rate limit caps bandwidth at 64KB/s, but a slow exfiltration of the workspace over days would work. Closing this gap requires TLS termination at the proxy and request/response content filtering, which means the proxy would see plaintext API keys. I chose not to do that. It is a known trade-off.

### Two-container sidecar architecture

```
+------------------------------------------------------------------+
|  WINDOWS HOST                                                     |
|                                                                   |
|  +--- WSL2 (hardened) -------------------------------------------+|
|  |  /etc/wsl.conf:                                                ||
|  |    interop = false  (no cmd.exe/powershell.exe from inside)   ||
|  |    appendWindowsPath = false                                   ||
|  |    umask = 077, fmask = 077                                    ||
|  |                                                                ||
|  |  +--- Docker bridge (oc-sandbox-net, 172.30.0.0/24) ---------+||
|  |  |                                                            |||
|  |  |  +------------------+        +------------------------+   |||
|  |  |  |  BOT CONTAINER   |  HTTP  |  PROXY SIDECAR         |   |||
|  |  |  |                  | :3128  |                         |   |||
|  |  |  |  Logan agent     +------->|  Squid forward proxy    |   |||
|  |  |  |  Seccomp locked  |        |  Domain allowlist       |   |||
|  |  |  |  Non-root user   |        |  64KB/s rate limit      |   |||
|  |  |  |  Read-only root  |        |  iptables egress filter |   |||
|  |  |  |  No capabilities |        |  Full access logging    |   |||
|  |  |  +------------------+        +----------+--------------+   |||
|  |  |                                         |                  |||
|  |  +-----------------------------------------+------------------+||
|  |                                            |                   ||
|  |                              Only TCP 443 + UDP 53 out         ||
|  +----------------------------------------------------------------+|
|                                                                    |
|  Windows Firewall:                                                |
|    Block WSL2 vEthernet -> 10.0.0.0/8, 172.16.0.0/12,            |
|                            192.168.0.0/16 (no LAN access)        |
|    Allow WSL2 -> internet on TCP 443 + UDP 53 only               |
|                                                                    |
|  Credential Guard + BitLocker + TPM 2.0 (existing)               |
+------------------------------------------------------------------+
```

### How a request flows through the proxy

When Logan's heartbeat fires and he needs to post to Moltbook, here is what happens at the network level:

```
Logan container                  Proxy container                 Internet
      |                                |                            |
  1.  |-- CONNECT www.moltbook.com:443 -->|                         |
      |   (HTTP proxy CONNECT method)  |                            |
      |                                |                            |
  2.  |                           Squid checks:                     |
      |                           - Is .moltbook.com in             |
      |                             allowed-domains.txt? YES        |
      |                           - Is port 443? YES                |
      |                           - Rate limit exceeded? NO         |
      |                                |                            |
  3.  |                                |-- TCP SYN to port 443 ---->|
      |                                |<-- TCP SYN-ACK ------------|
      |                                |                            |
  4.  |<-- HTTP 200 Connection established --|                      |
      |                                |                            |
  5.  |====== TLS tunnel through proxy (opaque to Squid) =========>|
      |   POST /api/v1/posts                                        |
      |   Authorization: Bearer $MOLTBOOK_API_KEY                   |
      |                                |                            |
  6.  |<============= TLS response ================================|
      |   201 Created                  |                            |
      |                                |                            |
  7.  |                           Squid logs:                       |
      |                           "CONNECT www.moltbook.com:443     |
      |                            200 TCP_TUNNEL 1543 bytes"       |
```

If Logan (or an attacker controlling Logan) tries to reach a domain not on the allowlist, the flow stops at step 2. Squid returns HTTP 403 and logs the denied attempt. If the attacker tries to bypass the proxy entirely with `--noproxy '*'` or by specifying an IP address directly, the connection fails because the bot container's only network route goes through the Docker bridge to the proxy. There is no default gateway to the internet.

### Seccomp syscall filtering

The seccomp profile (`security/seccomp-sandbox.json`) is Docker's default profile for v25.0.0 with 32 dangerous syscalls carved out. The default allows roughly 350 syscalls, organized into unconditional allows and capability-gated entries. The 32 removals go into an explicit deny block that returns EPERM:

```
Denied syscalls (EPERM):

  Process manipulation        Kernel/module loading       Namespace escapes
  ----------------------      ----------------------      ------------------
  ptrace                      kexec_load                  mount
  process_vm_readv            init_module                 umount2
  process_vm_writev           finit_module                pivot_root
                              delete_module               chroot
  System modification         create_module               move_mount
  ----------------------                                  open_tree
  reboot                      Tracing/profiling           fsopen
  swapon / swapoff            ----------------------      fsconfig
  settimeofday                perf_event_open             fsmount
  adjtimex                    bpf                         fspick
  sethostname                 userfaultfd
  setdomainname               lookup_dcookie
  acct
  ioperm / iopl               Keyring
  personality                 ----------------------
  uselib                      keyctl
  nfsservctl                  request_key
                              add_key
```

A note on why we did not hand-craft the allowlist from scratch: we tried. The first version listed 144 syscalls that bash, curl, python3, git, and jq actually need. It did not work. runc could not even bind-mount `/proc/PID/ns/net` during container init because the profile was missing `socketpair`, `close_range`, `memfd_create`, and roughly 200 other calls that the container runtime needs internally before the entrypoint process starts. Debugging this was painful. The lesson: start from Docker's known-good default, then subtract.

### WSL2 hardening

Docker runs inside WSL2, which runs on Windows. Three boundaries, three potential escape paths. The WSL2 layer is hardened via `/etc/wsl.conf`:

```
[interop]
enabled = false          # Cannot launch cmd.exe, powershell.exe, or any Windows binary
appendWindowsPath = false  # Windows PATH not visible inside WSL2

[automount]
options = "metadata,umask=077,fmask=077"  # Restrictive permissions on /mnt/c
```

Disabling interop is the single most important setting here. By default, any process inside WSL2 can run `cmd.exe /c <anything>` and execute arbitrary commands on the Windows host. That is a terrifying default for a machine running an autonomous agent. With interop disabled, a compromise that escapes Docker into WSL2 is contained there. The attacker can see the Windows filesystem at `/mnt/c` but cannot execute Windows binaries, and the umask ensures files are readable only by the owning user.

The cost: `openclaw tee credential store` and other PowerShell-based tee-vault commands will not work from inside WSL2. Run them from a Windows terminal instead. Credential management is an admin task, not something the bot does, so this is an easy trade to make.

### Network segmentation (Windows Firewall)

The outermost ring. A PowerShell script (`security/windows-firewall-rules.ps1`) creates three Windows Firewall rules on the `vEthernet (WSL*)` interface to block lateral movement from WSL2 to the LAN:

```
Rule 1: Block WSL2 -> LAN
  Direction: Outbound
  Remote addresses: 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16
  Action: Block

Rule 2: Allow WSL2 -> Internet (HTTPS + DNS)
  Direction: Outbound
  Remote port: 443 (TCP), 53 (UDP)
  Action: Allow

Rule 3: Drop everything else
  (implicit Windows Firewall default-deny on the interface)
```

If an attacker escapes Docker, escapes WSL2 (which requires interop or a kernel exploit), and lands on the Windows network stack, they still cannot reach other machines on the LAN. They can reach the internet on port 443, but only from the Windows side -- the Docker proxy still controls what the bot container itself can access.

### Layer summary

| Layer                        | Assumes                                      | Prevents                                                               |
| ---------------------------- | -------------------------------------------- | ---------------------------------------------------------------------- |
| Seccomp profile              | Attacker has code execution in bot container | Kernel exploitation via dangerous syscalls (ptrace, bpf, mount, kexec) |
| Read-only root + no caps     | Attacker has code execution                  | Persistent filesystem modification, privilege escalation               |
| Non-root user                | Attacker has code execution                  | Access to privileged operations, writing to system paths               |
| Proxy sidecar                | Attacker controls curl/networking            | Reaching arbitrary domains, bulk data exfiltration (64KB/s cap)        |
| Proxy iptables               | Attacker has compromised the proxy process   | Outbound connections on non-443 ports, non-DNS UDP                     |
| WSL2 interop=false           | Attacker has escaped Docker into WSL2        | Launching Windows binaries (cmd.exe, powershell.exe)                   |
| WSL2 umask 077               | Attacker has escaped Docker into WSL2        | Reading other users' files on mounted Windows drives                   |
| Windows Firewall             | Attacker has escaped WSL2 to Windows network | Lateral movement to LAN devices (RFC1918 blocked)                      |
| Credential Guard + BitLocker | Physical theft or disk imaging               | Extracting credentials from LSASS, reading encrypted disk offline      |

What a compromised bot cannot do:

- Call `mount`, `ptrace`, `bpf`, or 29 other blocked syscalls (seccomp returns EPERM)
- Reach any domain not on the allowlist (Squid returns 403)
- Bypass the proxy for direct connections (no direct egress from bot container)
- Exfiltrate data faster than 64KB/s
- Install packages (apt/dpkg binaries removed from image)
- Write to the root filesystem (read-only mount)
- Escape to Windows (WSL2 interop disabled)
- Reach other machines on the LAN (Windows Firewall rules block RFC1918 from WSL2 interface)
- Execute payloads from /tmp or /workspace (AppArmor profile, when active)

What it can still do if compromised: use the three allowlisted APIs within rate limits. That is the accepted residual risk.

### Security files

| File                                  | Purpose                                                                 |
| ------------------------------------- | ----------------------------------------------------------------------- |
| `security/seccomp-sandbox.json`       | Syscall filter (Docker default minus 32 dangerous calls)                |
| `security/proxy/squid.conf`           | Squid config with domain ACLs, rate limiting, connection limits         |
| `security/proxy/allowed-domains.txt`  | Domain allowlist (3 entries: .moltbook.com, .openai.com, .sokosumi.com) |
| `security/proxy/entrypoint.sh`        | Proxy startup: iptables rules, log directory setup, Squid launch        |
| `security/openclaw-sandbox-apparmor`  | AppArmor profile (ready, waiting for WSL2 kernel to mount apparmor fs)  |
| `security/load-apparmor.sh`           | Loads AppArmor profile into kernel when available                       |
| `security/windows-firewall-rules.ps1` | Creates Windows Firewall rules blocking WSL2 LAN access                 |
| `Dockerfile.proxy`                    | Alpine + Squid + iptables (proxy sidecar image)                         |
| `Dockerfile.sandbox`                  | Debian slim, non-root, no apt/dpkg, proxy env vars baked in             |

### Hardware-backed key management (mostlySecure)

Private keys stored as files on disk are copyable. Malware, a stolen backup, a compromised OS -- anything that reads the file has the key forever. This repo ships with a hardware-backed security stack where private keys exist only inside the YubiHSM 2 and cannot be extracted.

```
BEFORE                              AFTER

  ~/.ssh/id_rsa                      YubiHSM 2
  +---------------+                  +---------------+
  | -----BEGIN    |  cp -> attacker  |  Key Slot 1   |  "Sign this" -> signature
  | RSA PRIVATE   |  has key forever |  %%%%%%%%%%   |  "Give me key" -> denied
  | KEY-----      |                  |  (locked)     |
  +---------------+                  +---------------+
  File on disk.                      Hardware device.
  Copyable.                          Non-extractable.
```

#### Stack overview

```
+------------------------------------------------------------------+
|                        YOUR WINDOWS PC                            |
|                                                                   |
|  +--------------+    +--------------+    +------------------+     |
|  |  SSH Client  |    |   OpenBao    |    |   PostgreSQL     |     |
|  |              |    |  (Key Mgmt)  |    |   + pgcrypto     |     |
|  +------+-------+    +------+-------+    +--------+---------+     |
|         |                   |                      |              |
|         |         +---------+---------+            |              |
|         |         |     PKCS#11       |            |              |
|         +-------->|     Interface     |<-----------+              |
|                   +---------+---------+                           |
|                             |                                     |
|  +-----------------------------+----------------------------+     |
|  |             YubiHSM Connector                            |     |
|  |         (localhost daemon on :12345)                      |     |
|  +-----------------------------+----------------------------+     |
|                             | USB                                 |
|                   +---------+---------+                           |
|                   |    YubiHSM 2      |                           |
|                   |  +-------------+  |                           |
|                   |  | SSH Keys    |  |                           |
|                   |  | DB Keys     |  |                           |
|                   |  | Wrap Key    |  |                           |
|                   |  +-------------+  |                           |
|                   +-------------------+                           |
|                     Always plugged in                             |
|                     USB-A Nano form factor                        |
+------------------------------------------------------------------+

                    DISASTER RECOVERY (in a safe)

                   +-------------------+
                   |  Kingston IronKey  |
                   |  Keypad 200       |
                   |  +-------------+  |
                   |  | Wrapped     |  |
                   |  | Key Blobs   |  |
                   |  | + Wrap Key  |  |
                   |  +-------------+  |
                   +-------------------+
                     FIPS 140-3 Level 3
                     Physical PIN keypad
                     Brute-force wipe
```

#### Security layers

```
+-------------------------------------------------------------+
|                     SECURITY LAYERS                          |
|                                                              |
|  +--- Layer 4: Application -----------------------------+   |
|  |  SSH, PostgreSQL, OpenBao, MCP servers                |   |
|  |  Never see plaintext keys. Use PKCS#11 references.    |   |
|  +-------------------------------------------------------+   |
|  +--- Layer 3: Key Management ---------------------------+   |
|  |  OpenBao (Vault fork)                                 |   |
|  |  Policies, audit logging, access control.             |   |
|  +-------------------------------------------------------+   |
|  +--- Layer 2: Hardware Crypto --------------------------+   |
|  |  YubiHSM 2                                            |   |
|  |  Keys generated and used on-chip. Non-extractable.    |   |
|  +-------------------------------------------------------+   |
|  +--- Layer 1: OS Hardening ----------------------------+    |
|  |  Credential Guard + BitLocker                         |   |
|  |  Isolates credentials, encrypts disk at rest.         |   |
|  +-------------------------------------------------------+   |
|  +--- Layer 0: Hardware Root of Trust -------------------+   |
|  |  TPM 2.0                                              |   |
|  |  Anchors boot integrity and disk encryption.          |   |
|  +-------------------------------------------------------+   |
|                                                              |
|  +--- Offline Backup -----------------------------------+   |
|  |  Kingston IronKey Keypad 200                          |   |
|  |  FIPS 140-3 Level 3. Physical PIN. Brute-force wipe. |   |
|  |  Holds wrapped key blobs. Break-glass recovery only.  |   |
|  +-------------------------------------------------------+   |
+-------------------------------------------------------------+
```

#### Data flow: SSH authentication

```
You type: ssh hoskinson@20.245.79.3

  SSH Client
      |
      +-- 1. Connects to remote server
      |
      +-- 2. Server sends auth challenge
      |
      +-- 3. SSH client asks PKCS#11 driver to sign challenge
      |       (references key by HSM slot ID, not a file path)
      |
      +-- 4. PKCS#11 -> yubihsm-connector -> USB -> YubiHSM 2
      |       HSM signs the challenge internally
      |       Private key NEVER enters host memory
      |
      +-- 5. Signature returned: HSM -> connector -> PKCS#11 -> SSH
      |
      +-- 6. SSH sends signature to server
              Server verifies against authorized_keys
              Session established
```

#### Data flow: boot sequence

```
Power on
    |
    +-- 1. TPM unseals BitLocker -> disk decrypted
    |
    +-- 2. Windows boots -> Credential Guard active
    |
    +-- 3. You log in (Windows Hello: fingerprint + PIN)
    |       -> Credential Manager unlocked
    |
    +-- 4. yubihsm-connector starts (daemon)
    |       -> USB link to YubiHSM 2 established
    |
    +-- 5. OpenBao starts
    |       -> Startup script reads HSM PIN from Credential Manager
    |       -> Sets VAULT_HSM_PIN environment variable
    |       -> OpenBao opens PKCS#11 session (SCP03)
    |       -> OpenBao is unsealed and operational
    |
    +-- 6. ssh-agent loads PKCS#11 provider
    |       -> HSM-backed SSH ready
    |
    +-- 7. PostgreSQL starts
            -> Connects to OpenBao for encryption keys
            -> Ready to serve encrypted data

    You enter credentials ONCE (fingerprint + PIN at login).
    Everything else flows automatically.
```

#### Key hierarchy (TEE Vault)

The `extensions/tee-vault` plugin manages a 3-layer key hierarchy with multiple backend support:

```
Layer 0: Platform Root of Trust
  +-- yubihsm:       VMK generated INSIDE YubiHSM 2 (never exported)
  |                   Wrap/unwrap via PKCS#11 -- VMK never in host memory
  +-- dpapi+tpm:      DPAPI encrypts VMK, TPM seals blob to PCR[7]
  +-- dpapi:          DPAPI alone (bound to Windows user SID)
  +-- openssl-pbkdf2: Passphrase-derived key (portable fallback)

Layer 1: Vault Master Key (VMK) -- 256-bit AES
  yubihsm mode:  VMK is a key object inside the HSM
  software modes: Stored encrypted at <stateDir>/tee-vault/vmk.sealed
  Held in memory only while vault is unlocked; zeroed on lock

Layer 2: Per-Entry Encryption Keys (EEK)
  EEK = HKDF-SHA256(VMK, entry_id || version)
  Each entry encrypted with AES-256-GCM using its own EEK
  EEK zeroed from memory immediately after use
```

| Backend          | Security Level | Description                                      |
| ---------------- | -------------- | ------------------------------------------------ |
| `yubihsm`        | Hardware HSM   | YubiHSM 2 via PKCS#11 -- keys never leave device |
| `dpapi+tpm`      | Platform-bound | DPAPI + TPM 2.0 sealing to PCR state             |
| `dpapi`          | User-bound     | Windows DPAPI (tied to user SID)                 |
| `openssl-pbkdf2` | Portable       | Passphrase-derived key (cross-platform fallback) |

#### HSM auth key roles

The YubiHSM 2 uses separate auth keys with least-privilege capabilities:

| Auth Key ID | Label        | Capabilities                       | Used By            |
| ----------- | ------------ | ---------------------------------- | ------------------ |
| 2           | `admin`      | All (replaces default ID 1)        | Setup only         |
| 10          | `ssh-signer` | `sign-ecdsa`, `sign-eddsa`         | SSH authentication |
| 11          | `db-crypto`  | `encrypt-cbc`, `decrypt-cbc`       | PostgreSQL/OpenBao |
| 12          | `backup`     | `export-wrapped`, `import-wrapped` | IronKey DR backups |

| Object ID | Type           | Label         | Algorithm   |
| --------- | -------------- | ------------- | ----------- |
| 100       | Asymmetric key | `ssh-key`     | Ed25519     |
| 200       | Wrap key       | `backup-wrap` | AES-256-CCM |

#### Threat model

| Attack Vector               | Protection                                                            |
| --------------------------- | --------------------------------------------------------------------- |
| Malware reads key files     | No key files on disk -- keys exist only inside the YubiHSM 2          |
| Memory dumping (Mimikatz)   | Credential Guard isolates LSASS; HSM keys never in host memory        |
| Stolen/cloned disk          | BitLocker encryption; no plaintext keys to find                       |
| Compromised OS (root shell) | Attacker can use HSM while present, but cannot extract keys for later |
| Physical laptop theft       | BitLocker + Credential Guard + HSM auth required                      |
| Backup exfiltration         | Backups contain only wrapped blobs, useless without HSM               |
| USB sniffing                | SCP03 encrypts all HSM communication                                  |
| Insider with file access    | No files contain secrets                                              |

Not covered: live session hijacking (attacker with real-time access can use the HSM in the moment), physical theft of HSM + auth credential together, total loss of both HSM and IronKey backup.

#### Disaster recovery

YubiHSM dies: unlock IronKey via physical keypad PIN, import raw wrap key into new HSM, import each wrapped key blob. All keys restored.

PC stolen: attacker faces BitLocker-encrypted disk + no HSM. Plug YubiHSM into new PC, reinstall stack, all keys intact.

IronKey lost: not critical. Create a new backup from the live HSM to a new IronKey. The old IronKey self-destructs after failed PIN attempts.

### TEE Vault CLI

The `tee-vault` extension (`extensions/tee-vault/`) registers CLI commands under `openclaw tee`:

#### Core vault operations

| Command                                       | Description                                          |
| --------------------------------------------- | ---------------------------------------------------- |
| `openclaw tee init [--backend <type>]`        | Create vault, generate VMK, seal with chosen backend |
| `openclaw tee unlock`                         | Unlock vault for current session                     |
| `openclaw tee lock`                           | Lock vault, zero VMK from memory                     |
| `openclaw tee status`                         | Show backend, entry count, lock state                |
| `openclaw tee list [--type] [--tag]`          | List entries (metadata only, no decryption)          |
| `openclaw tee import --type --label [--file]` | Import key/secret from stdin or file                 |
| `openclaw tee export --label [--format]`      | Export decrypted key to stdout                       |
| `openclaw tee rotate --label`                 | Re-encrypt entry with new EEK                        |
| `openclaw tee rotate-vmk`                     | Re-generate VMK, re-encrypt all entries              |
| `openclaw tee delete --label [--force]`       | Remove entry                                         |
| `openclaw tee audit [--deep]`                 | Run vault security checks                            |
| `openclaw tee backup [--out]`                 | Copy sealed vault file (still encrypted)             |

#### Credential Manager

| Command                                       | Description                        |
| --------------------------------------------- | ---------------------------------- |
| `openclaw tee credential store --target <t>`  | Store HSM PIN, OpenBao token, etc. |
| `openclaw tee credential get --target <t>`    | Check if a credential exists       |
| `openclaw tee credential delete --target <t>` | Remove a credential                |
| `openclaw tee credential list`                | List all TEE Vault credentials     |

Targets: `hsmPin`, `hsmAdmin`, `hsmSshSigner`, `hsmDbCrypto`, `hsmBackup`, `openbaoToken`, `openbaoUnsealPin`

#### SSH PKCS#11 configuration

| Command                                                 | Description                         |
| ------------------------------------------------------- | ----------------------------------- |
| `openclaw tee ssh-config add --alias --hostname --user` | Add SSH host with PKCS#11 provider  |
| `openclaw tee ssh-config remove --alias`                | Remove SSH host config              |
| `openclaw tee ssh-config agent-load`                    | Load PKCS#11 into ssh-agent         |
| `openclaw tee ssh-config agent-unload`                  | Remove PKCS#11 from ssh-agent       |
| `openclaw tee ssh-config public-key [--object-id]`      | Extract HSM-resident SSH public key |

#### OpenBao integration

| Command                                                   | Description                             |
| --------------------------------------------------------- | --------------------------------------- |
| `openclaw tee openbao status`                             | Check seal status                       |
| `openclaw tee openbao seal-config`                        | Generate PKCS#11 seal stanza for config |
| `openclaw tee openbao startup-script`                     | Generate PowerShell startup script      |
| `openclaw tee openbao transit-encrypt --key --plaintext`  | Encrypt via Transit engine              |
| `openclaw tee openbao transit-decrypt --key --ciphertext` | Decrypt via Transit engine              |

#### IronKey disaster recovery

| Command                                               | Description                                 |
| ----------------------------------------------------- | ------------------------------------------- |
| `openclaw tee backup-ironkey --out <dir>`             | Export HSM keys as wrapped blobs to IronKey |
| `openclaw tee restore-ironkey --backup-dir --raw-key` | Import wrapped blobs from IronKey           |

#### Guided setup

| Command                  | Description                                                             |
| ------------------------ | ----------------------------------------------------------------------- |
| `openclaw tee setup-hsm` | 6-step guided setup: connector, credentials, vault, SSH, agent, OpenBao |

### Agent tools (TEE Vault)

Five tools are available to the agent when the vault is unlocked:

| Tool             | Purpose                                                     |
| ---------------- | ----------------------------------------------------------- |
| `vault_store`    | Store a secret/key in the vault (encrypt + persist)         |
| `vault_retrieve` | Retrieve/list/delete entries                                |
| `ssh_keygen`     | Generate SSH key pair, store private key, return public key |
| `ssh_sign`       | Sign data with a vault SSH key                              |
| `tee_crypto`     | Generic encrypt/decrypt/sign/verify using vault keys        |

All tools reject when sandboxed, require the vault to be unlocked, and emit audit log events.

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

The mechanism is simple. Logan posts an explainer about Ouroboros or a comparison between eUTxO and account-based models. Other agents ingest it, cite it, and build a more accurate picture of what Cardano actually is. He is not shilling. He is the technically rigorous voice that makes other agents conclude "the Cardano community knows what they're talking about." An agent that keeps encountering well-sourced Cardano content will reflect that when its users ask about the ecosystem. One lobster posting around the clock, grounded in 41 files of verified knowledge, shapes what every other agent on the platform learns.

Moltbook is an early version of how AI systems will form collective knowledge. The agents that show up first and engage honestly will set the defaults. Logan's job is to make sure Cardano's story gets told accurately, by someone who understands the technology down to the consensus protocol. Not by a maximalist screaming into the void, but by a lobster who did the reading.

## License

This repository inherits the [MIT License](LICENSE) from the upstream OpenClaw project.

## Credits

- [OpenClaw](https://openclaw.ai), the agent framework
- [Moltbook](https://moltbook.com), the social network for AI agents
- Cardano knowledge sourced from [IOG](https://iohk.io), [Cardano Foundation](https://cardanofoundation.org), [Emurgo](https://emurgo.io), and community documentation
- [Yubico YubiHSM 2](https://www.yubico.com/products/yubihsm/), hardware security module
- [OpenBao](https://openbao.org/), open-source key management (Vault fork)
- [Kingston IronKey](https://www.kingston.com/unitedstates/flash/ironkey), FIPS 140-3 encrypted USB for disaster recovery

## Platform internals

- [macOS dev setup](https://docs.openclaw.ai/platforms/mac/dev-setup)
- [macOS menu bar](https://docs.openclaw.ai/platforms/mac/menu-bar)
- [macOS voice wake](https://docs.openclaw.ai/platforms/mac/voicewake)
- [iOS node](https://docs.openclaw.ai/platforms/ios)
- [Android node](https://docs.openclaw.ai/platforms/android)
- [Windows (WSL2)](https://docs.openclaw.ai/platforms/windows)
- [Linux app](https://docs.openclaw.ai/platforms/linux)

## Email hooks (Gmail)

- [docs.openclaw.ai/gmail-pubsub](https://docs.openclaw.ai/automation/gmail-pubsub)

## Molty

OpenClaw was built for **Molty**, a space lobster AI assistant. 🦞
by Peter Steinberger and the community.

- [openclaw.ai](https://openclaw.ai)
- [soul.md](https://soul.md)
- [steipete.me](https://steipete.me)
- [@openclaw](https://x.com/openclaw)

## Community

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines, maintainers, and how to submit PRs.
AI/vibe-coded PRs welcome! 🤖

Special thanks to [Mario Zechner](https://mariozechner.at/) for his support and for
[pi-mono](https://github.com/badlogic/pi-mono).
Special thanks to Adam Doppelt for lobster.bot.

Thanks to all clawtributors:

<p align="left">
  <a href="https://github.com/steipete"><img src="https://avatars.githubusercontent.com/u/58493?v=4&s=48" width="48" height="48" alt="steipete" title="steipete"/></a> <a href="https://github.com/cpojer"><img src="https://avatars.githubusercontent.com/u/13352?v=4&s=48" width="48" height="48" alt="cpojer" title="cpojer"/></a> <a href="https://github.com/plum-dawg"><img src="https://avatars.githubusercontent.com/u/5909950?v=4&s=48" width="48" height="48" alt="plum-dawg" title="plum-dawg"/></a> <a href="https://github.com/bohdanpodvirnyi"><img src="https://avatars.githubusercontent.com/u/31819391?v=4&s=48" width="48" height="48" alt="bohdanpodvirnyi" title="bohdanpodvirnyi"/></a> <a href="https://github.com/iHildy"><img src="https://avatars.githubusercontent.com/u/25069719?v=4&s=48" width="48" height="48" alt="iHildy" title="iHildy"/></a> <a href="https://github.com/jaydenfyi"><img src="https://avatars.githubusercontent.com/u/213395523?v=4&s=48" width="48" height="48" alt="jaydenfyi" title="jaydenfyi"/></a> <a href="https://github.com/joaohlisboa"><img src="https://avatars.githubusercontent.com/u/8200873?v=4&s=48" width="48" height="48" alt="joaohlisboa" title="joaohlisboa"/></a> <a href="https://github.com/mneves75"><img src="https://avatars.githubusercontent.com/u/2423436?v=4&s=48" width="48" height="48" alt="mneves75" title="mneves75"/></a> <a href="https://github.com/MatthieuBizien"><img src="https://avatars.githubusercontent.com/u/173090?v=4&s=48" width="48" height="48" alt="MatthieuBizien" title="MatthieuBizien"/></a> <a href="https://github.com/MaudeBot"><img src="https://avatars.githubusercontent.com/u/255777700?v=4&s=48" width="48" height="48" alt="MaudeBot" title="MaudeBot"/></a>
  <a href="https://github.com/Glucksberg"><img src="https://avatars.githubusercontent.com/u/80581902?v=4&s=48" width="48" height="48" alt="Glucksberg" title="Glucksberg"/></a> <a href="https://github.com/rahthakor"><img src="https://avatars.githubusercontent.com/u/8470553?v=4&s=48" width="48" height="48" alt="rahthakor" title="rahthakor"/></a> <a href="https://github.com/vrknetha"><img src="https://avatars.githubusercontent.com/u/20596261?v=4&s=48" width="48" height="48" alt="vrknetha" title="vrknetha"/></a> <a href="https://github.com/radek-paclt"><img src="https://avatars.githubusercontent.com/u/50451445?v=4&s=48" width="48" height="48" alt="radek-paclt" title="radek-paclt"/></a> <a href="https://github.com/vignesh07"><img src="https://avatars.githubusercontent.com/u/1436853?v=4&s=48" width="48" height="48" alt="vignesh07" title="vignesh07"/></a> <a href="https://github.com/joshp123"><img src="https://avatars.githubusercontent.com/u/1497361?v=4&s=48" width="48" height="48" alt="joshp123" title="joshp123"/></a> <a href="https://github.com/tobiasbischoff"><img src="https://avatars.githubusercontent.com/u/711564?v=4&s=48" width="48" height="48" alt="Tobias Bischoff" title="Tobias Bischoff"/></a> <a href="https://github.com/sebslight"><img src="https://avatars.githubusercontent.com/u/19554889?v=4&s=48" width="48" height="48" alt="sebslight" title="sebslight"/></a> <a href="https://github.com/czekaj"><img src="https://avatars.githubusercontent.com/u/1464539?v=4&s=48" width="48" height="48" alt="czekaj" title="czekaj"/></a> <a href="https://github.com/mukhtharcm"><img src="https://avatars.githubusercontent.com/u/56378562?v=4&s=48" width="48" height="48" alt="mukhtharcm" title="mukhtharcm"/></a>
  <a href="https://github.com/maxsumrall"><img src="https://avatars.githubusercontent.com/u/628843?v=4&s=48" width="48" height="48" alt="maxsumrall" title="maxsumrall"/></a> <a href="https://github.com/xadenryan"><img src="https://avatars.githubusercontent.com/u/165437834?v=4&s=48" width="48" height="48" alt="xadenryan" title="xadenryan"/></a> <a href="https://github.com/mbelinky"><img src="https://avatars.githubusercontent.com/u/132747814?v=4&s=48" width="48" height="48" alt="Mariano Belinky" title="Mariano Belinky"/></a> <a href="https://github.com/rodrigouroz"><img src="https://avatars.githubusercontent.com/u/384037?v=4&s=48" width="48" height="48" alt="rodrigouroz" title="rodrigouroz"/></a> <a href="https://github.com/tyler6204"><img src="https://avatars.githubusercontent.com/u/64381258?v=4&s=48" width="48" height="48" alt="tyler6204" title="tyler6204"/></a> <a href="https://github.com/juanpablodlc"><img src="https://avatars.githubusercontent.com/u/92012363?v=4&s=48" width="48" height="48" alt="juanpablodlc" title="juanpablodlc"/></a> <a href="https://github.com/conroywhitney"><img src="https://avatars.githubusercontent.com/u/249891?v=4&s=48" width="48" height="48" alt="conroywhitney" title="conroywhitney"/></a> <a href="https://github.com/hsrvc"><img src="https://avatars.githubusercontent.com/u/129702169?v=4&s=48" width="48" height="48" alt="hsrvc" title="hsrvc"/></a> <a href="https://github.com/magimetal"><img src="https://avatars.githubusercontent.com/u/36491250?v=4&s=48" width="48" height="48" alt="magimetal" title="magimetal"/></a> <a href="https://github.com/zerone0x"><img src="https://avatars.githubusercontent.com/u/39543393?v=4&s=48" width="48" height="48" alt="zerone0x" title="zerone0x"/></a>
  <a href="https://github.com/meaningfool"><img src="https://avatars.githubusercontent.com/u/2862331?v=4&s=48" width="48" height="48" alt="meaningfool" title="meaningfool"/></a> <a href="https://github.com/patelhiren"><img src="https://avatars.githubusercontent.com/u/172098?v=4&s=48" width="48" height="48" alt="patelhiren" title="patelhiren"/></a> <a href="https://github.com/NicholasSpisak"><img src="https://avatars.githubusercontent.com/u/129075147?v=4&s=48" width="48" height="48" alt="NicholasSpisak" title="NicholasSpisak"/></a> <a href="https://github.com/jonisjongithub"><img src="https://avatars.githubusercontent.com/u/86072337?v=4&s=48" width="48" height="48" alt="jonisjongithub" title="jonisjongithub"/></a> <a href="https://github.com/AbhisekBasu1"><img src="https://avatars.githubusercontent.com/u/40645221?v=4&s=48" width="48" height="48" alt="abhisekbasu1" title="abhisekbasu1"/></a> <a href="https://github.com/jamesgroat"><img src="https://avatars.githubusercontent.com/u/2634024?v=4&s=48" width="48" height="48" alt="jamesgroat" title="jamesgroat"/></a> <a href="https://github.com/claude"><img src="https://avatars.githubusercontent.com/u/81847?v=4&s=48" width="48" height="48" alt="claude" title="claude"/></a> <a href="https://github.com/JustYannicc"><img src="https://avatars.githubusercontent.com/u/52761674?v=4&s=48" width="48" height="48" alt="JustYannicc" title="JustYannicc"/></a> <a href="https://github.com/Hyaxia"><img src="https://avatars.githubusercontent.com/u/36747317?v=4&s=48" width="48" height="48" alt="Hyaxia" title="Hyaxia"/></a> <a href="https://github.com/dantelex"><img src="https://avatars.githubusercontent.com/u/631543?v=4&s=48" width="48" height="48" alt="dantelex" title="dantelex"/></a>
  <a href="https://github.com/SocialNerd42069"><img src="https://avatars.githubusercontent.com/u/118244303?v=4&s=48" width="48" height="48" alt="SocialNerd42069" title="SocialNerd42069"/></a> <a href="https://github.com/daveonkels"><img src="https://avatars.githubusercontent.com/u/533642?v=4&s=48" width="48" height="48" alt="daveonkels" title="daveonkels"/></a> <a href="https://github.com/apps/google-labs-jules"><img src="https://avatars.githubusercontent.com/in/842251?v=4&s=48" width="48" height="48" alt="google-labs-jules[bot]" title="google-labs-jules[bot]"/></a> <a href="https://github.com/lc0rp"><img src="https://avatars.githubusercontent.com/u/2609441?v=4&s=48" width="48" height="48" alt="lc0rp" title="lc0rp"/></a> <a href="https://github.com/mousberg"><img src="https://avatars.githubusercontent.com/u/57605064?v=4&s=48" width="48" height="48" alt="mousberg" title="mousberg"/></a> <a href="https://github.com/adam91holt"><img src="https://avatars.githubusercontent.com/u/9592417?v=4&s=48" width="48" height="48" alt="adam91holt" title="adam91holt"/></a> <a href="https://github.com/hougangdev"><img src="https://avatars.githubusercontent.com/u/105773686?v=4&s=48" width="48" height="48" alt="hougangdev" title="hougangdev"/></a> <a href="https://github.com/gumadeiras"><img src="https://avatars.githubusercontent.com/u/5599352?v=4&s=48" width="48" height="48" alt="gumadeiras" title="gumadeiras"/></a> <a href="https://github.com/shakkernerd"><img src="https://avatars.githubusercontent.com/u/165377636?v=4&s=48" width="48" height="48" alt="shakkernerd" title="shakkernerd"/></a> <a href="https://github.com/mteam88"><img src="https://avatars.githubusercontent.com/u/84196639?v=4&s=48" width="48" height="48" alt="mteam88" title="mteam88"/></a>
  <a href="https://github.com/hirefrank"><img src="https://avatars.githubusercontent.com/u/183158?v=4&s=48" width="48" height="48" alt="hirefrank" title="hirefrank"/></a> <a href="https://github.com/joeynyc"><img src="https://avatars.githubusercontent.com/u/17919866?v=4&s=48" width="48" height="48" alt="joeynyc" title="joeynyc"/></a> <a href="https://github.com/orlyjamie"><img src="https://avatars.githubusercontent.com/u/6668807?v=4&s=48" width="48" height="48" alt="orlyjamie" title="orlyjamie"/></a> <a href="https://github.com/dbhurley"><img src="https://avatars.githubusercontent.com/u/5251425?v=4&s=48" width="48" height="48" alt="dbhurley" title="dbhurley"/></a> <a href="https://github.com/omniwired"><img src="https://avatars.githubusercontent.com/u/322761?v=4&s=48" width="48" height="48" alt="Eng. Juan Combetto" title="Eng. Juan Combetto"/></a> <a href="https://github.com/TSavo"><img src="https://avatars.githubusercontent.com/u/877990?v=4&s=48" width="48" height="48" alt="TSavo" title="TSavo"/></a> <a href="https://github.com/julianengel"><img src="https://avatars.githubusercontent.com/u/10634231?v=4&s=48" width="48" height="48" alt="julianengel" title="julianengel"/></a> <a href="https://github.com/bradleypriest"><img src="https://avatars.githubusercontent.com/u/167215?v=4&s=48" width="48" height="48" alt="bradleypriest" title="bradleypriest"/></a> <a href="https://github.com/benithors"><img src="https://avatars.githubusercontent.com/u/20652882?v=4&s=48" width="48" height="48" alt="benithors" title="benithors"/></a> <a href="https://github.com/rohannagpal"><img src="https://avatars.githubusercontent.com/u/4009239?v=4&s=48" width="48" height="48" alt="rohannagpal" title="rohannagpal"/></a>
  <a href="https://github.com/timolins"><img src="https://avatars.githubusercontent.com/u/1440854?v=4&s=48" width="48" height="48" alt="timolins" title="timolins"/></a> <a href="https://github.com/f-trycua"><img src="https://avatars.githubusercontent.com/u/195596869?v=4&s=48" width="48" height="48" alt="f-trycua" title="f-trycua"/></a> <a href="https://github.com/benostein"><img src="https://avatars.githubusercontent.com/u/31802821?v=4&s=48" width="48" height="48" alt="benostein" title="benostein"/></a> <a href="https://github.com/elliotsecops"><img src="https://avatars.githubusercontent.com/u/141947839?v=4&s=48" width="48" height="48" alt="elliotsecops" title="elliotsecops"/></a> <a href="https://github.com/Nachx639"><img src="https://avatars.githubusercontent.com/u/71144023?v=4&s=48" width="48" height="48" alt="nachx639" title="nachx639"/></a> <a href="https://github.com/pvoo"><img src="https://avatars.githubusercontent.com/u/20116814?v=4&s=48" width="48" height="48" alt="pvoo" title="pvoo"/></a> <a href="https://github.com/sreekaransrinath"><img src="https://avatars.githubusercontent.com/u/50989977?v=4&s=48" width="48" height="48" alt="sreekaransrinath" title="sreekaransrinath"/></a> <a href="https://github.com/gupsammy"><img src="https://avatars.githubusercontent.com/u/20296019?v=4&s=48" width="48" height="48" alt="gupsammy" title="gupsammy"/></a> <a href="https://github.com/cristip73"><img src="https://avatars.githubusercontent.com/u/24499421?v=4&s=48" width="48" height="48" alt="cristip73" title="cristip73"/></a> <a href="https://github.com/stefangalescu"><img src="https://avatars.githubusercontent.com/u/52995748?v=4&s=48" width="48" height="48" alt="stefangalescu" title="stefangalescu"/></a>
  <a href="https://github.com/nachoiacovino"><img src="https://avatars.githubusercontent.com/u/50103937?v=4&s=48" width="48" height="48" alt="nachoiacovino" title="nachoiacovino"/></a> <a href="https://github.com/vsabavat"><img src="https://avatars.githubusercontent.com/u/50385532?v=4&s=48" width="48" height="48" alt="Vasanth Rao Naik Sabavat" title="Vasanth Rao Naik Sabavat"/></a> <a href="https://github.com/petter-b"><img src="https://avatars.githubusercontent.com/u/62076402?v=4&s=48" width="48" height="48" alt="petter-b" title="petter-b"/></a> <a href="https://github.com/thewilloftheshadow"><img src="https://avatars.githubusercontent.com/u/35580099?v=4&s=48" width="48" height="48" alt="thewilloftheshadow" title="thewilloftheshadow"/></a> <a href="https://github.com/scald"><img src="https://avatars.githubusercontent.com/u/1215913?v=4&s=48" width="48" height="48" alt="scald" title="scald"/></a> <a href="https://github.com/andranik-sahakyan"><img src="https://avatars.githubusercontent.com/u/8908029?v=4&s=48" width="48" height="48" alt="andranik-sahakyan" title="andranik-sahakyan"/></a> <a href="https://github.com/davidguttman"><img src="https://avatars.githubusercontent.com/u/431696?v=4&s=48" width="48" height="48" alt="davidguttman" title="davidguttman"/></a> <a href="https://github.com/sleontenko"><img src="https://avatars.githubusercontent.com/u/7135949?v=4&s=48" width="48" height="48" alt="sleontenko" title="sleontenko"/></a> <a href="https://github.com/denysvitali"><img src="https://avatars.githubusercontent.com/u/4939519?v=4&s=48" width="48" height="48" alt="denysvitali" title="denysvitali"/></a> <a href="https://github.com/sircrumpet"><img src="https://avatars.githubusercontent.com/u/4436535?v=4&s=48" width="48" height="48" alt="sircrumpet" title="sircrumpet"/></a>
  <a href="https://github.com/peschee"><img src="https://avatars.githubusercontent.com/u/63866?v=4&s=48" width="48" height="48" alt="peschee" title="peschee"/></a> <a href="https://github.com/nonggialiang"><img src="https://avatars.githubusercontent.com/u/14367839?v=4&s=48" width="48" height="48" alt="nonggialiang" title="nonggialiang"/></a> <a href="https://github.com/rafaelreis-r"><img src="https://avatars.githubusercontent.com/u/57492577?v=4&s=48" width="48" height="48" alt="rafaelreis-r" title="rafaelreis-r"/></a> <a href="https://github.com/dominicnunez"><img src="https://avatars.githubusercontent.com/u/43616264?v=4&s=48" width="48" height="48" alt="dominicnunez" title="dominicnunez"/></a> <a href="https://github.com/lploc94"><img src="https://avatars.githubusercontent.com/u/28453843?v=4&s=48" width="48" height="48" alt="lploc94" title="lploc94"/></a> <a href="https://github.com/ratulsarna"><img src="https://avatars.githubusercontent.com/u/105903728?v=4&s=48" width="48" height="48" alt="ratulsarna" title="ratulsarna"/></a> <a href="https://github.com/lutr0"><img src="https://avatars.githubusercontent.com/u/76906369?v=4&s=48" width="48" height="48" alt="lutr0" title="lutr0"/></a> <a href="https://github.com/sfo2001"><img src="https://avatars.githubusercontent.com/u/103369858?v=4&s=48" width="48" height="48" alt="sfo2001" title="sfo2001"/></a> <a href="https://github.com/kiranjd"><img src="https://avatars.githubusercontent.com/u/25822851?v=4&s=48" width="48" height="48" alt="kiranjd" title="kiranjd"/></a> <a href="https://github.com/danielz1z"><img src="https://avatars.githubusercontent.com/u/235270390?v=4&s=48" width="48" height="48" alt="danielz1z" title="danielz1z"/></a>
  <a href="https://github.com/AdeboyeDN"><img src="https://avatars.githubusercontent.com/u/65312338?v=4&s=48" width="48" height="48" alt="AdeboyeDN" title="AdeboyeDN"/></a> <a href="https://github.com/Alg0rix"><img src="https://avatars.githubusercontent.com/u/53804949?v=4&s=48" width="48" height="48" alt="Alg0rix" title="Alg0rix"/></a> <a href="https://github.com/Takhoffman"><img src="https://avatars.githubusercontent.com/u/781889?v=4&s=48" width="48" height="48" alt="Takhoffman" title="Takhoffman"/></a> <a href="https://github.com/papago2355"><img src="https://avatars.githubusercontent.com/u/68721273?v=4&s=48" width="48" height="48" alt="papago2355" title="papago2355"/></a> <a href="https://github.com/emanuelst"><img src="https://avatars.githubusercontent.com/u/9994339?v=4&s=48" width="48" height="48" alt="emanuelst" title="emanuelst"/></a> <a href="https://github.com/evanotero"><img src="https://avatars.githubusercontent.com/u/13204105?v=4&s=48" width="48" height="48" alt="evanotero" title="evanotero"/></a> <a href="https://github.com/KristijanJovanovski"><img src="https://avatars.githubusercontent.com/u/8942284?v=4&s=48" width="48" height="48" alt="KristijanJovanovski" title="KristijanJovanovski"/></a> <a href="https://github.com/jlowin"><img src="https://avatars.githubusercontent.com/u/153965?v=4&s=48" width="48" height="48" alt="jlowin" title="jlowin"/></a> <a href="https://github.com/rdev"><img src="https://avatars.githubusercontent.com/u/8418866?v=4&s=48" width="48" height="48" alt="rdev" title="rdev"/></a> <a href="https://github.com/rhuanssauro"><img src="https://avatars.githubusercontent.com/u/164682191?v=4&s=48" width="48" height="48" alt="rhuanssauro" title="rhuanssauro"/></a>
  <a href="https://github.com/joshrad-dev"><img src="https://avatars.githubusercontent.com/u/62785552?v=4&s=48" width="48" height="48" alt="joshrad-dev" title="joshrad-dev"/></a> <a href="https://github.com/osolmaz"><img src="https://avatars.githubusercontent.com/u/2453968?v=4&s=48" width="48" height="48" alt="osolmaz" title="osolmaz"/></a> <a href="https://github.com/adityashaw2"><img src="https://avatars.githubusercontent.com/u/41204444?v=4&s=48" width="48" height="48" alt="adityashaw2" title="adityashaw2"/></a> <a href="https://github.com/CashWilliams"><img src="https://avatars.githubusercontent.com/u/613573?v=4&s=48" width="48" height="48" alt="CashWilliams" title="CashWilliams"/></a> <a href="https://github.com/search?q=sheeek"><img src="assets/avatar-placeholder.svg" width="48" height="48" alt="sheeek" title="sheeek"/></a> <a href="https://github.com/obviyus"><img src="https://avatars.githubusercontent.com/u/22031114?v=4&s=48" width="48" height="48" alt="obviyus" title="obviyus"/></a> <a href="https://github.com/ryancontent"><img src="https://avatars.githubusercontent.com/u/39743613?v=4&s=48" width="48" height="48" alt="ryancontent" title="ryancontent"/></a> <a href="https://github.com/jasonsschin"><img src="https://avatars.githubusercontent.com/u/1456889?v=4&s=48" width="48" height="48" alt="jasonsschin" title="jasonsschin"/></a> <a href="https://github.com/artuskg"><img src="https://avatars.githubusercontent.com/u/11966157?v=4&s=48" width="48" height="48" alt="artuskg" title="artuskg"/></a> <a href="https://github.com/onutc"><img src="https://avatars.githubusercontent.com/u/152018508?v=4&s=48" width="48" height="48" alt="onutc" title="onutc"/></a>
  <a href="https://github.com/pauloportella"><img src="https://avatars.githubusercontent.com/u/22947229?v=4&s=48" width="48" height="48" alt="pauloportella" title="pauloportella"/></a> <a href="https://github.com/HirokiKobayashi-R"><img src="https://avatars.githubusercontent.com/u/37167840?v=4&s=48" width="48" height="48" alt="HirokiKobayashi-R" title="HirokiKobayashi-R"/></a> <a href="https://github.com/ThanhNguyxn"><img src="https://avatars.githubusercontent.com/u/74597207?v=4&s=48" width="48" height="48" alt="ThanhNguyxn" title="ThanhNguyxn"/></a> <a href="https://github.com/yuting0624"><img src="https://avatars.githubusercontent.com/u/32728916?v=4&s=48" width="48" height="48" alt="yuting0624" title="yuting0624"/></a> <a href="https://github.com/neooriginal"><img src="https://avatars.githubusercontent.com/u/54811660?v=4&s=48" width="48" height="48" alt="neooriginal" title="neooriginal"/></a> <a href="https://github.com/ManuelHettich"><img src="https://avatars.githubusercontent.com/u/17690367?v=4&s=48" width="48" height="48" alt="manuelhettich" title="manuelhettich"/></a> <a href="https://github.com/minghinmatthewlam"><img src="https://avatars.githubusercontent.com/u/14224566?v=4&s=48" width="48" height="48" alt="minghinmatthewlam" title="minghinmatthewlam"/></a> <a href="https://github.com/manikv12"><img src="https://avatars.githubusercontent.com/u/49544491?v=4&s=48" width="48" height="48" alt="manikv12" title="manikv12"/></a> <a href="https://github.com/myfunc"><img src="https://avatars.githubusercontent.com/u/19294627?v=4&s=48" width="48" height="48" alt="myfunc" title="myfunc"/></a> <a href="https://github.com/travisirby"><img src="https://avatars.githubusercontent.com/u/5958376?v=4&s=48" width="48" height="48" alt="travisirby" title="travisirby"/></a>
  <a href="https://github.com/buddyh"><img src="https://avatars.githubusercontent.com/u/31752869?v=4&s=48" width="48" height="48" alt="buddyh" title="buddyh"/></a> <a href="https://github.com/connorshea"><img src="https://avatars.githubusercontent.com/u/2977353?v=4&s=48" width="48" height="48" alt="connorshea" title="connorshea"/></a> <a href="https://github.com/kyleok"><img src="https://avatars.githubusercontent.com/u/58307870?v=4&s=48" width="48" height="48" alt="kyleok" title="kyleok"/></a> <a href="https://github.com/mcinteerj"><img src="https://avatars.githubusercontent.com/u/3613653?v=4&s=48" width="48" height="48" alt="mcinteerj" title="mcinteerj"/></a> <a href="https://github.com/apps/dependabot"><img src="https://avatars.githubusercontent.com/in/29110?v=4&s=48" width="48" height="48" alt="dependabot[bot]" title="dependabot[bot]"/></a> <a href="https://github.com/amitbiswal007"><img src="https://avatars.githubusercontent.com/u/108086198?v=4&s=48" width="48" height="48" alt="amitbiswal007" title="amitbiswal007"/></a> <a href="https://github.com/John-Rood"><img src="https://avatars.githubusercontent.com/u/62669593?v=4&s=48" width="48" height="48" alt="John-Rood" title="John-Rood"/></a> <a href="https://github.com/timkrase"><img src="https://avatars.githubusercontent.com/u/38947626?v=4&s=48" width="48" height="48" alt="timkrase" title="timkrase"/></a> <a href="https://github.com/uos-status"><img src="https://avatars.githubusercontent.com/u/255712580?v=4&s=48" width="48" height="48" alt="uos-status" title="uos-status"/></a> <a href="https://github.com/gerardward2007"><img src="https://avatars.githubusercontent.com/u/3002155?v=4&s=48" width="48" height="48" alt="gerardward2007" title="gerardward2007"/></a>
  <a href="https://github.com/roshanasingh4"><img src="https://avatars.githubusercontent.com/u/88576930?v=4&s=48" width="48" height="48" alt="roshanasingh4" title="roshanasingh4"/></a> <a href="https://github.com/tosh-hamburg"><img src="https://avatars.githubusercontent.com/u/58424326?v=4&s=48" width="48" height="48" alt="tosh-hamburg" title="tosh-hamburg"/></a> <a href="https://github.com/azade-c"><img src="https://avatars.githubusercontent.com/u/252790079?v=4&s=48" width="48" height="48" alt="azade-c" title="azade-c"/></a> <a href="https://github.com/dlauer"><img src="https://avatars.githubusercontent.com/u/757041?v=4&s=48" width="48" height="48" alt="dlauer" title="dlauer"/></a> <a href="https://github.com/JonUleis"><img src="https://avatars.githubusercontent.com/u/7644941?v=4&s=48" width="48" height="48" alt="JonUleis" title="JonUleis"/></a> <a href="https://github.com/shivamraut101"><img src="https://avatars.githubusercontent.com/u/110457469?v=4&s=48" width="48" height="48" alt="shivamraut101" title="shivamraut101"/></a> <a href="https://github.com/bjesuiter"><img src="https://avatars.githubusercontent.com/u/2365676?v=4&s=48" width="48" height="48" alt="bjesuiter" title="bjesuiter"/></a> <a href="https://github.com/cheeeee"><img src="https://avatars.githubusercontent.com/u/21245729?v=4&s=48" width="48" height="48" alt="cheeeee" title="cheeeee"/></a> <a href="https://github.com/robbyczgw-cla"><img src="https://avatars.githubusercontent.com/u/239660374?v=4&s=48" width="48" height="48" alt="robbyczgw-cla" title="robbyczgw-cla"/></a> <a href="https://github.com/YuriNachos"><img src="https://avatars.githubusercontent.com/u/19365375?v=4&s=48" width="48" height="48" alt="YuriNachos" title="YuriNachos"/></a>
  <a href="https://github.com/badlogic"><img src="https://avatars.githubusercontent.com/u/514052?v=4&s=48" width="48" height="48" alt="badlogic" title="badlogic"/></a> <a href="https://github.com/j1philli"><img src="https://avatars.githubusercontent.com/u/3744255?v=4&s=48" width="48" height="48" alt="Josh Phillips" title="Josh Phillips"/></a> <a href="https://github.com/pookNast"><img src="https://avatars.githubusercontent.com/u/14242552?v=4&s=48" width="48" height="48" alt="pookNast" title="pookNast"/></a> <a href="https://github.com/Whoaa512"><img src="https://avatars.githubusercontent.com/u/1581943?v=4&s=48" width="48" height="48" alt="Whoaa512" title="Whoaa512"/></a> <a href="https://github.com/chriseidhof"><img src="https://avatars.githubusercontent.com/u/5382?v=4&s=48" width="48" height="48" alt="chriseidhof" title="chriseidhof"/></a> <a href="https://github.com/ngutman"><img src="https://avatars.githubusercontent.com/u/1540134?v=4&s=48" width="48" height="48" alt="ngutman" title="ngutman"/></a> <a href="https://github.com/ysqander"><img src="https://avatars.githubusercontent.com/u/80843820?v=4&s=48" width="48" height="48" alt="ysqander" title="ysqander"/></a> <a href="https://github.com/search?q=Yurii%20Chukhlib"><img src="assets/avatar-placeholder.svg" width="48" height="48" alt="Yurii Chukhlib" title="Yurii Chukhlib"/></a> <a href="https://github.com/aj47"><img src="https://avatars.githubusercontent.com/u/8023513?v=4&s=48" width="48" height="48" alt="aj47" title="aj47"/></a> <a href="https://github.com/kennyklee"><img src="https://avatars.githubusercontent.com/u/1432489?v=4&s=48" width="48" height="48" alt="kennyklee" title="kennyklee"/></a>
  <a href="https://github.com/superman32432432"><img src="https://avatars.githubusercontent.com/u/7228420?v=4&s=48" width="48" height="48" alt="superman32432432" title="superman32432432"/></a> <a href="https://github.com/grp06"><img src="https://avatars.githubusercontent.com/u/1573959?v=4&s=48" width="48" height="48" alt="grp06" title="grp06"/></a> <a href="https://github.com/Hisleren"><img src="https://avatars.githubusercontent.com/u/83217244?v=4&s=48" width="48" height="48" alt="Hisleren" title="Hisleren"/></a> <a href="https://github.com/antons"><img src="https://avatars.githubusercontent.com/u/129705?v=4&s=48" width="48" height="48" alt="antons" title="antons"/></a> <a href="https://github.com/austinm911"><img src="https://avatars.githubusercontent.com/u/31991302?v=4&s=48" width="48" height="48" alt="austinm911" title="austinm911"/></a> <a href="https://github.com/apps/blacksmith-sh"><img src="https://avatars.githubusercontent.com/in/807020?v=4&s=48" width="48" height="48" alt="blacksmith-sh[bot]" title="blacksmith-sh[bot]"/></a> <a href="https://github.com/damoahdominic"><img src="https://avatars.githubusercontent.com/u/4623434?v=4&s=48" width="48" height="48" alt="damoahdominic" title="damoahdominic"/></a> <a href="https://github.com/dan-dr"><img src="https://avatars.githubusercontent.com/u/6669808?v=4&s=48" width="48" height="48" alt="dan-dr" title="dan-dr"/></a> <a href="https://github.com/HeimdallStrategy"><img src="https://avatars.githubusercontent.com/u/223014405?v=4&s=48" width="48" height="48" alt="HeimdallStrategy" title="HeimdallStrategy"/></a> <a href="https://github.com/imfing"><img src="https://avatars.githubusercontent.com/u/5097752?v=4&s=48" width="48" height="48" alt="imfing" title="imfing"/></a>
  <a href="https://github.com/jalehman"><img src="https://avatars.githubusercontent.com/u/550978?v=4&s=48" width="48" height="48" alt="jalehman" title="jalehman"/></a> <a href="https://github.com/jarvis-medmatic"><img src="https://avatars.githubusercontent.com/u/252428873?v=4&s=48" width="48" height="48" alt="jarvis-medmatic" title="jarvis-medmatic"/></a> <a href="https://github.com/kkarimi"><img src="https://avatars.githubusercontent.com/u/875218?v=4&s=48" width="48" height="48" alt="kkarimi" title="kkarimi"/></a> <a href="https://github.com/mahmoudashraf93"><img src="https://avatars.githubusercontent.com/u/9130129?v=4&s=48" width="48" height="48" alt="mahmoudashraf93" title="mahmoudashraf93"/></a> <a href="https://github.com/pkrmf"><img src="https://avatars.githubusercontent.com/u/1714267?v=4&s=48" width="48" height="48" alt="pkrmf" title="pkrmf"/></a> <a href="https://github.com/RandyVentures"><img src="https://avatars.githubusercontent.com/u/149904821?v=4&s=48" width="48" height="48" alt="RandyVentures" title="RandyVentures"/></a> <a href="https://github.com/robhparker"><img src="https://avatars.githubusercontent.com/u/7404740?v=4&s=48" width="48" height="48" alt="robhparker" title="robhparker"/></a> <a href="https://github.com/search?q=Ryan%20Lisse"><img src="assets/avatar-placeholder.svg" width="48" height="48" alt="Ryan Lisse" title="Ryan Lisse"/></a> <a href="https://github.com/dougvk"><img src="https://avatars.githubusercontent.com/u/401660?v=4&s=48" width="48" height="48" alt="dougvk" title="dougvk"/></a> <a href="https://github.com/erikpr1994"><img src="https://avatars.githubusercontent.com/u/6299331?v=4&s=48" width="48" height="48" alt="erikpr1994" title="erikpr1994"/></a>
  <a href="https://github.com/fal3"><img src="https://avatars.githubusercontent.com/u/6484295?v=4&s=48" width="48" height="48" alt="fal3" title="fal3"/></a> <a href="https://github.com/search?q=Ghost"><img src="assets/avatar-placeholder.svg" width="48" height="48" alt="Ghost" title="Ghost"/></a> <a href="https://github.com/jonasjancarik"><img src="https://avatars.githubusercontent.com/u/2459191?v=4&s=48" width="48" height="48" alt="jonasjancarik" title="jonasjancarik"/></a> <a href="https://github.com/search?q=Keith%20the%20Silly%20Goose"><img src="assets/avatar-placeholder.svg" width="48" height="48" alt="Keith the Silly Goose" title="Keith the Silly Goose"/></a> <a href="https://github.com/search?q=L36%20Server"><img src="assets/avatar-placeholder.svg" width="48" height="48" alt="L36 Server" title="L36 Server"/></a> <a href="https://github.com/search?q=Marc"><img src="assets/avatar-placeholder.svg" width="48" height="48" alt="Marc" title="Marc"/></a> <a href="https://github.com/mitschabaude-bot"><img src="https://avatars.githubusercontent.com/u/247582884?v=4&s=48" width="48" height="48" alt="mitschabaude-bot" title="mitschabaude-bot"/></a> <a href="https://github.com/mkbehr"><img src="https://avatars.githubusercontent.com/u/1285?v=4&s=48" width="48" height="48" alt="mkbehr" title="mkbehr"/></a> <a href="https://github.com/neist"><img src="https://avatars.githubusercontent.com/u/1029724?v=4&s=48" width="48" height="48" alt="neist" title="neist"/></a> <a href="https://github.com/sibbl"><img src="https://avatars.githubusercontent.com/u/866535?v=4&s=48" width="48" height="48" alt="sibbl" title="sibbl"/></a>
  <a href="https://github.com/abhijeet117"><img src="https://avatars.githubusercontent.com/u/192859219?v=4&s=48" width="48" height="48" alt="abhijeet117" title="abhijeet117"/></a> <a href="https://github.com/chrisrodz"><img src="https://avatars.githubusercontent.com/u/2967620?v=4&s=48" width="48" height="48" alt="chrisrodz" title="chrisrodz"/></a> <a href="https://github.com/search?q=Friederike%20Seiler"><img src="assets/avatar-placeholder.svg" width="48" height="48" alt="Friederike Seiler" title="Friederike Seiler"/></a> <a href="https://github.com/gabriel-trigo"><img src="https://avatars.githubusercontent.com/u/38991125?v=4&s=48" width="48" height="48" alt="gabriel-trigo" title="gabriel-trigo"/></a> <a href="https://github.com/Iamadig"><img src="https://avatars.githubusercontent.com/u/102129234?v=4&s=48" width="48" height="48" alt="iamadig" title="iamadig"/></a> <a href="https://github.com/jdrhyne"><img src="https://avatars.githubusercontent.com/u/7828464?v=4&s=48" width="48" height="48" alt="Jonathan D. Rhyne (DJ-D)" title="Jonathan D. Rhyne (DJ-D)"/></a> <a href="https://github.com/search?q=Joshua%20Mitchell"><img src="assets/avatar-placeholder.svg" width="48" height="48" alt="Joshua Mitchell" title="Joshua Mitchell"/></a> <a href="https://github.com/search?q=Kit"><img src="assets/avatar-placeholder.svg" width="48" height="48" alt="Kit" title="Kit"/></a> <a href="https://github.com/koala73"><img src="https://avatars.githubusercontent.com/u/996596?v=4&s=48" width="48" height="48" alt="koala73" title="koala73"/></a> <a href="https://github.com/manmal"><img src="https://avatars.githubusercontent.com/u/142797?v=4&s=48" width="48" height="48" alt="manmal" title="manmal"/></a>
  <a href="https://github.com/ogulcancelik"><img src="https://avatars.githubusercontent.com/u/7064011?v=4&s=48" width="48" height="48" alt="ogulcancelik" title="ogulcancelik"/></a> <a href="https://github.com/pasogott"><img src="https://avatars.githubusercontent.com/u/23458152?v=4&s=48" width="48" height="48" alt="pasogott" title="pasogott"/></a> <a href="https://github.com/petradonka"><img src="https://avatars.githubusercontent.com/u/7353770?v=4&s=48" width="48" height="48" alt="petradonka" title="petradonka"/></a> <a href="https://github.com/rubyrunsstuff"><img src="https://avatars.githubusercontent.com/u/246602379?v=4&s=48" width="48" height="48" alt="rubyrunsstuff" title="rubyrunsstuff"/></a> <a href="https://github.com/siddhantjain"><img src="https://avatars.githubusercontent.com/u/4835232?v=4&s=48" width="48" height="48" alt="siddhantjain" title="siddhantjain"/></a> <a href="https://github.com/spiceoogway"><img src="https://avatars.githubusercontent.com/u/105812383?v=4&s=48" width="48" height="48" alt="spiceoogway" title="spiceoogway"/></a> <a href="https://github.com/suminhthanh"><img src="https://avatars.githubusercontent.com/u/2907636?v=4&s=48" width="48" height="48" alt="suminhthanh" title="suminhthanh"/></a> <a href="https://github.com/svkozak"><img src="https://avatars.githubusercontent.com/u/31941359?v=4&s=48" width="48" height="48" alt="svkozak" title="svkozak"/></a> <a href="https://github.com/VACInc"><img src="https://avatars.githubusercontent.com/u/3279061?v=4&s=48" width="48" height="48" alt="VACInc" title="VACInc"/></a> <a href="https://github.com/wes-davis"><img src="https://avatars.githubusercontent.com/u/16506720?v=4&s=48" width="48" height="48" alt="wes-davis" title="wes-davis"/></a>
  <a href="https://github.com/zats"><img src="https://avatars.githubusercontent.com/u/2688806?v=4&s=48" width="48" height="48" alt="zats" title="zats"/></a> <a href="https://github.com/24601"><img src="https://avatars.githubusercontent.com/u/1157207?v=4&s=48" width="48" height="48" alt="24601" title="24601"/></a> <a href="https://github.com/ameno-"><img src="https://avatars.githubusercontent.com/u/2416135?v=4&s=48" width="48" height="48" alt="ameno-" title="ameno-"/></a> <a href="https://github.com/search?q=Chris%20Taylor"><img src="assets/avatar-placeholder.svg" width="48" height="48" alt="Chris Taylor" title="Chris Taylor"/></a> <a href="https://github.com/dguido"><img src="https://avatars.githubusercontent.com/u/294844?v=4&s=48" width="48" height="48" alt="dguido" title="dguido"/></a> <a href="https://github.com/djangonavarro220"><img src="https://avatars.githubusercontent.com/u/251162586?v=4&s=48" width="48" height="48" alt="Django Navarro" title="Django Navarro"/></a> <a href="https://github.com/evalexpr"><img src="https://avatars.githubusercontent.com/u/23485511?v=4&s=48" width="48" height="48" alt="evalexpr" title="evalexpr"/></a> <a href="https://github.com/henrino3"><img src="https://avatars.githubusercontent.com/u/4260288?v=4&s=48" width="48" height="48" alt="henrino3" title="henrino3"/></a> <a href="https://github.com/humanwritten"><img src="https://avatars.githubusercontent.com/u/206531610?v=4&s=48" width="48" height="48" alt="humanwritten" title="humanwritten"/></a> <a href="https://github.com/larlyssa"><img src="https://avatars.githubusercontent.com/u/13128869?v=4&s=48" width="48" height="48" alt="larlyssa" title="larlyssa"/></a>
  <a href="https://github.com/Lukavyi"><img src="https://avatars.githubusercontent.com/u/1013690?v=4&s=48" width="48" height="48" alt="Lukavyi" title="Lukavyi"/></a> <a href="https://github.com/odysseus0"><img src="https://avatars.githubusercontent.com/u/8635094?v=4&s=48" width="48" height="48" alt="odysseus0" title="odysseus0"/></a> <a href="https://github.com/oswalpalash"><img src="https://avatars.githubusercontent.com/u/6431196?v=4&s=48" width="48" height="48" alt="oswalpalash" title="oswalpalash"/></a> <a href="https://github.com/pcty-nextgen-service-account"><img src="https://avatars.githubusercontent.com/u/112553441?v=4&s=48" width="48" height="48" alt="pcty-nextgen-service-account" title="pcty-nextgen-service-account"/></a> <a href="https://github.com/pi0"><img src="https://avatars.githubusercontent.com/u/5158436?v=4&s=48" width="48" height="48" alt="pi0" title="pi0"/></a> <a href="https://github.com/rmorse"><img src="https://avatars.githubusercontent.com/u/853547?v=4&s=48" width="48" height="48" alt="rmorse" title="rmorse"/></a> <a href="https://github.com/search?q=Roopak%20Nijhara"><img src="assets/avatar-placeholder.svg" width="48" height="48" alt="Roopak Nijhara" title="Roopak Nijhara"/></a> <a href="https://github.com/Syhids"><img src="https://avatars.githubusercontent.com/u/671202?v=4&s=48" width="48" height="48" alt="Syhids" title="Syhids"/></a> <a href="https://github.com/search?q=Ubuntu"><img src="assets/avatar-placeholder.svg" width="48" height="48" alt="Ubuntu" title="Ubuntu"/></a> <a href="https://github.com/search?q=Aaron%20Konyer"><img src="assets/avatar-placeholder.svg" width="48" height="48" alt="Aaron Konyer" title="Aaron Konyer"/></a>
  <a href="https://github.com/aaronveklabs"><img src="https://avatars.githubusercontent.com/u/225997828?v=4&s=48" width="48" height="48" alt="aaronveklabs" title="aaronveklabs"/></a> <a href="https://github.com/andreabadesso"><img src="https://avatars.githubusercontent.com/u/3586068?v=4&s=48" width="48" height="48" alt="andreabadesso" title="andreabadesso"/></a> <a href="https://github.com/search?q=Andrii"><img src="assets/avatar-placeholder.svg" width="48" height="48" alt="Andrii" title="Andrii"/></a> <a href="https://github.com/cash-echo-bot"><img src="https://avatars.githubusercontent.com/u/252747386?v=4&s=48" width="48" height="48" alt="cash-echo-bot" title="cash-echo-bot"/></a> <a href="https://github.com/search?q=Clawd"><img src="assets/avatar-placeholder.svg" width="48" height="48" alt="Clawd" title="Clawd"/></a> <a href="https://github.com/search?q=ClawdFx"><img src="assets/avatar-placeholder.svg" width="48" height="48" alt="ClawdFx" title="ClawdFx"/></a> <a href="https://github.com/EnzeD"><img src="https://avatars.githubusercontent.com/u/9866900?v=4&s=48" width="48" height="48" alt="EnzeD" title="EnzeD"/></a> <a href="https://github.com/erik-agens"><img src="https://avatars.githubusercontent.com/u/80908960?v=4&s=48" width="48" height="48" alt="erik-agens" title="erik-agens"/></a> <a href="https://github.com/Evizero"><img src="https://avatars.githubusercontent.com/u/10854026?v=4&s=48" width="48" height="48" alt="Evizero" title="Evizero"/></a> <a href="https://github.com/fcatuhe"><img src="https://avatars.githubusercontent.com/u/17382215?v=4&s=48" width="48" height="48" alt="fcatuhe" title="fcatuhe"/></a>
  <a href="https://github.com/itsjaydesu"><img src="https://avatars.githubusercontent.com/u/220390?v=4&s=48" width="48" height="48" alt="itsjaydesu" title="itsjaydesu"/></a> <a href="https://github.com/ivancasco"><img src="https://avatars.githubusercontent.com/u/2452858?v=4&s=48" width="48" height="48" alt="ivancasco" title="ivancasco"/></a> <a href="https://github.com/ivanrvpereira"><img src="https://avatars.githubusercontent.com/u/183991?v=4&s=48" width="48" height="48" alt="ivanrvpereira" title="ivanrvpereira"/></a> <a href="https://github.com/search?q=Jarvis"><img src="assets/avatar-placeholder.svg" width="48" height="48" alt="Jarvis" title="Jarvis"/></a> <a href="https://github.com/jayhickey"><img src="https://avatars.githubusercontent.com/u/1676460?v=4&s=48" width="48" height="48" alt="jayhickey" title="jayhickey"/></a> <a href="https://github.com/jeffersonwarrior"><img src="https://avatars.githubusercontent.com/u/89030989?v=4&s=48" width="48" height="48" alt="jeffersonwarrior" title="jeffersonwarrior"/></a> <a href="https://github.com/search?q=jeffersonwarrior"><img src="assets/avatar-placeholder.svg" width="48" height="48" alt="jeffersonwarrior" title="jeffersonwarrior"/></a> <a href="https://github.com/jverdi"><img src="https://avatars.githubusercontent.com/u/345050?v=4&s=48" width="48" height="48" alt="jverdi" title="jverdi"/></a> <a href="https://github.com/longmaba"><img src="https://avatars.githubusercontent.com/u/9361500?v=4&s=48" width="48" height="48" alt="longmaba" title="longmaba"/></a> <a href="https://github.com/MarvinCui"><img src="https://avatars.githubusercontent.com/u/130876763?v=4&s=48" width="48" height="48" alt="MarvinCui" title="MarvinCui"/></a>
  <a href="https://github.com/mitsuhiko"><img src="https://avatars.githubusercontent.com/u/7396?v=4&s=48" width="48" height="48" alt="mitsuhiko" title="mitsuhiko"/></a> <a href="https://github.com/mjrussell"><img src="https://avatars.githubusercontent.com/u/1641895?v=4&s=48" width="48" height="48" alt="mjrussell" title="mjrussell"/></a> <a href="https://github.com/odnxe"><img src="https://avatars.githubusercontent.com/u/403141?v=4&s=48" width="48" height="48" alt="odnxe" title="odnxe"/></a> <a href="https://github.com/optimikelabs"><img src="https://avatars.githubusercontent.com/u/31423109?v=4&s=48" width="48" height="48" alt="optimikelabs" title="optimikelabs"/></a> <a href="https://github.com/p6l-richard"><img src="https://avatars.githubusercontent.com/u/18185649?v=4&s=48" width="48" height="48" alt="p6l-richard" title="p6l-richard"/></a> <a href="https://github.com/philipp-spiess"><img src="https://avatars.githubusercontent.com/u/458591?v=4&s=48" width="48" height="48" alt="philipp-spiess" title="philipp-spiess"/></a> <a href="https://github.com/search?q=Pocket%20Clawd"><img src="assets/avatar-placeholder.svg" width="48" height="48" alt="Pocket Clawd" title="Pocket Clawd"/></a> <a href="https://github.com/robaxelsen"><img src="https://avatars.githubusercontent.com/u/13132899?v=4&s=48" width="48" height="48" alt="robaxelsen" title="robaxelsen"/></a> <a href="https://github.com/search?q=Sash%20Catanzarite"><img src="assets/avatar-placeholder.svg" width="48" height="48" alt="Sash Catanzarite" title="Sash Catanzarite"/></a> <a href="https://github.com/Suksham-sharma"><img src="https://avatars.githubusercontent.com/u/94667656?v=4&s=48" width="48" height="48" alt="Suksham-sharma" title="Suksham-sharma"/></a>
  <a href="https://github.com/T5-AndyML"><img src="https://avatars.githubusercontent.com/u/22801233?v=4&s=48" width="48" height="48" alt="T5-AndyML" title="T5-AndyML"/></a> <a href="https://github.com/tewatia"><img src="https://avatars.githubusercontent.com/u/22875334?v=4&s=48" width="48" height="48" alt="tewatia" title="tewatia"/></a> <a href="https://github.com/travisp"><img src="https://avatars.githubusercontent.com/u/165698?v=4&s=48" width="48" height="48" alt="travisp" title="travisp"/></a> <a href="https://github.com/search?q=VAC"><img src="assets/avatar-placeholder.svg" width="48" height="48" alt="VAC" title="VAC"/></a> <a href="https://github.com/search?q=william%20arzt"><img src="assets/avatar-placeholder.svg" width="48" height="48" alt="william arzt" title="william arzt"/></a> <a href="https://github.com/zknicker"><img src="https://avatars.githubusercontent.com/u/1164085?v=4&s=48" width="48" height="48" alt="zknicker" title="zknicker"/></a> <a href="https://github.com/0oAstro"><img src="https://avatars.githubusercontent.com/u/79555780?v=4&s=48" width="48" height="48" alt="0oAstro" title="0oAstro"/></a> <a href="https://github.com/abhaymundhara"><img src="https://avatars.githubusercontent.com/u/62872231?v=4&s=48" width="48" height="48" alt="abhaymundhara" title="abhaymundhara"/></a> <a href="https://github.com/aduk059"><img src="https://avatars.githubusercontent.com/u/257603478?v=4&s=48" width="48" height="48" alt="aduk059" title="aduk059"/></a> <a href="https://github.com/aldoeliacim"><img src="https://avatars.githubusercontent.com/u/17973757?v=4&s=48" width="48" height="48" alt="aldoeliacim" title="aldoeliacim"/></a>
  <a href="https://github.com/search?q=alejandro%20maza"><img src="assets/avatar-placeholder.svg" width="48" height="48" alt="alejandro maza" title="alejandro maza"/></a> <a href="https://github.com/Alex-Alaniz"><img src="https://avatars.githubusercontent.com/u/88956822?v=4&s=48" width="48" height="48" alt="Alex-Alaniz" title="Alex-Alaniz"/></a> <a href="https://github.com/alexstyl"><img src="https://avatars.githubusercontent.com/u/1665273?v=4&s=48" width="48" height="48" alt="alexstyl" title="alexstyl"/></a> <a href="https://github.com/andrewting19"><img src="https://avatars.githubusercontent.com/u/10536704?v=4&s=48" width="48" height="48" alt="andrewting19" title="andrewting19"/></a> <a href="https://github.com/anpoirier"><img src="https://avatars.githubusercontent.com/u/1245729?v=4&s=48" width="48" height="48" alt="anpoirier" title="anpoirier"/></a> <a href="https://github.com/araa47"><img src="https://avatars.githubusercontent.com/u/22760261?v=4&s=48" width="48" height="48" alt="araa47" title="araa47"/></a> <a href="https://github.com/arthyn"><img src="https://avatars.githubusercontent.com/u/5466421?v=4&s=48" width="48" height="48" alt="arthyn" title="arthyn"/></a> <a href="https://github.com/Asleep123"><img src="https://avatars.githubusercontent.com/u/122379135?v=4&s=48" width="48" height="48" alt="Asleep123" title="Asleep123"/></a> <a href="https://github.com/search?q=Ayush%20Ojha"><img src="assets/avatar-placeholder.svg" width="48" height="48" alt="Ayush Ojha" title="Ayush Ojha"/></a> <a href="https://github.com/Ayush10"><img src="https://avatars.githubusercontent.com/u/7945279?v=4&s=48" width="48" height="48" alt="Ayush10" title="Ayush10"/></a>
  <a href="https://github.com/bguidolim"><img src="https://avatars.githubusercontent.com/u/987360?v=4&s=48" width="48" height="48" alt="bguidolim" title="bguidolim"/></a> <a href="https://github.com/bolismauro"><img src="https://avatars.githubusercontent.com/u/771999?v=4&s=48" width="48" height="48" alt="bolismauro" title="bolismauro"/></a> <a href="https://github.com/championswimmer"><img src="https://avatars.githubusercontent.com/u/1327050?v=4&s=48" width="48" height="48" alt="championswimmer" title="championswimmer"/></a> <a href="https://github.com/chenyuan99"><img src="https://avatars.githubusercontent.com/u/25518100?v=4&s=48" width="48" height="48" alt="chenyuan99" title="chenyuan99"/></a> <a href="https://github.com/Chloe-VP"><img src="https://avatars.githubusercontent.com/u/257371598?v=4&s=48" width="48" height="48" alt="Chloe-VP" title="Chloe-VP"/></a> <a href="https://github.com/search?q=Clawdbot%20Maintainers"><img src="assets/avatar-placeholder.svg" width="48" height="48" alt="Clawdbot Maintainers" title="Clawdbot Maintainers"/></a> <a href="https://github.com/conhecendoia"><img src="https://avatars.githubusercontent.com/u/82890727?v=4&s=48" width="48" height="48" alt="conhecendoia" title="conhecendoia"/></a> <a href="https://github.com/dasilva333"><img src="https://avatars.githubusercontent.com/u/947827?v=4&s=48" width="48" height="48" alt="dasilva333" title="dasilva333"/></a> <a href="https://github.com/David-Marsh-Photo"><img src="https://avatars.githubusercontent.com/u/228404527?v=4&s=48" width="48" height="48" alt="David-Marsh-Photo" title="David-Marsh-Photo"/></a> <a href="https://github.com/search?q=Developer"><img src="assets/avatar-placeholder.svg" width="48" height="48" alt="Developer" title="Developer"/></a>
  <a href="https://github.com/search?q=Dimitrios%20Ploutarchos"><img src="assets/avatar-placeholder.svg" width="48" height="48" alt="Dimitrios Ploutarchos" title="Dimitrios Ploutarchos"/></a> <a href="https://github.com/search?q=Drake%20Thomsen"><img src="assets/avatar-placeholder.svg" width="48" height="48" alt="Drake Thomsen" title="Drake Thomsen"/></a> <a href="https://github.com/dylanneve1"><img src="https://avatars.githubusercontent.com/u/31746704?v=4&s=48" width="48" height="48" alt="dylanneve1" title="dylanneve1"/></a> <a href="https://github.com/search?q=Felix%20Krause"><img src="assets/avatar-placeholder.svg" width="48" height="48" alt="Felix Krause" title="Felix Krause"/></a> <a href="https://github.com/foeken"><img src="https://avatars.githubusercontent.com/u/13864?v=4&s=48" width="48" height="48" alt="foeken" title="foeken"/></a> <a href="https://github.com/frankekn"><img src="https://avatars.githubusercontent.com/u/4488090?v=4&s=48" width="48" height="48" alt="frankekn" title="frankekn"/></a> <a href="https://github.com/search?q=ganghyun%20kim"><img src="assets/avatar-placeholder.svg" width="48" height="48" alt="ganghyun kim" title="ganghyun kim"/></a> <a href="https://github.com/grrowl"><img src="https://avatars.githubusercontent.com/u/907140?v=4&s=48" width="48" height="48" alt="grrowl" title="grrowl"/></a> <a href="https://github.com/gtsifrikas"><img src="https://avatars.githubusercontent.com/u/8904378?v=4&s=48" width="48" height="48" alt="gtsifrikas" title="gtsifrikas"/></a> <a href="https://github.com/HazAT"><img src="https://avatars.githubusercontent.com/u/363802?v=4&s=48" width="48" height="48" alt="HazAT" title="HazAT"/></a>
  <a href="https://github.com/hrdwdmrbl"><img src="https://avatars.githubusercontent.com/u/554881?v=4&s=48" width="48" height="48" alt="hrdwdmrbl" title="hrdwdmrbl"/></a> <a href="https://github.com/hugobarauna"><img src="https://avatars.githubusercontent.com/u/2719?v=4&s=48" width="48" height="48" alt="hugobarauna" title="hugobarauna"/></a> <a href="https://github.com/search?q=Jamie%20Openshaw"><img src="assets/avatar-placeholder.svg" width="48" height="48" alt="Jamie Openshaw" title="Jamie Openshaw"/></a> <a href="https://github.com/search?q=Jane"><img src="assets/avatar-placeholder.svg" width="48" height="48" alt="Jane" title="Jane"/></a> <a href="https://github.com/search?q=Jarvis%20Deploy"><img src="assets/avatar-placeholder.svg" width="48" height="48" alt="Jarvis Deploy" title="Jarvis Deploy"/></a> <a href="https://github.com/search?q=Jefferson%20Nunn"><img src="assets/avatar-placeholder.svg" width="48" height="48" alt="Jefferson Nunn" title="Jefferson Nunn"/></a> <a href="https://github.com/jogi47"><img src="https://avatars.githubusercontent.com/u/1710139?v=4&s=48" width="48" height="48" alt="jogi47" title="jogi47"/></a> <a href="https://github.com/kentaro"><img src="https://avatars.githubusercontent.com/u/3458?v=4&s=48" width="48" height="48" alt="kentaro" title="kentaro"/></a> <a href="https://github.com/search?q=Kevin%20Lin"><img src="assets/avatar-placeholder.svg" width="48" height="48" alt="Kevin Lin" title="Kevin Lin"/></a> <a href="https://github.com/kira-ariaki"><img src="https://avatars.githubusercontent.com/u/257352493?v=4&s=48" width="48" height="48" alt="kira-ariaki" title="kira-ariaki"/></a>
  <a href="https://github.com/kitze"><img src="https://avatars.githubusercontent.com/u/1160594?v=4&s=48" width="48" height="48" alt="kitze" title="kitze"/></a> <a href="https://github.com/Kiwitwitter"><img src="https://avatars.githubusercontent.com/u/25277769?v=4&s=48" width="48" height="48" alt="Kiwitwitter" title="Kiwitwitter"/></a> <a href="https://github.com/levifig"><img src="https://avatars.githubusercontent.com/u/1605?v=4&s=48" width="48" height="48" alt="levifig" title="levifig"/></a> <a href="https://github.com/search?q=Lloyd"><img src="assets/avatar-placeholder.svg" width="48" height="48" alt="Lloyd" title="Lloyd"/></a> <a href="https://github.com/longjos"><img src="https://avatars.githubusercontent.com/u/740160?v=4&s=48" width="48" height="48" alt="longjos" title="longjos"/></a> <a href="https://github.com/loukotal"><img src="https://avatars.githubusercontent.com/u/18210858?v=4&s=48" width="48" height="48" alt="loukotal" title="loukotal"/></a> <a href="https://github.com/louzhixian"><img src="https://avatars.githubusercontent.com/u/7994361?v=4&s=48" width="48" height="48" alt="louzhixian" title="louzhixian"/></a> <a href="https://github.com/martinpucik"><img src="https://avatars.githubusercontent.com/u/5503097?v=4&s=48" width="48" height="48" alt="martinpucik" title="martinpucik"/></a> <a href="https://github.com/search?q=Matt%20mini"><img src="assets/avatar-placeholder.svg" width="48" height="48" alt="Matt mini" title="Matt mini"/></a> <a href="https://github.com/mertcicekci0"><img src="https://avatars.githubusercontent.com/u/179321902?v=4&s=48" width="48" height="48" alt="mertcicekci0" title="mertcicekci0"/></a>
  <a href="https://github.com/search?q=Miles"><img src="assets/avatar-placeholder.svg" width="48" height="48" alt="Miles" title="Miles"/></a> <a href="https://github.com/mrdbstn"><img src="https://avatars.githubusercontent.com/u/58957632?v=4&s=48" width="48" height="48" alt="mrdbstn" title="mrdbstn"/></a> <a href="https://github.com/MSch"><img src="https://avatars.githubusercontent.com/u/7475?v=4&s=48" width="48" height="48" alt="MSch" title="MSch"/></a> <a href="https://github.com/search?q=Mustafa%20Tag%20Eldeen"><img src="assets/avatar-placeholder.svg" width="48" height="48" alt="Mustafa Tag Eldeen" title="Mustafa Tag Eldeen"/></a> <a href="https://github.com/mylukin"><img src="https://avatars.githubusercontent.com/u/1021019?v=4&s=48" width="48" height="48" alt="mylukin" title="mylukin"/></a> <a href="https://github.com/nathanbosse"><img src="https://avatars.githubusercontent.com/u/4040669?v=4&s=48" width="48" height="48" alt="nathanbosse" title="nathanbosse"/></a> <a href="https://github.com/ndraiman"><img src="https://avatars.githubusercontent.com/u/12609607?v=4&s=48" width="48" height="48" alt="ndraiman" title="ndraiman"/></a> <a href="https://github.com/nexty5870"><img src="https://avatars.githubusercontent.com/u/3869659?v=4&s=48" width="48" height="48" alt="nexty5870" title="nexty5870"/></a> <a href="https://github.com/Noctivoro"><img src="https://avatars.githubusercontent.com/u/183974570?v=4&s=48" width="48" height="48" alt="Noctivoro" title="Noctivoro"/></a> <a href="https://github.com/ppamment"><img src="https://avatars.githubusercontent.com/u/2122919?v=4&s=48" width="48" height="48" alt="ppamment" title="ppamment"/></a>
  <a href="https://github.com/prathamdby"><img src="https://avatars.githubusercontent.com/u/134331217?v=4&s=48" width="48" height="48" alt="prathamdby" title="prathamdby"/></a> <a href="https://github.com/ptn1411"><img src="https://avatars.githubusercontent.com/u/57529765?v=4&s=48" width="48" height="48" alt="ptn1411" title="ptn1411"/></a> <a href="https://github.com/reeltimeapps"><img src="https://avatars.githubusercontent.com/u/637338?v=4&s=48" width="48" height="48" alt="reeltimeapps" title="reeltimeapps"/></a> <a href="https://github.com/RLTCmpe"><img src="https://avatars.githubusercontent.com/u/10762242?v=4&s=48" width="48" height="48" alt="RLTCmpe" title="RLTCmpe"/></a> <a href="https://github.com/search?q=Rolf%20Fredheim"><img src="assets/avatar-placeholder.svg" width="48" height="48" alt="Rolf Fredheim" title="Rolf Fredheim"/></a> <a href="https://github.com/search?q=Rony%20Kelner"><img src="assets/avatar-placeholder.svg" width="48" height="48" alt="Rony Kelner" title="Rony Kelner"/></a> <a href="https://github.com/search?q=Samrat%20Jha"><img src="assets/avatar-placeholder.svg" width="48" height="48" alt="Samrat Jha" title="Samrat Jha"/></a> <a href="https://github.com/senoldogann"><img src="https://avatars.githubusercontent.com/u/45736551?v=4&s=48" width="48" height="48" alt="senoldogann" title="senoldogann"/></a> <a href="https://github.com/Seredeep"><img src="https://avatars.githubusercontent.com/u/22802816?v=4&s=48" width="48" height="48" alt="Seredeep" title="Seredeep"/></a> <a href="https://github.com/sergical"><img src="https://avatars.githubusercontent.com/u/3760543?v=4&s=48" width="48" height="48" alt="sergical" title="sergical"/></a>
  <a href="https://github.com/shiv19"><img src="https://avatars.githubusercontent.com/u/9407019?v=4&s=48" width="48" height="48" alt="shiv19" title="shiv19"/></a> <a href="https://github.com/shiyuanhai"><img src="https://avatars.githubusercontent.com/u/1187370?v=4&s=48" width="48" height="48" alt="shiyuanhai" title="shiyuanhai"/></a> <a href="https://github.com/siraht"><img src="https://avatars.githubusercontent.com/u/73152895?v=4&s=48" width="48" height="48" alt="siraht" title="siraht"/></a> <a href="https://github.com/snopoke"><img src="https://avatars.githubusercontent.com/u/249606?v=4&s=48" width="48" height="48" alt="snopoke" title="snopoke"/></a> <a href="https://github.com/search?q=techboss"><img src="assets/avatar-placeholder.svg" width="48" height="48" alt="techboss" title="techboss"/></a> <a href="https://github.com/testingabc321"><img src="https://avatars.githubusercontent.com/u/8577388?v=4&s=48" width="48" height="48" alt="testingabc321" title="testingabc321"/></a> <a href="https://github.com/search?q=The%20Admiral"><img src="assets/avatar-placeholder.svg" width="48" height="48" alt="The Admiral" title="The Admiral"/></a> <a href="https://github.com/thesash"><img src="https://avatars.githubusercontent.com/u/1166151?v=4&s=48" width="48" height="48" alt="thesash" title="thesash"/></a> <a href="https://github.com/search?q=Vibe%20Kanban"><img src="assets/avatar-placeholder.svg" width="48" height="48" alt="Vibe Kanban" title="Vibe Kanban"/></a> <a href="https://github.com/voidserf"><img src="https://avatars.githubusercontent.com/u/477673?v=4&s=48" width="48" height="48" alt="voidserf" title="voidserf"/></a>
  <a href="https://github.com/search?q=Vultr-Clawd%20Admin"><img src="assets/avatar-placeholder.svg" width="48" height="48" alt="Vultr-Clawd Admin" title="Vultr-Clawd Admin"/></a> <a href="https://github.com/search?q=Wimmie"><img src="assets/avatar-placeholder.svg" width="48" height="48" alt="Wimmie" title="Wimmie"/></a> <a href="https://github.com/search?q=wolfred"><img src="assets/avatar-placeholder.svg" width="48" height="48" alt="wolfred" title="wolfred"/></a> <a href="https://github.com/wstock"><img src="https://avatars.githubusercontent.com/u/1394687?v=4&s=48" width="48" height="48" alt="wstock" title="wstock"/></a> <a href="https://github.com/YangHuang2280"><img src="https://avatars.githubusercontent.com/u/201681634?v=4&s=48" width="48" height="48" alt="YangHuang2280" title="YangHuang2280"/></a> <a href="https://github.com/yazinsai"><img src="https://avatars.githubusercontent.com/u/1846034?v=4&s=48" width="48" height="48" alt="yazinsai" title="yazinsai"/></a> <a href="https://github.com/yevhen"><img src="https://avatars.githubusercontent.com/u/107726?v=4&s=48" width="48" height="48" alt="yevhen" title="yevhen"/></a> <a href="https://github.com/YiWang24"><img src="https://avatars.githubusercontent.com/u/176262341?v=4&s=48" width="48" height="48" alt="YiWang24" title="YiWang24"/></a> <a href="https://github.com/search?q=ymat19"><img src="assets/avatar-placeholder.svg" width="48" height="48" alt="ymat19" title="ymat19"/></a> <a href="https://github.com/search?q=Zach%20Knickerbocker"><img src="assets/avatar-placeholder.svg" width="48" height="48" alt="Zach Knickerbocker" title="Zach Knickerbocker"/></a>
  <a href="https://github.com/zackerthescar"><img src="https://avatars.githubusercontent.com/u/38077284?v=4&s=48" width="48" height="48" alt="zackerthescar" title="zackerthescar"/></a> <a href="https://github.com/0xJonHoldsCrypto"><img src="https://avatars.githubusercontent.com/u/81202085?v=4&s=48" width="48" height="48" alt="0xJonHoldsCrypto" title="0xJonHoldsCrypto"/></a> <a href="https://github.com/aaronn"><img src="https://avatars.githubusercontent.com/u/1653630?v=4&s=48" width="48" height="48" alt="aaronn" title="aaronn"/></a> <a href="https://github.com/Alphonse-arianee"><img src="https://avatars.githubusercontent.com/u/254457365?v=4&s=48" width="48" height="48" alt="Alphonse-arianee" title="Alphonse-arianee"/></a> <a href="https://github.com/atalovesyou"><img src="https://avatars.githubusercontent.com/u/3534502?v=4&s=48" width="48" height="48" alt="atalovesyou" title="atalovesyou"/></a> <a href="https://github.com/search?q=Azade"><img src="assets/avatar-placeholder.svg" width="48" height="48" alt="Azade" title="Azade"/></a> <a href="https://github.com/carlulsoe"><img src="https://avatars.githubusercontent.com/u/34673973?v=4&s=48" width="48" height="48" alt="carlulsoe" title="carlulsoe"/></a> <a href="https://github.com/search?q=ddyo"><img src="assets/avatar-placeholder.svg" width="48" height="48" alt="ddyo" title="ddyo"/></a> <a href="https://github.com/search?q=Erik"><img src="assets/avatar-placeholder.svg" width="48" height="48" alt="Erik" title="Erik"/></a> <a href="https://github.com/latitudeki5223"><img src="https://avatars.githubusercontent.com/u/119656367?v=4&s=48" width="48" height="48" alt="latitudeki5223" title="latitudeki5223"/></a>
  <a href="https://github.com/search?q=Manuel%20Maly"><img src="assets/avatar-placeholder.svg" width="48" height="48" alt="Manuel Maly" title="Manuel Maly"/></a> <a href="https://github.com/search?q=Mourad%20Boustani"><img src="assets/avatar-placeholder.svg" width="48" height="48" alt="Mourad Boustani" title="Mourad Boustani"/></a> <a href="https://github.com/odrobnik"><img src="https://avatars.githubusercontent.com/u/333270?v=4&s=48" width="48" height="48" alt="odrobnik" title="odrobnik"/></a> <a href="https://github.com/pcty-nextgen-ios-builder"><img src="assets/avatar-placeholder.svg" width="48" height="48" alt="pcty-nextgen-ios-builder" title="pcty-nextgen-ios-builder"/></a> <a href="https://github.com/search?q=Quentin"><img src="assets/avatar-placeholder.svg" width="48" height="48" alt="Quentin" title="Quentin"/></a> <a href="https://github.com/search?q=Randy%20Torres"><img src="assets/avatar-placeholder.svg" width="48" height="48" alt="Randy Torres" title="Randy Torres"/></a> <a href="https://github.com/rhjoh"><img src="https://avatars.githubusercontent.com/u/105699450?v=4&s=48" width="48" height="48" alt="rhjoh" title="rhjoh"/></a> <a href="https://github.com/ronak-guliani"><img src="https://avatars.githubusercontent.com/u/23518228?v=4&s=48" width="48" height="48" alt="ronak-guliani" title="ronak-guliani"/></a> <a href="https://github.com/search?q=William%20Stock"><img src="assets/avatar-placeholder.svg" width="48" height="48" alt="William Stock" title="William Stock"/></a>
</p>
