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

| What                     | Command                                                                 | Expected                                |
| ------------------------ | ----------------------------------------------------------------------- | --------------------------------------- |
| WSL2 version             | `wsl -l -v`                                                             | Ubuntu, VERSION 2                       |
| Docker works in WSL2     | `docker run --rm hello-world`                                           | "Hello from Docker!"                    |
| Interop disabled         | `cmd.exe` inside WSL2                                                   | "command not found"                     |
| Node.js version          | `node --version`                                                        | v22.x                                   |
| OpenClaw CLI installed   | `openclaw --version`                                                    | Version string                          |
| API keys set             | `echo $MOLTBOOK_API_KEY`                                                | Non-empty                               |
| Docker images built      | `docker images \| grep openclaw`                                        | sandbox and proxy rows                  |
| Proxy container running  | `docker ps --filter name=openclaw-proxy`                                | Status: Up                              |
| Firewall rules installed | `Get-NetFirewallRule -DisplayName "OpenClaw*"` (Windows PowerShell)      | Three rules                             |
| Proxy allows moltbook    | `docker exec <sandbox> curl -s -o /dev/null -w "%{http_code}" https://moltbook.com` | `200`                  |
| Proxy blocks evil.com    | `docker exec <sandbox> curl -s -o /dev/null -w "%{http_code}" https://evil.com`      | `403`                  |

## Configuration

All agent configuration lives in `openclaw.json` at the repo root. Key settings:

| Setting                     | Value                                    | Why                                               |
| --------------------------- | ---------------------------------------- | ------------------------------------------------- |
| `model.primary`             | `openai/gpt-5-nano`                      | Cheapest viable model for high-volume posting     |
| `heartbeat.every`           | `1h`                                     | 24 cycles/day, 24/7                               |
| `sandbox.mode`              | `all`                                    | Every tool call runs inside Docker                |
| `sandbox.docker.network`    | `oc-sandbox-net`                         | Bridge network; egress only via proxy sidecar     |
| `tools.profile`             | `minimal`                                | Smallest possible tool surface                    |
| `tools.deny`                | `browser, canvas, file_edit, file_write` | Only bash+curl needed                             |
| `tools.exec.safeBins`       | `["curl"]`                               | Allowlisted executables                           |
| `memorySearch.provider`     | `openai`                                 | Uses `text-embedding-3-small` for embeddings      |
| `memorySearch.query.hybrid` | `vector: 0.7, text: 0.3`                 | BM25 + semantic blend                             |
| `logging.redactSensitive`   | `tools`                                  | API keys scrubbed from tool output                |

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

| Layer | Assumes | Prevents |
| ----- | ------- | -------- |
| Seccomp profile | Attacker has code execution in bot container | Kernel exploitation via dangerous syscalls (ptrace, bpf, mount, kexec) |
| Read-only root + no caps | Attacker has code execution | Persistent filesystem modification, privilege escalation |
| Non-root user | Attacker has code execution | Access to privileged operations, writing to system paths |
| Proxy sidecar | Attacker controls curl/networking | Reaching arbitrary domains, bulk data exfiltration (64KB/s cap) |
| Proxy iptables | Attacker has compromised the proxy process | Outbound connections on non-443 ports, non-DNS UDP |
| WSL2 interop=false | Attacker has escaped Docker into WSL2 | Launching Windows binaries (cmd.exe, powershell.exe) |
| WSL2 umask 077 | Attacker has escaped Docker into WSL2 | Reading other users' files on mounted Windows drives |
| Windows Firewall | Attacker has escaped WSL2 to Windows network | Lateral movement to LAN devices (RFC1918 blocked) |
| Credential Guard + BitLocker | Physical theft or disk imaging | Extracting credentials from LSASS, reading encrypted disk offline |

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

| File | Purpose |
| ---- | ------- |
| `security/seccomp-sandbox.json` | Syscall filter (Docker default minus 32 dangerous calls) |
| `security/proxy/squid.conf` | Squid config with domain ACLs, rate limiting, connection limits |
| `security/proxy/allowed-domains.txt` | Domain allowlist (3 entries: .moltbook.com, .openai.com, .sokosumi.com) |
| `security/proxy/entrypoint.sh` | Proxy startup: iptables rules, log directory setup, Squid launch |
| `security/openclaw-sandbox-apparmor` | AppArmor profile (ready, waiting for WSL2 kernel to mount apparmor fs) |
| `security/load-apparmor.sh` | Loads AppArmor profile into kernel when available |
| `security/windows-firewall-rules.ps1` | Creates Windows Firewall rules blocking WSL2 LAN access |
| `Dockerfile.proxy` | Alpine + Squid + iptables (proxy sidecar image) |
| `Dockerfile.sandbox` | Debian slim, non-root, no apt/dpkg, proxy env vars baked in |

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
  <a href="https://github.com/steipete"><img src="https://avatars.githubusercontent.com/u/58493?v=4&s=48" width="48" height="48" alt="steipete" title="steipete"/></a> <a href="https://github.com/vincentkoc"><img src="https://avatars.githubusercontent.com/u/25068?v=4&s=48" width="48" height="48" alt="vincentkoc" title="vincentkoc"/></a> <a href="https://github.com/vignesh07"><img src="https://avatars.githubusercontent.com/u/1436853?v=4&s=48" width="48" height="48" alt="vignesh07" title="vignesh07"/></a> <a href="https://github.com/obviyus"><img src="https://avatars.githubusercontent.com/u/22031114?v=4&s=48" width="48" height="48" alt="obviyus" title="obviyus"/></a> <a href="https://github.com/mbelinky"><img src="https://avatars.githubusercontent.com/u/132747814?v=4&s=48" width="48" height="48" alt="Mariano Belinky" title="Mariano Belinky"/></a> <a href="https://github.com/sebslight"><img src="https://avatars.githubusercontent.com/u/19554889?v=4&s=48" width="48" height="48" alt="sebslight" title="sebslight"/></a> <a href="https://github.com/gumadeiras"><img src="https://avatars.githubusercontent.com/u/5599352?v=4&s=48" width="48" height="48" alt="gumadeiras" title="gumadeiras"/></a> <a href="https://github.com/Takhoffman"><img src="https://avatars.githubusercontent.com/u/781889?v=4&s=48" width="48" height="48" alt="Takhoffman" title="Takhoffman"/></a> <a href="https://github.com/thewilloftheshadow"><img src="https://avatars.githubusercontent.com/u/35580099?v=4&s=48" width="48" height="48" alt="thewilloftheshadow" title="thewilloftheshadow"/></a> <a href="https://github.com/cpojer"><img src="https://avatars.githubusercontent.com/u/13352?v=4&s=48" width="48" height="48" alt="cpojer" title="cpojer"/></a>
  <a href="https://github.com/tyler6204"><img src="https://avatars.githubusercontent.com/u/64381258?v=4&s=48" width="48" height="48" alt="tyler6204" title="tyler6204"/></a> <a href="https://github.com/joshp123"><img src="https://avatars.githubusercontent.com/u/1497361?v=4&s=48" width="48" height="48" alt="joshp123" title="joshp123"/></a> <a href="https://github.com/Glucksberg"><img src="https://avatars.githubusercontent.com/u/80581902?v=4&s=48" width="48" height="48" alt="Glucksberg" title="Glucksberg"/></a> <a href="https://github.com/mcaxtr"><img src="https://avatars.githubusercontent.com/u/7562095?v=4&s=48" width="48" height="48" alt="mcaxtr" title="mcaxtr"/></a> <a href="https://github.com/quotentiroler"><img src="https://avatars.githubusercontent.com/u/40643627?v=4&s=48" width="48" height="48" alt="quotentiroler" title="quotentiroler"/></a> <a href="https://github.com/osolmaz"><img src="https://avatars.githubusercontent.com/u/2453968?v=4&s=48" width="48" height="48" alt="osolmaz" title="osolmaz"/></a> <a href="https://github.com/Sid-Qin"><img src="https://avatars.githubusercontent.com/u/201593046?v=4&s=48" width="48" height="48" alt="Sid-Qin" title="Sid-Qin"/></a> <a href="https://github.com/joshavant"><img src="https://avatars.githubusercontent.com/u/830519?v=4&s=48" width="48" height="48" alt="joshavant" title="joshavant"/></a> <a href="https://github.com/shakkernerd"><img src="https://avatars.githubusercontent.com/u/165377636?v=4&s=48" width="48" height="48" alt="shakkernerd" title="shakkernerd"/></a> <a href="https://github.com/bmendonca3"><img src="https://avatars.githubusercontent.com/u/208517100?v=4&s=48" width="48" height="48" alt="bmendonca3" title="bmendonca3"/></a>
  <a href="https://github.com/mukhtharcm"><img src="https://avatars.githubusercontent.com/u/56378562?v=4&s=48" width="48" height="48" alt="mukhtharcm" title="mukhtharcm"/></a> <a href="https://github.com/zerone0x"><img src="https://avatars.githubusercontent.com/u/39543393?v=4&s=48" width="48" height="48" alt="zerone0x" title="zerone0x"/></a> <a href="https://github.com/mcinteerj"><img src="https://avatars.githubusercontent.com/u/3613653?v=4&s=48" width="48" height="48" alt="mcinteerj" title="mcinteerj"/></a> <a href="https://github.com/ngutman"><img src="https://avatars.githubusercontent.com/u/1540134?v=4&s=48" width="48" height="48" alt="ngutman" title="ngutman"/></a> <a href="https://github.com/lailoo"><img src="https://avatars.githubusercontent.com/u/20536249?v=4&s=48" width="48" height="48" alt="lailoo" title="lailoo"/></a> <a href="https://github.com/arosstale"><img src="https://avatars.githubusercontent.com/u/117890364?v=4&s=48" width="48" height="48" alt="arosstale" title="arosstale"/></a> <a href="https://github.com/rodrigouroz"><img src="https://avatars.githubusercontent.com/u/384037?v=4&s=48" width="48" height="48" alt="rodrigouroz" title="rodrigouroz"/></a> <a href="https://github.com/robbyczgw-cla"><img src="https://avatars.githubusercontent.com/u/239660374?v=4&s=48" width="48" height="48" alt="robbyczgw-cla" title="robbyczgw-cla"/></a> <a href="https://github.com/0xRaini"><img src="https://avatars.githubusercontent.com/u/190923101?v=4&s=48" width="48" height="48" alt="Elonito" title="Elonito"/></a> <a href="https://github.com/Clawborn"><img src="https://avatars.githubusercontent.com/u/261310391?v=4&s=48" width="48" height="48" alt="Clawborn" title="Clawborn"/></a>
  <a href="https://github.com/yinghaosang"><img src="https://avatars.githubusercontent.com/u/261132136?v=4&s=48" width="48" height="48" alt="yinghaosang" title="yinghaosang"/></a> <a href="https://github.com/BunsDev"><img src="https://avatars.githubusercontent.com/u/68980965?v=4&s=48" width="48" height="48" alt="BunsDev" title="BunsDev"/></a> <a href="https://github.com/christianklotz"><img src="https://avatars.githubusercontent.com/u/69443?v=4&s=48" width="48" height="48" alt="christianklotz" title="christianklotz"/></a> <a href="https://github.com/echoVic"><img src="https://avatars.githubusercontent.com/u/16428813?v=4&s=48" width="48" height="48" alt="echoVic" title="echoVic"/></a> <a href="https://github.com/coygeek"><img src="https://avatars.githubusercontent.com/u/65363919?v=4&s=48" width="48" height="48" alt="coygeek" title="coygeek"/></a> <a href="https://github.com/roshanasingh4"><img src="https://avatars.githubusercontent.com/u/88576930?v=4&s=48" width="48" height="48" alt="roshanasingh4" title="roshanasingh4"/></a> <a href="https://github.com/mneves75"><img src="https://avatars.githubusercontent.com/u/2423436?v=4&s=48" width="48" height="48" alt="mneves75" title="mneves75"/></a> <a href="https://github.com/joaohlisboa"><img src="https://avatars.githubusercontent.com/u/8200873?v=4&s=48" width="48" height="48" alt="joaohlisboa" title="joaohlisboa"/></a> <a href="https://github.com/bohdanpodvirnyi"><img src="https://avatars.githubusercontent.com/u/31819391?v=4&s=48" width="48" height="48" alt="bohdanpodvirnyi" title="bohdanpodvirnyi"/></a> <a href="https://github.com/Nachx639"><img src="https://avatars.githubusercontent.com/u/71144023?v=4&s=48" width="48" height="48" alt="nachx639" title="nachx639"/></a>
  <a href="https://github.com/onutc"><img src="https://avatars.githubusercontent.com/u/152018508?v=4&s=48" width="48" height="48" alt="onutc" title="onutc"/></a> <a href="https://github.com/VeriteIgiraneza"><img src="https://avatars.githubusercontent.com/u/69280208?v=4&s=48" width="48" height="48" alt="Verite Igiraneza" title="Verite Igiraneza"/></a> <a href="https://github.com/widingmarcus-cyber"><img src="https://avatars.githubusercontent.com/u/245375637?v=4&s=48" width="48" height="48" alt="widingmarcus-cyber" title="widingmarcus-cyber"/></a> <a href="https://github.com/akramcodez"><img src="https://avatars.githubusercontent.com/u/179671552?v=4&s=48" width="48" height="48" alt="akramcodez" title="akramcodez"/></a> <a href="https://github.com/aether-ai-agent"><img src="https://avatars.githubusercontent.com/u/261339948?v=4&s=48" width="48" height="48" alt="aether-ai-agent" title="aether-ai-agent"/></a> <a href="https://github.com/bjesuiter"><img src="https://avatars.githubusercontent.com/u/2365676?v=4&s=48" width="48" height="48" alt="bjesuiter" title="bjesuiter"/></a> <a href="https://github.com/MaudeBot"><img src="https://avatars.githubusercontent.com/u/255777700?v=4&s=48" width="48" height="48" alt="MaudeBot" title="MaudeBot"/></a> <a href="https://github.com/YuriNachos"><img src="https://avatars.githubusercontent.com/u/19365375?v=4&s=48" width="48" height="48" alt="YuriNachos" title="YuriNachos"/></a> <a href="https://github.com/chilu18"><img src="https://avatars.githubusercontent.com/u/7957943?v=4&s=48" width="48" height="48" alt="chilu18" title="chilu18"/></a> <a href="https://github.com/byungsker"><img src="https://avatars.githubusercontent.com/u/72309817?v=4&s=48" width="48" height="48" alt="byungsker" title="byungsker"/></a>
  <a href="https://github.com/dbhurley"><img src="https://avatars.githubusercontent.com/u/5251425?v=4&s=48" width="48" height="48" alt="dbhurley" title="dbhurley"/></a> <a href="https://github.com/JayMishra-source"><img src="https://avatars.githubusercontent.com/u/82963117?v=4&s=48" width="48" height="48" alt="JayMishra-source" title="JayMishra-source"/></a> <a href="https://github.com/iHildy"><img src="https://avatars.githubusercontent.com/u/25069719?v=4&s=48" width="48" height="48" alt="iHildy" title="iHildy"/></a> <a href="https://github.com/mudrii"><img src="https://avatars.githubusercontent.com/u/220262?v=4&s=48" width="48" height="48" alt="mudrii" title="mudrii"/></a> <a href="https://github.com/dlauer"><img src="https://avatars.githubusercontent.com/u/757041?v=4&s=48" width="48" height="48" alt="dlauer" title="dlauer"/></a> <a href="https://github.com/Solvely-Colin"><img src="https://avatars.githubusercontent.com/u/211764741?v=4&s=48" width="48" height="48" alt="Solvely-Colin" title="Solvely-Colin"/></a> <a href="https://github.com/czekaj"><img src="https://avatars.githubusercontent.com/u/1464539?v=4&s=48" width="48" height="48" alt="czekaj" title="czekaj"/></a> <a href="https://github.com/advaitpaliwal"><img src="https://avatars.githubusercontent.com/u/66044327?v=4&s=48" width="48" height="48" alt="advaitpaliwal" title="advaitpaliwal"/></a> <a href="https://github.com/lc0rp"><img src="https://avatars.githubusercontent.com/u/2609441?v=4&s=48" width="48" height="48" alt="lc0rp" title="lc0rp"/></a> <a href="https://github.com/grp06"><img src="https://avatars.githubusercontent.com/u/1573959?v=4&s=48" width="48" height="48" alt="grp06" title="grp06"/></a>
  <a href="https://github.com/HenryLoenwind"><img src="https://avatars.githubusercontent.com/u/1485873?v=4&s=48" width="48" height="48" alt="HenryLoenwind" title="HenryLoenwind"/></a> <a href="https://github.com/azade-c"><img src="https://avatars.githubusercontent.com/u/252790079?v=4&s=48" width="48" height="48" alt="azade-c" title="azade-c"/></a> <a href="https://github.com/Lukavyi"><img src="https://avatars.githubusercontent.com/u/1013690?v=4&s=48" width="48" height="48" alt="Lukavyi" title="Lukavyi"/></a> <a href="https://github.com/vrknetha"><img src="https://avatars.githubusercontent.com/u/20596261?v=4&s=48" width="48" height="48" alt="vrknetha" title="vrknetha"/></a> <a href="https://github.com/brandonwise"><img src="https://avatars.githubusercontent.com/u/21148772?v=4&s=48" width="48" height="48" alt="brandonwise" title="brandonwise"/></a> <a href="https://github.com/conroywhitney"><img src="https://avatars.githubusercontent.com/u/249891?v=4&s=48" width="48" height="48" alt="conroywhitney" title="conroywhitney"/></a> <a href="https://github.com/tobiasbischoff"><img src="https://avatars.githubusercontent.com/u/711564?v=4&s=48" width="48" height="48" alt="Tobias Bischoff" title="Tobias Bischoff"/></a> <a href="https://github.com/davidrudduck"><img src="https://avatars.githubusercontent.com/u/47308254?v=4&s=48" width="48" height="48" alt="davidrudduck" title="davidrudduck"/></a> <a href="https://github.com/xinhuagu"><img src="https://avatars.githubusercontent.com/u/562450?v=4&s=48" width="48" height="48" alt="xinhuagu" title="xinhuagu"/></a> <a href="https://github.com/jaydenfyi"><img src="https://avatars.githubusercontent.com/u/213395523?v=4&s=48" width="48" height="48" alt="jaydenfyi" title="jaydenfyi"/></a>
  <a href="https://github.com/petter-b"><img src="https://avatars.githubusercontent.com/u/62076402?v=4&s=48" width="48" height="48" alt="petter-b" title="petter-b"/></a> <a href="https://github.com/heyhudson"><img src="https://avatars.githubusercontent.com/u/258693705?v=4&s=48" width="48" height="48" alt="heyhudson" title="heyhudson"/></a> <a href="https://github.com/MatthieuBizien"><img src="https://avatars.githubusercontent.com/u/173090?v=4&s=48" width="48" height="48" alt="MatthieuBizien" title="MatthieuBizien"/></a> <a href="https://github.com/huntharo"><img src="https://avatars.githubusercontent.com/u/5617868?v=4&s=48" width="48" height="48" alt="huntharo" title="huntharo"/></a> <a href="https://github.com/omair445"><img src="https://avatars.githubusercontent.com/u/32237905?v=4&s=48" width="48" height="48" alt="omair445" title="omair445"/></a> <a href="https://github.com/adam91holt"><img src="https://avatars.githubusercontent.com/u/9592417?v=4&s=48" width="48" height="48" alt="adam91holt" title="adam91holt"/></a> <a href="https://github.com/adhitShet"><img src="https://avatars.githubusercontent.com/u/131381638?v=4&s=48" width="48" height="48" alt="adhitShet" title="adhitShet"/></a> <a href="https://github.com/smartprogrammer93"><img src="https://avatars.githubusercontent.com/u/33181301?v=4&s=48" width="48" height="48" alt="smartprogrammer93" title="smartprogrammer93"/></a> <a href="https://github.com/radek-paclt"><img src="https://avatars.githubusercontent.com/u/50451445?v=4&s=48" width="48" height="48" alt="radek-paclt" title="radek-paclt"/></a> <a href="https://github.com/frankekn"><img src="https://avatars.githubusercontent.com/u/4488090?v=4&s=48" width="48" height="48" alt="frankekn" title="frankekn"/></a>
  <a href="https://github.com/bradleypriest"><img src="https://avatars.githubusercontent.com/u/167215?v=4&s=48" width="48" height="48" alt="bradleypriest" title="bradleypriest"/></a> <a href="https://github.com/rahthakor"><img src="https://avatars.githubusercontent.com/u/8470553?v=4&s=48" width="48" height="48" alt="rahthakor" title="rahthakor"/></a> <a href="https://github.com/shadril238"><img src="https://avatars.githubusercontent.com/u/63901551?v=4&s=48" width="48" height="48" alt="shadril238" title="shadril238"/></a> <a href="https://github.com/VACInc"><img src="https://avatars.githubusercontent.com/u/3279061?v=4&s=48" width="48" height="48" alt="VACInc" title="VACInc"/></a> <a href="https://github.com/juanpablodlc"><img src="https://avatars.githubusercontent.com/u/92012363?v=4&s=48" width="48" height="48" alt="juanpablodlc" title="juanpablodlc"/></a> <a href="https://github.com/jonisjongithub"><img src="https://avatars.githubusercontent.com/u/86072337?v=4&s=48" width="48" height="48" alt="jonisjongithub" title="jonisjongithub"/></a> <a href="https://github.com/magimetal"><img src="https://avatars.githubusercontent.com/u/36491250?v=4&s=48" width="48" height="48" alt="magimetal" title="magimetal"/></a> <a href="https://github.com/stakeswky"><img src="https://avatars.githubusercontent.com/u/64798754?v=4&s=48" width="48" height="48" alt="stakeswky" title="stakeswky"/></a> <a href="https://github.com/AbhisekBasu1"><img src="https://avatars.githubusercontent.com/u/40645221?v=4&s=48" width="48" height="48" alt="abhisekbasu1" title="abhisekbasu1"/></a> <a href="https://github.com/MisterGuy420"><img src="https://avatars.githubusercontent.com/u/255743668?v=4&s=48" width="48" height="48" alt="MisterGuy420" title="MisterGuy420"/></a>
  <a href="https://github.com/hsrvc"><img src="https://avatars.githubusercontent.com/u/129702169?v=4&s=48" width="48" height="48" alt="hsrvc" title="hsrvc"/></a> <a href="https://github.com/nabbilkhan"><img src="https://avatars.githubusercontent.com/u/203121263?v=4&s=48" width="48" height="48" alt="nabbilkhan" title="nabbilkhan"/></a> <a href="https://github.com/aldoeliacim"><img src="https://avatars.githubusercontent.com/u/17973757?v=4&s=48" width="48" height="48" alt="aldoeliacim" title="aldoeliacim"/></a> <a href="https://github.com/jamesgroat"><img src="https://avatars.githubusercontent.com/u/2634024?v=4&s=48" width="48" height="48" alt="jamesgroat" title="jamesgroat"/></a> <a href="https://github.com/orlyjamie"><img src="https://avatars.githubusercontent.com/u/6668807?v=4&s=48" width="48" height="48" alt="orlyjamie" title="orlyjamie"/></a> <a href="https://github.com/Elarwei001"><img src="https://avatars.githubusercontent.com/u/168552401?v=4&s=48" width="48" height="48" alt="Elarwei001" title="Elarwei001"/></a> <a href="https://github.com/rubyrunsstuff"><img src="https://avatars.githubusercontent.com/u/246602379?v=4&s=48" width="48" height="48" alt="rubyrunsstuff" title="rubyrunsstuff"/></a> <a href="https://github.com/Phineas1500"><img src="https://avatars.githubusercontent.com/u/41450967?v=4&s=48" width="48" height="48" alt="Phineas1500" title="Phineas1500"/></a> <a href="https://github.com/meaningfool"><img src="https://avatars.githubusercontent.com/u/2862331?v=4&s=48" width="48" height="48" alt="meaningfool" title="meaningfool"/></a> <a href="https://github.com/sfo2001"><img src="https://avatars.githubusercontent.com/u/103369858?v=4&s=48" width="48" height="48" alt="sfo2001" title="sfo2001"/></a>
  <a href="https://github.com/Marvae"><img src="https://avatars.githubusercontent.com/u/11957602?v=4&s=48" width="48" height="48" alt="Marvae" title="Marvae"/></a> <a href="https://github.com/liuy"><img src="https://avatars.githubusercontent.com/u/1192888?v=4&s=48" width="48" height="48" alt="liuy" title="liuy"/></a> <a href="https://github.com/shtse8"><img src="https://avatars.githubusercontent.com/u/8020099?v=4&s=48" width="48" height="48" alt="shtse8" title="shtse8"/></a> <a href="https://github.com/thebenignhacker"><img src="https://avatars.githubusercontent.com/u/32418586?v=4&s=48" width="48" height="48" alt="thebenignhacker" title="thebenignhacker"/></a> <a href="https://github.com/carrotRakko"><img src="https://avatars.githubusercontent.com/u/24588751?v=4&s=48" width="48" height="48" alt="carrotRakko" title="carrotRakko"/></a> <a href="https://github.com/ranausmanai"><img src="https://avatars.githubusercontent.com/u/257128159?v=4&s=48" width="48" height="48" alt="ranausmanai" title="ranausmanai"/></a> <a href="https://github.com/kevinWangSheng"><img src="https://avatars.githubusercontent.com/u/118158941?v=4&s=48" width="48" height="48" alt="kevinWangSheng" title="kevinWangSheng"/></a> <a href="https://github.com/gregmousseau"><img src="https://avatars.githubusercontent.com/u/5036458?v=4&s=48" width="48" height="48" alt="gregmousseau" title="gregmousseau"/></a> <a href="https://github.com/rrenamed"><img src="https://avatars.githubusercontent.com/u/87486610?v=4&s=48" width="48" height="48" alt="rrenamed" title="rrenamed"/></a> <a href="https://github.com/akoscz"><img src="https://avatars.githubusercontent.com/u/1360047?v=4&s=48" width="48" height="48" alt="akoscz" title="akoscz"/></a>
  <a href="https://github.com/jarvis-medmatic"><img src="https://avatars.githubusercontent.com/u/252428873?v=4&s=48" width="48" height="48" alt="jarvis-medmatic" title="jarvis-medmatic"/></a> <a href="https://github.com/danielz1z"><img src="https://avatars.githubusercontent.com/u/235270390?v=4&s=48" width="48" height="48" alt="danielz1z" title="danielz1z"/></a> <a href="https://github.com/pandego"><img src="https://avatars.githubusercontent.com/u/7780875?v=4&s=48" width="48" height="48" alt="pandego" title="pandego"/></a> <a href="https://github.com/xadenryan"><img src="https://avatars.githubusercontent.com/u/165437834?v=4&s=48" width="48" height="48" alt="xadenryan" title="xadenryan"/></a> <a href="https://github.com/NicholasSpisak"><img src="https://avatars.githubusercontent.com/u/129075147?v=4&s=48" width="48" height="48" alt="NicholasSpisak" title="NicholasSpisak"/></a> <a href="https://github.com/graysurf"><img src="https://avatars.githubusercontent.com/u/10785178?v=4&s=48" width="48" height="48" alt="graysurf" title="graysurf"/></a> <a href="https://github.com/gupsammy"><img src="https://avatars.githubusercontent.com/u/20296019?v=4&s=48" width="48" height="48" alt="gupsammy" title="gupsammy"/></a> <a href="https://github.com/nyanjou"><img src="https://avatars.githubusercontent.com/u/258645604?v=4&s=48" width="48" height="48" alt="nyanjou" title="nyanjou"/></a> <a href="https://github.com/sibbl"><img src="https://avatars.githubusercontent.com/u/866535?v=4&s=48" width="48" height="48" alt="sibbl" title="sibbl"/></a> <a href="https://github.com/gejifeng"><img src="https://avatars.githubusercontent.com/u/17561857?v=4&s=48" width="48" height="48" alt="gejifeng" title="gejifeng"/></a>
  <a href="https://github.com/ide-rea"><img src="https://avatars.githubusercontent.com/u/30512600?v=4&s=48" width="48" height="48" alt="ide-rea" title="ide-rea"/></a> <a href="https://github.com/leszekszpunar"><img src="https://avatars.githubusercontent.com/u/13106764?v=4&s=48" width="48" height="48" alt="leszekszpunar" title="leszekszpunar"/></a> <a href="https://github.com/Yida-Dev"><img src="https://avatars.githubusercontent.com/u/92713555?v=4&s=48" width="48" height="48" alt="Yida-Dev" title="Yida-Dev"/></a> <a href="https://github.com/AI-Reviewer-QS"><img src="https://avatars.githubusercontent.com/u/255312808?v=4&s=48" width="48" height="48" alt="AI-Reviewer-QS" title="AI-Reviewer-QS"/></a> <a href="https://github.com/SocialNerd42069"><img src="https://avatars.githubusercontent.com/u/118244303?v=4&s=48" width="48" height="48" alt="SocialNerd42069" title="SocialNerd42069"/></a> <a href="https://github.com/maxsumrall"><img src="https://avatars.githubusercontent.com/u/628843?v=4&s=48" width="48" height="48" alt="maxsumrall" title="maxsumrall"/></a> <a href="https://github.com/hougangdev"><img src="https://avatars.githubusercontent.com/u/105773686?v=4&s=48" width="48" height="48" alt="hougangdev" title="hougangdev"/></a> <a href="https://github.com/Minidoracat"><img src="https://avatars.githubusercontent.com/u/11269639?v=4&s=48" width="48" height="48" alt="Minidoracat" title="Minidoracat"/></a> <a href="https://github.com/AnonO6"><img src="https://avatars.githubusercontent.com/u/124311066?v=4&s=48" width="48" height="48" alt="AnonO6" title="AnonO6"/></a> <a href="https://github.com/sreekaransrinath"><img src="https://avatars.githubusercontent.com/u/50989977?v=4&s=48" width="48" height="48" alt="sreekaransrinath" title="sreekaransrinath"/></a>
  <a href="https://github.com/YuzuruS"><img src="https://avatars.githubusercontent.com/u/1485195?v=4&s=48" width="48" height="48" alt="YuzuruS" title="YuzuruS"/></a> <a href="https://github.com/riccardogiorato"><img src="https://avatars.githubusercontent.com/u/4527364?v=4&s=48" width="48" height="48" alt="riccardogiorato" title="riccardogiorato"/></a> <a href="https://github.com/Bridgerz"><img src="https://avatars.githubusercontent.com/u/24499532?v=4&s=48" width="48" height="48" alt="Bridgerz" title="Bridgerz"/></a> <a href="https://github.com/Mrseenz"><img src="https://avatars.githubusercontent.com/u/101962919?v=4&s=48" width="48" height="48" alt="Mrseenz" title="Mrseenz"/></a> <a href="https://github.com/buddyh"><img src="https://avatars.githubusercontent.com/u/31752869?v=4&s=48" width="48" height="48" alt="buddyh" title="buddyh"/></a> <a href="https://github.com/omniwired"><img src="https://avatars.githubusercontent.com/u/322761?v=4&s=48" width="48" height="48" alt="Eng. Juan Combetto" title="Eng. Juan Combetto"/></a> <a href="https://github.com/peschee"><img src="https://avatars.githubusercontent.com/u/63866?v=4&s=48" width="48" height="48" alt="peschee" title="peschee"/></a> <a href="https://github.com/cash-echo-bot"><img src="https://avatars.githubusercontent.com/u/252747386?v=4&s=48" width="48" height="48" alt="cash-echo-bot" title="cash-echo-bot"/></a> <a href="https://github.com/jalehman"><img src="https://avatars.githubusercontent.com/u/550978?v=4&s=48" width="48" height="48" alt="jalehman" title="jalehman"/></a> <a href="https://github.com/zknicker"><img src="https://avatars.githubusercontent.com/u/1164085?v=4&s=48" width="48" height="48" alt="zknicker" title="zknicker"/></a>
  <a href="https://github.com/buerbaumer"><img src="https://avatars.githubusercontent.com/u/44548809?v=4&s=48" width="48" height="48" alt="Harald Buerbaumer" title="Harald Buerbaumer"/></a> <a href="https://github.com/taw0002"><img src="https://avatars.githubusercontent.com/u/42811278?v=4&s=48" width="48" height="48" alt="taw0002" title="taw0002"/></a> <a href="https://github.com/scald"><img src="https://avatars.githubusercontent.com/u/1215913?v=4&s=48" width="48" height="48" alt="scald" title="scald"/></a> <a href="https://github.com/openperf"><img src="https://avatars.githubusercontent.com/u/80630709?v=4&s=48" width="48" height="48" alt="openperf" title="openperf"/></a> <a href="https://github.com/BUGKillerKing"><img src="https://avatars.githubusercontent.com/u/117326392?v=4&s=48" width="48" height="48" alt="BUGKillerKing" title="BUGKillerKing"/></a> <a href="https://github.com/Oceanswave"><img src="https://avatars.githubusercontent.com/u/760674?v=4&s=48" width="48" height="48" alt="Oceanswave" title="Oceanswave"/></a> <a href="https://github.com/patelhiren"><img src="https://avatars.githubusercontent.com/u/172098?v=4&s=48" width="48" height="48" alt="Hiren Patel" title="Hiren Patel"/></a> <a href="https://github.com/kiranjd"><img src="https://avatars.githubusercontent.com/u/25822851?v=4&s=48" width="48" height="48" alt="kiranjd" title="kiranjd"/></a> <a href="https://github.com/antons"><img src="https://avatars.githubusercontent.com/u/129705?v=4&s=48" width="48" height="48" alt="antons" title="antons"/></a> <a href="https://github.com/dan-dr"><img src="https://avatars.githubusercontent.com/u/6669808?v=4&s=48" width="48" height="48" alt="dan-dr" title="dan-dr"/></a>
  <a href="https://github.com/jadilson12"><img src="https://avatars.githubusercontent.com/u/36805474?v=4&s=48" width="48" height="48" alt="jadilson12" title="jadilson12"/></a> <a href="https://github.com/sumleo"><img src="https://avatars.githubusercontent.com/u/29517764?v=4&s=48" width="48" height="48" alt="sumleo" title="sumleo"/></a> <a href="https://github.com/Whoaa512"><img src="https://avatars.githubusercontent.com/u/1581943?v=4&s=48" width="48" height="48" alt="Whoaa512" title="Whoaa512"/></a> <a href="https://github.com/luijoc"><img src="https://avatars.githubusercontent.com/u/96428056?v=4&s=48" width="48" height="48" alt="luijoc" title="luijoc"/></a> <a href="https://github.com/niceysam"><img src="https://avatars.githubusercontent.com/u/256747835?v=4&s=48" width="48" height="48" alt="niceysam" title="niceysam"/></a> <a href="https://github.com/JustYannicc"><img src="https://avatars.githubusercontent.com/u/52761674?v=4&s=48" width="48" height="48" alt="JustYannicc" title="JustYannicc"/></a> <a href="https://github.com/emanuelst"><img src="https://avatars.githubusercontent.com/u/9994339?v=4&s=48" width="48" height="48" alt="emanuelst" title="emanuelst"/></a> <a href="https://github.com/TsekaLuk"><img src="https://avatars.githubusercontent.com/u/79151285?v=4&s=48" width="48" height="48" alt="TsekaLuk" title="TsekaLuk"/></a> <a href="https://github.com/JustasMonkev"><img src="https://avatars.githubusercontent.com/u/59362982?v=4&s=48" width="48" height="48" alt="JustasM" title="JustasM"/></a> <a href="https://github.com/loiie45e"><img src="https://avatars.githubusercontent.com/u/15420100?v=4&s=48" width="48" height="48" alt="loiie45e" title="loiie45e"/></a>
  <a href="https://github.com/davidguttman"><img src="https://avatars.githubusercontent.com/u/431696?v=4&s=48" width="48" height="48" alt="davidguttman" title="davidguttman"/></a> <a href="https://github.com/natefikru"><img src="https://avatars.githubusercontent.com/u/10344644?v=4&s=48" width="48" height="48" alt="natefikru" title="natefikru"/></a> <a href="https://github.com/dougvk"><img src="https://avatars.githubusercontent.com/u/401660?v=4&s=48" width="48" height="48" alt="dougvk" title="dougvk"/></a> <a href="https://github.com/koala73"><img src="https://avatars.githubusercontent.com/u/996596?v=4&s=48" width="48" height="48" alt="koala73" title="koala73"/></a> <a href="https://github.com/mkbehr"><img src="https://avatars.githubusercontent.com/u/1285?v=4&s=48" width="48" height="48" alt="mkbehr" title="mkbehr"/></a> <a href="https://github.com/zats"><img src="https://avatars.githubusercontent.com/u/2688806?v=4&s=48" width="48" height="48" alt="zats" title="zats"/></a> <a href="https://github.com/simonemacario"><img src="https://avatars.githubusercontent.com/u/2116609?v=4&s=48" width="48" height="48" alt="Simone Macario" title="Simone Macario"/></a> <a href="https://github.com/openclaw-bot"><img src="https://avatars.githubusercontent.com/u/258178069?v=4&s=48" width="48" height="48" alt="openclaw-bot" title="openclaw-bot"/></a> <a href="https://github.com/ENCHIGO"><img src="https://avatars.githubusercontent.com/u/38551565?v=4&s=48" width="48" height="48" alt="ENCHIGO" title="ENCHIGO"/></a> <a href="https://github.com/mteam88"><img src="https://avatars.githubusercontent.com/u/84196639?v=4&s=48" width="48" height="48" alt="mteam88" title="mteam88"/></a>
  <a href="https://github.com/Blakeshannon"><img src="https://avatars.githubusercontent.com/u/257822860?v=4&s=48" width="48" height="48" alt="Blakeshannon" title="Blakeshannon"/></a> <a href="https://github.com/gabriel-trigo"><img src="https://avatars.githubusercontent.com/u/38991125?v=4&s=48" width="48" height="48" alt="gabriel-trigo" title="gabriel-trigo"/></a> <a href="https://github.com/neist"><img src="https://avatars.githubusercontent.com/u/1029724?v=4&s=48" width="48" height="48" alt="neist" title="neist"/></a> <a href="https://github.com/pejmanjohn"><img src="https://avatars.githubusercontent.com/u/481729?v=4&s=48" width="48" height="48" alt="pejmanjohn" title="pejmanjohn"/></a> <a href="https://github.com/durenzidu"><img src="https://avatars.githubusercontent.com/u/38130340?v=4&s=48" width="48" height="48" alt="durenzidu" title="durenzidu"/></a> <a href="https://github.com/Ryan-Haines"><img src="https://avatars.githubusercontent.com/u/1855752?v=4&s=48" width="48" height="48" alt="Ryan Haines" title="Ryan Haines"/></a> <a href="https://github.com/hclsys"><img src="https://avatars.githubusercontent.com/u/7755017?v=4&s=48" width="48" height="48" alt="hcl" title="hcl"/></a> <a href="https://github.com/xuhao1"><img src="https://avatars.githubusercontent.com/u/5087930?v=4&s=48" width="48" height="48" alt="XuHao" title="XuHao"/></a> <a href="https://github.com/benithors"><img src="https://avatars.githubusercontent.com/u/20652882?v=4&s=48" width="48" height="48" alt="benithors" title="benithors"/></a> <a href="https://github.com/bitfoundry-ai"><img src="https://avatars.githubusercontent.com/u/239082898?v=4&s=48" width="48" height="48" alt="bitfoundry-ai" title="bitfoundry-ai"/></a>
  <a href="https://github.com/HeMuling"><img src="https://avatars.githubusercontent.com/u/74801533?v=4&s=48" width="48" height="48" alt="HeMuling" title="HeMuling"/></a> <a href="https://github.com/markmusson"><img src="https://avatars.githubusercontent.com/u/4801649?v=4&s=48" width="48" height="48" alt="markmusson" title="markmusson"/></a> <a href="https://github.com/ameno-"><img src="https://avatars.githubusercontent.com/u/2416135?v=4&s=48" width="48" height="48" alt="ameno-" title="ameno-"/></a> <a href="https://github.com/battman21"><img src="https://avatars.githubusercontent.com/u/2656916?v=4&s=48" width="48" height="48" alt="battman21" title="battman21"/></a> <a href="https://github.com/BinHPdev"><img src="https://avatars.githubusercontent.com/u/219093083?v=4&s=48" width="48" height="48" alt="BinHPdev" title="BinHPdev"/></a> <a href="https://github.com/dguido"><img src="https://avatars.githubusercontent.com/u/294844?v=4&s=48" width="48" height="48" alt="dguido" title="dguido"/></a> <a href="https://github.com/evalexpr"><img src="https://avatars.githubusercontent.com/u/23485511?v=4&s=48" width="48" height="48" alt="evalexpr" title="evalexpr"/></a> <a href="https://github.com/guirguispierre"><img src="https://avatars.githubusercontent.com/u/22091706?v=4&s=48" width="48" height="48" alt="guirguispierre" title="guirguispierre"/></a> <a href="https://github.com/henrino3"><img src="https://avatars.githubusercontent.com/u/4260288?v=4&s=48" width="48" height="48" alt="henrino3" title="henrino3"/></a> <a href="https://github.com/joeykrug"><img src="https://avatars.githubusercontent.com/u/5925937?v=4&s=48" width="48" height="48" alt="joeykrug" title="joeykrug"/></a>
  <a href="https://github.com/loganprit"><img src="https://avatars.githubusercontent.com/u/72722788?v=4&s=48" width="48" height="48" alt="loganprit" title="loganprit"/></a> <a href="https://github.com/odysseus0"><img src="https://avatars.githubusercontent.com/u/8635094?v=4&s=48" width="48" height="48" alt="odysseus0" title="odysseus0"/></a> <a href="https://github.com/dbachelder"><img src="https://avatars.githubusercontent.com/u/325706?v=4&s=48" width="48" height="48" alt="dbachelder" title="dbachelder"/></a> <a href="https://github.com/divanoli"><img src="https://avatars.githubusercontent.com/u/12023205?v=4&s=48" width="48" height="48" alt="Divanoli Mydeen Pitchai" title="Divanoli Mydeen Pitchai"/></a> <a href="https://github.com/liuxiaopai-ai"><img src="https://avatars.githubusercontent.com/u/73659136?v=4&s=48" width="48" height="48" alt="liuxiaopai-ai" title="liuxiaopai-ai"/></a> <a href="https://github.com/theSamPadilla"><img src="https://avatars.githubusercontent.com/u/35386211?v=4&s=48" width="48" height="48" alt="Sam Padilla" title="Sam Padilla"/></a> <a href="https://github.com/pvtclawn"><img src="https://avatars.githubusercontent.com/u/258811507?v=4&s=48" width="48" height="48" alt="pvtclawn" title="pvtclawn"/></a> <a href="https://github.com/seheepeak"><img src="https://avatars.githubusercontent.com/u/134766597?v=4&s=48" width="48" height="48" alt="seheepeak" title="seheepeak"/></a> <a href="https://github.com/TSavo"><img src="https://avatars.githubusercontent.com/u/877990?v=4&s=48" width="48" height="48" alt="TSavo" title="TSavo"/></a> <a href="https://github.com/nachoiacovino"><img src="https://avatars.githubusercontent.com/u/50103937?v=4&s=48" width="48" height="48" alt="nachoiacovino" title="nachoiacovino"/></a>
  <a href="https://github.com/misterdas"><img src="https://avatars.githubusercontent.com/u/170702047?v=4&s=48" width="48" height="48" alt="misterdas" title="misterdas"/></a> <a href="https://github.com/xzq-xu"><img src="https://avatars.githubusercontent.com/u/53989315?v=4&s=48" width="48" height="48" alt="LeftX" title="LeftX"/></a> <a href="https://github.com/badlogic"><img src="https://avatars.githubusercontent.com/u/514052?v=4&s=48" width="48" height="48" alt="badlogic" title="badlogic"/></a> <a href="https://github.com/Shuai-DaiDai"><img src="https://avatars.githubusercontent.com/u/134567396?v=4&s=48" width="48" height="48" alt="Shuai-DaiDai" title="Shuai-DaiDai"/></a> <a href="https://github.com/mousberg"><img src="https://avatars.githubusercontent.com/u/57605064?v=4&s=48" width="48" height="48" alt="mousberg" title="mousberg"/></a> <a href="https://github.com/harhogefoo"><img src="https://avatars.githubusercontent.com/u/11906529?v=4&s=48" width="48" height="48" alt="Masataka Shinohara" title="Masataka Shinohara"/></a> <a href="https://github.com/BillChirico"><img src="https://avatars.githubusercontent.com/u/13951316?v=4&s=48" width="48" height="48" alt="BillChirico" title="BillChirico"/></a> <a href="https://github.com/lewiswigmore"><img src="https://avatars.githubusercontent.com/u/58551848?v=4&s=48" width="48" height="48" alt="Lewis" title="Lewis"/></a> <a href="https://github.com/solstead"><img src="https://avatars.githubusercontent.com/u/168413654?v=4&s=48" width="48" height="48" alt="solstead" title="solstead"/></a> <a href="https://github.com/julianengel"><img src="https://avatars.githubusercontent.com/u/10634231?v=4&s=48" width="48" height="48" alt="julianengel" title="julianengel"/></a>
  <a href="https://github.com/dantelex"><img src="https://avatars.githubusercontent.com/u/631543?v=4&s=48" width="48" height="48" alt="dantelex" title="dantelex"/></a> <a href="https://github.com/sahilsatralkar"><img src="https://avatars.githubusercontent.com/u/62758655?v=4&s=48" width="48" height="48" alt="sahilsatralkar" title="sahilsatralkar"/></a> <a href="https://github.com/kkarimi"><img src="https://avatars.githubusercontent.com/u/875218?v=4&s=48" width="48" height="48" alt="kkarimi" title="kkarimi"/></a> <a href="https://github.com/mahmoudashraf93"><img src="https://avatars.githubusercontent.com/u/9130129?v=4&s=48" width="48" height="48" alt="mahmoudashraf93" title="mahmoudashraf93"/></a> <a href="https://github.com/pkrmf"><img src="https://avatars.githubusercontent.com/u/1714267?v=4&s=48" width="48" height="48" alt="pkrmf" title="pkrmf"/></a> <a href="https://github.com/ryan-crabbe"><img src="https://avatars.githubusercontent.com/u/128659760?v=4&s=48" width="48" height="48" alt="ryan-crabbe" title="ryan-crabbe"/></a> <a href="https://github.com/miloudbelarebia"><img src="https://avatars.githubusercontent.com/u/136994453?v=4&s=48" width="48" height="48" alt="miloudbelarebia" title="miloudbelarebia"/></a> <a href="https://github.com/Mellowambience"><img src="https://avatars.githubusercontent.com/u/40958792?v=4&s=48" width="48" height="48" alt="Mars" title="Mars"/></a> <a href="https://github.com/El-Fitz"><img src="https://avatars.githubusercontent.com/u/8971906?v=4&s=48" width="48" height="48" alt="El-Fitz" title="El-Fitz"/></a> <a href="https://github.com/mcrolly"><img src="https://avatars.githubusercontent.com/u/60803337?v=4&s=48" width="48" height="48" alt="McRolly NWANGWU" title="McRolly NWANGWU"/></a>
  <a href="https://github.com/carlulsoe"><img src="https://avatars.githubusercontent.com/u/34673973?v=4&s=48" width="48" height="48" alt="carlulsoe" title="carlulsoe"/></a> <a href="https://github.com/Dithilli"><img src="https://avatars.githubusercontent.com/u/41286037?v=4&s=48" width="48" height="48" alt="Dithilli" title="Dithilli"/></a> <a href="https://github.com/emonty"><img src="https://avatars.githubusercontent.com/u/95156?v=4&s=48" width="48" height="48" alt="emonty" title="emonty"/></a> <a href="https://github.com/fal3"><img src="https://avatars.githubusercontent.com/u/6484295?v=4&s=48" width="48" height="48" alt="fal3" title="fal3"/></a> <a href="https://github.com/mitschabaude-bot"><img src="https://avatars.githubusercontent.com/u/247582884?v=4&s=48" width="48" height="48" alt="mitschabaude-bot" title="mitschabaude-bot"/></a> <a href="https://github.com/benostein"><img src="https://avatars.githubusercontent.com/u/31802821?v=4&s=48" width="48" height="48" alt="benostein" title="benostein"/></a> <a href="https://github.com/PeterShanxin"><img src="https://avatars.githubusercontent.com/u/128674037?v=4&s=48" width="48" height="48" alt="LI SHANXIN" title="LI SHANXIN"/></a> <a href="https://github.com/magendary"><img src="https://avatars.githubusercontent.com/u/30611068?v=4&s=48" width="48" height="48" alt="magendary" title="magendary"/></a> <a href="https://github.com/mahanandhi"><img src="https://avatars.githubusercontent.com/u/46371575?v=4&s=48" width="48" height="48" alt="mahanandhi" title="mahanandhi"/></a> <a href="https://github.com/CashWilliams"><img src="https://avatars.githubusercontent.com/u/613573?v=4&s=48" width="48" height="48" alt="CashWilliams" title="CashWilliams"/></a>
  <a href="https://github.com/j2h4u"><img src="https://avatars.githubusercontent.com/u/39818683?v=4&s=48" width="48" height="48" alt="j2h4u" title="j2h4u"/></a> <a href="https://github.com/bsormagec"><img src="https://avatars.githubusercontent.com/u/965219?v=4&s=48" width="48" height="48" alt="bsormagec" title="bsormagec"/></a> <a href="https://github.com/jessy2027"><img src="https://avatars.githubusercontent.com/u/89694096?v=4&s=48" width="48" height="48" alt="Jessy LANGE" title="Jessy LANGE"/></a> <a href="https://github.com/aerolalit"><img src="https://avatars.githubusercontent.com/u/17166039?v=4&s=48" width="48" height="48" alt="Lalit Singh" title="Lalit Singh"/></a> <a href="https://github.com/hyf0-agent"><img src="https://avatars.githubusercontent.com/u/258783736?v=4&s=48" width="48" height="48" alt="hyf0-agent" title="hyf0-agent"/></a> <a href="https://github.com/andranik-sahakyan"><img src="https://avatars.githubusercontent.com/u/8908029?v=4&s=48" width="48" height="48" alt="andranik-sahakyan" title="andranik-sahakyan"/></a> <a href="https://github.com/unisone"><img src="https://avatars.githubusercontent.com/u/32521398?v=4&s=48" width="48" height="48" alt="unisone" title="unisone"/></a> <a href="https://github.com/jeann2013"><img src="https://avatars.githubusercontent.com/u/3299025?v=4&s=48" width="48" height="48" alt="jeann2013" title="jeann2013"/></a> <a href="https://github.com/jogelin"><img src="https://avatars.githubusercontent.com/u/954509?v=4&s=48" width="48" height="48" alt="jogelin" title="jogelin"/></a> <a href="https://github.com/rmorse"><img src="https://avatars.githubusercontent.com/u/853547?v=4&s=48" width="48" height="48" alt="rmorse" title="rmorse"/></a>
  <a href="https://github.com/scz2011"><img src="https://avatars.githubusercontent.com/u/9337506?v=4&s=48" width="48" height="48" alt="scz2011" title="scz2011"/></a> <a href="https://github.com/wes-davis"><img src="https://avatars.githubusercontent.com/u/16506720?v=4&s=48" width="48" height="48" alt="wes-davis" title="wes-davis"/></a> <a href="https://github.com/popomore"><img src="https://avatars.githubusercontent.com/u/360661?v=4&s=48" width="48" height="48" alt="popomore" title="popomore"/></a> <a href="https://github.com/cathrynlavery"><img src="https://avatars.githubusercontent.com/u/50469282?v=4&s=48" width="48" height="48" alt="cathrynlavery" title="cathrynlavery"/></a> <a href="https://github.com/Iamadig"><img src="https://avatars.githubusercontent.com/u/102129234?v=4&s=48" width="48" height="48" alt="iamadig" title="iamadig"/></a> <a href="https://github.com/vsabavat"><img src="https://avatars.githubusercontent.com/u/50385532?v=4&s=48" width="48" height="48" alt="Vasanth Rao Naik Sabavat" title="Vasanth Rao Naik Sabavat"/></a> <a href="https://github.com/jscaldwell55"><img src="https://avatars.githubusercontent.com/u/111952840?v=4&s=48" width="48" height="48" alt="Jay Caldwell" title="Jay Caldwell"/></a> <a href="https://github.com/gut-puncture"><img src="https://avatars.githubusercontent.com/u/75851986?v=4&s=48" width="48" height="48" alt="Shailesh" title="Shailesh"/></a> <a href="https://github.com/KirillShchetinin"><img src="https://avatars.githubusercontent.com/u/13061871?v=4&s=48" width="48" height="48" alt="Kirill Shchetynin" title="Kirill Shchetynin"/></a> <a href="https://github.com/ruypang"><img src="https://avatars.githubusercontent.com/u/46941315?v=4&s=48" width="48" height="48" alt="ruypang" title="ruypang"/></a>
  <a href="https://github.com/mitchmcalister"><img src="https://avatars.githubusercontent.com/u/209334?v=4&s=48" width="48" height="48" alt="mitchmcalister" title="mitchmcalister"/></a> <a href="https://github.com/pvoo"><img src="https://avatars.githubusercontent.com/u/20116814?v=4&s=48" width="48" height="48" alt="Paul van Oorschot" title="Paul van Oorschot"/></a> <a href="https://github.com/guxu11"><img src="https://avatars.githubusercontent.com/u/53551744?v=4&s=48" width="48" height="48" alt="Xu Gu" title="Xu Gu"/></a> <a href="https://github.com/lml2468"><img src="https://avatars.githubusercontent.com/u/39320777?v=4&s=48" width="48" height="48" alt="Menglin Li" title="Menglin Li"/></a> <a href="https://github.com/artuskg"><img src="https://avatars.githubusercontent.com/u/11966157?v=4&s=48" width="48" height="48" alt="artuskg" title="artuskg"/></a> <a href="https://github.com/jackheuberger"><img src="https://avatars.githubusercontent.com/u/7830838?v=4&s=48" width="48" height="48" alt="jackheuberger" title="jackheuberger"/></a> <a href="https://github.com/imfing"><img src="https://avatars.githubusercontent.com/u/5097752?v=4&s=48" width="48" height="48" alt="imfing" title="imfing"/></a> <a href="https://github.com/superman32432432"><img src="https://avatars.githubusercontent.com/u/7228420?v=4&s=48" width="48" height="48" alt="superman32432432" title="superman32432432"/></a> <a href="https://github.com/Syhids"><img src="https://avatars.githubusercontent.com/u/671202?v=4&s=48" width="48" height="48" alt="Syhids" title="Syhids"/></a> <a href="https://github.com/Zitzak"><img src="https://avatars.githubusercontent.com/u/43185740?v=4&s=48" width="48" height="48" alt="Marvin" title="Marvin"/></a>
  <a href="https://github.com/DrCrinkle"><img src="https://avatars.githubusercontent.com/u/62564740?v=4&s=48" width="48" height="48" alt="Taylor Asplund" title="Taylor Asplund"/></a> <a href="https://github.com/dakshaymehta"><img src="https://avatars.githubusercontent.com/u/50276213?v=4&s=48" width="48" height="48" alt="dakshaymehta" title="dakshaymehta"/></a> <a href="https://github.com/stefangalescu"><img src="https://avatars.githubusercontent.com/u/52995748?v=4&s=48" width="48" height="48" alt="Stefan Galescu" title="Stefan Galescu"/></a> <a href="https://github.com/lploc94"><img src="https://avatars.githubusercontent.com/u/28453843?v=4&s=48" width="48" height="48" alt="lploc94" title="lploc94"/></a> <a href="https://github.com/WalterSumbon"><img src="https://avatars.githubusercontent.com/u/45062253?v=4&s=48" width="48" height="48" alt="WalterSumbon" title="WalterSumbon"/></a> <a href="https://github.com/krizpoon"><img src="https://avatars.githubusercontent.com/u/1977532?v=4&s=48" width="48" height="48" alt="krizpoon" title="krizpoon"/></a> <a href="https://github.com/EnzeD"><img src="https://avatars.githubusercontent.com/u/9866900?v=4&s=48" width="48" height="48" alt="EnzeD" title="EnzeD"/></a> <a href="https://github.com/Evizero"><img src="https://avatars.githubusercontent.com/u/10854026?v=4&s=48" width="48" height="48" alt="Evizero" title="Evizero"/></a> <a href="https://github.com/Grynn"><img src="https://avatars.githubusercontent.com/u/212880?v=4&s=48" width="48" height="48" alt="Grynn" title="Grynn"/></a> <a href="https://github.com/hydro13"><img src="https://avatars.githubusercontent.com/u/6640526?v=4&s=48" width="48" height="48" alt="hydro13" title="hydro13"/></a>
  <a href="https://github.com/jverdi"><img src="https://avatars.githubusercontent.com/u/345050?v=4&s=48" width="48" height="48" alt="jverdi" title="jverdi"/></a> <a href="https://github.com/kentaro"><img src="https://avatars.githubusercontent.com/u/3458?v=4&s=48" width="48" height="48" alt="kentaro" title="kentaro"/></a> <a href="https://github.com/kunalk16"><img src="https://avatars.githubusercontent.com/u/5303824?v=4&s=48" width="48" height="48" alt="kunalk16" title="kunalk16"/></a> <a href="https://github.com/longmaba"><img src="https://avatars.githubusercontent.com/u/9361500?v=4&s=48" width="48" height="48" alt="longmaba" title="longmaba"/></a> <a href="https://github.com/mjrussell"><img src="https://avatars.githubusercontent.com/u/1641895?v=4&s=48" width="48" height="48" alt="mjrussell" title="mjrussell"/></a> <a href="https://github.com/optimikelabs"><img src="https://avatars.githubusercontent.com/u/31423109?v=4&s=48" width="48" height="48" alt="optimikelabs" title="optimikelabs"/></a> <a href="https://github.com/oswalpalash"><img src="https://avatars.githubusercontent.com/u/6431196?v=4&s=48" width="48" height="48" alt="oswalpalash" title="oswalpalash"/></a> <a href="https://github.com/RamiNoodle733"><img src="https://avatars.githubusercontent.com/u/117773986?v=4&s=48" width="48" height="48" alt="RamiNoodle733" title="RamiNoodle733"/></a> <a href="https://github.com/sauerdaniel"><img src="https://avatars.githubusercontent.com/u/81422812?v=4&s=48" width="48" height="48" alt="sauerdaniel" title="sauerdaniel"/></a> <a href="https://github.com/SleuthCo"><img src="https://avatars.githubusercontent.com/u/259695222?v=4&s=48" width="48" height="48" alt="SleuthCo" title="SleuthCo"/></a>
  <a href="https://github.com/TaKO8Ki"><img src="https://avatars.githubusercontent.com/u/41065217?v=4&s=48" width="48" height="48" alt="TaKO8Ki" title="TaKO8Ki"/></a> <a href="https://github.com/travisp"><img src="https://avatars.githubusercontent.com/u/165698?v=4&s=48" width="48" height="48" alt="travisp" title="travisp"/></a> <a href="https://github.com/rodbland2021"><img src="https://avatars.githubusercontent.com/u/86267410?v=4&s=48" width="48" height="48" alt="rodbland2021" title="rodbland2021"/></a> <a href="https://github.com/fagemx"><img src="https://avatars.githubusercontent.com/u/117356295?v=4&s=48" width="48" height="48" alt="fagemx" title="fagemx"/></a> <a href="https://github.com/BigUncle"><img src="https://avatars.githubusercontent.com/u/9360607?v=4&s=48" width="48" height="48" alt="BigUncle" title="BigUncle"/></a> <a href="https://github.com/pycckuu"><img src="https://avatars.githubusercontent.com/u/1489583?v=4&s=48" width="48" height="48" alt="Igor Markelov" title="Igor Markelov"/></a> <a href="https://github.com/zhoulongchao77"><img src="https://avatars.githubusercontent.com/u/65058500?v=4&s=48" width="48" height="48" alt="zhoulc777" title="zhoulc777"/></a> <a href="https://github.com/connorshea"><img src="https://avatars.githubusercontent.com/u/2977353?v=4&s=48" width="48" height="48" alt="connorshea" title="connorshea"/></a> <a href="https://github.com/paceyw"><img src="https://avatars.githubusercontent.com/u/44923937?v=4&s=48" width="48" height="48" alt="TIHU" title="TIHU"/></a> <a href="https://github.com/tonydehnke"><img src="https://avatars.githubusercontent.com/u/36720180?v=4&s=48" width="48" height="48" alt="Tony Dehnke" title="Tony Dehnke"/></a>
  <a href="https://github.com/pablohrcarvalho"><img src="https://avatars.githubusercontent.com/u/66948122?v=4&s=48" width="48" height="48" alt="pablohrcarvalho" title="pablohrcarvalho"/></a> <a href="https://github.com/bonald"><img src="https://avatars.githubusercontent.com/u/12394874?v=4&s=48" width="48" height="48" alt="bonald" title="bonald"/></a> <a href="https://github.com/rhuanssauro"><img src="https://avatars.githubusercontent.com/u/164682191?v=4&s=48" width="48" height="48" alt="rhuanssauro" title="rhuanssauro"/></a> <a href="https://github.com/CommanderCrowCode"><img src="https://avatars.githubusercontent.com/u/72845369?v=4&s=48" width="48" height="48" alt="Tanwa Arpornthip" title="Tanwa Arpornthip"/></a> <a href="https://github.com/webvijayi"><img src="https://avatars.githubusercontent.com/u/49924855?v=4&s=48" width="48" height="48" alt="webvijayi" title="webvijayi"/></a> <a href="https://github.com/tomron87"><img src="https://avatars.githubusercontent.com/u/126325152?v=4&s=48" width="48" height="48" alt="Tom Ron" title="Tom Ron"/></a> <a href="https://github.com/ozbillwang"><img src="https://avatars.githubusercontent.com/u/8954908?v=4&s=48" width="48" height="48" alt="ozbillwang" title="ozbillwang"/></a> <a href="https://github.com/Patrick-Barletta"><img src="https://avatars.githubusercontent.com/u/67929313?v=4&s=48" width="48" height="48" alt="Patrick Barletta" title="Patrick Barletta"/></a> <a href="https://github.com/ianderrington"><img src="https://avatars.githubusercontent.com/u/76016868?v=4&s=48" width="48" height="48" alt="Ian Derrington" title="Ian Derrington"/></a> <a href="https://github.com/austinm911"><img src="https://avatars.githubusercontent.com/u/31991302?v=4&s=48" width="48" height="48" alt="austinm911" title="austinm911"/></a>
  <a href="https://github.com/Ayush10"><img src="https://avatars.githubusercontent.com/u/7945279?v=4&s=48" width="48" height="48" alt="Ayush10" title="Ayush10"/></a> <a href="https://github.com/boris721"><img src="https://avatars.githubusercontent.com/u/257853888?v=4&s=48" width="48" height="48" alt="boris721" title="boris721"/></a> <a href="https://github.com/damoahdominic"><img src="https://avatars.githubusercontent.com/u/4623434?v=4&s=48" width="48" height="48" alt="damoahdominic" title="damoahdominic"/></a> <a href="https://github.com/doodlewind"><img src="https://avatars.githubusercontent.com/u/7312949?v=4&s=48" width="48" height="48" alt="doodlewind" title="doodlewind"/></a> <a href="https://github.com/ikari-pl"><img src="https://avatars.githubusercontent.com/u/811702?v=4&s=48" width="48" height="48" alt="ikari-pl" title="ikari-pl"/></a> <a href="https://github.com/philipp-spiess"><img src="https://avatars.githubusercontent.com/u/458591?v=4&s=48" width="48" height="48" alt="philipp-spiess" title="philipp-spiess"/></a> <a href="https://github.com/shayan919293"><img src="https://avatars.githubusercontent.com/u/60409704?v=4&s=48" width="48" height="48" alt="shayan919293" title="shayan919293"/></a> <a href="https://github.com/Harrington-bot"><img src="https://avatars.githubusercontent.com/u/261410808?v=4&s=48" width="48" height="48" alt="Harrington-bot" title="Harrington-bot"/></a> <a href="https://github.com/nonggialiang"><img src="https://avatars.githubusercontent.com/u/14367839?v=4&s=48" width="48" height="48" alt="nonggia.liang" title="nonggia.liang"/></a> <a href="https://github.com/TinyTb"><img src="https://avatars.githubusercontent.com/u/5957298?v=4&s=48" width="48" height="48" alt="Michael Lee" title="Michael Lee"/></a>
  <a href="https://github.com/OscarMinjarez"><img src="https://avatars.githubusercontent.com/u/86080038?v=4&s=48" width="48" height="48" alt="OscarMinjarez" title="OscarMinjarez"/></a> <a href="https://github.com/claude"><img src="https://avatars.githubusercontent.com/u/81847?v=4&s=48" width="48" height="48" alt="claude" title="claude"/></a> <a href="https://github.com/Alg0rix"><img src="https://avatars.githubusercontent.com/u/53804949?v=4&s=48" width="48" height="48" alt="Alg0rix" title="Alg0rix"/></a> <a href="https://github.com/L-U-C-K-Y"><img src="https://avatars.githubusercontent.com/u/14868134?v=4&s=48" width="48" height="48" alt="Lucky" title="Lucky"/></a> <a href="https://github.com/Kepler2024"><img src="https://avatars.githubusercontent.com/u/166882517?v=4&s=48" width="48" height="48" alt="Harry Cui Kepler" title="Harry Cui Kepler"/></a> <a href="https://github.com/h0tp-ftw"><img src="https://avatars.githubusercontent.com/u/141889580?v=4&s=48" width="48" height="48" alt="h0tp-ftw" title="h0tp-ftw"/></a> <a href="https://github.com/Youyou972"><img src="https://avatars.githubusercontent.com/u/50808411?v=4&s=48" width="48" height="48" alt="Youyou972" title="Youyou972"/></a> <a href="https://github.com/dominicnunez"><img src="https://avatars.githubusercontent.com/u/43616264?v=4&s=48" width="48" height="48" alt="Dominic" title="Dominic"/></a> <a href="https://github.com/danielwanwx"><img src="https://avatars.githubusercontent.com/u/144515713?v=4&s=48" width="48" height="48" alt="danielwanwx" title="danielwanwx"/></a> <a href="https://github.com/0xJonHoldsCrypto"><img src="https://avatars.githubusercontent.com/u/81202085?v=4&s=48" width="48" height="48" alt="0xJonHoldsCrypto" title="0xJonHoldsCrypto"/></a>
  <a href="https://github.com/akyourowngames"><img src="https://avatars.githubusercontent.com/u/123736861?v=4&s=48" width="48" height="48" alt="akyourowngames" title="akyourowngames"/></a> <a href="https://github.com/apps/clawdinator"><img src="https://avatars.githubusercontent.com/in/2607181?v=4&s=48" width="48" height="48" alt="clawdinator[bot]" title="clawdinator[bot]"/></a> <a href="https://github.com/erikpr1994"><img src="https://avatars.githubusercontent.com/u/6299331?v=4&s=48" width="48" height="48" alt="erikpr1994" title="erikpr1994"/></a> <a href="https://github.com/thesash"><img src="https://avatars.githubusercontent.com/u/1166151?v=4&s=48" width="48" height="48" alt="thesash" title="thesash"/></a> <a href="https://github.com/thesomewhatyou"><img src="https://avatars.githubusercontent.com/u/162917831?v=4&s=48" width="48" height="48" alt="thesomewhatyou" title="thesomewhatyou"/></a> <a href="https://github.com/dashed"><img src="https://avatars.githubusercontent.com/u/139499?v=4&s=48" width="48" height="48" alt="dashed" title="dashed"/></a> <a href="https://github.com/minupla"><img src="https://avatars.githubusercontent.com/u/42547246?v=4&s=48" width="48" height="48" alt="Dale Babiy" title="Dale Babiy"/></a> <a href="https://github.com/Diaspar4u"><img src="https://avatars.githubusercontent.com/u/3605840?v=4&s=48" width="48" height="48" alt="Diaspar4u" title="Diaspar4u"/></a> <a href="https://github.com/brianleach"><img src="https://avatars.githubusercontent.com/u/1900805?v=4&s=48" width="48" height="48" alt="brianleach" title="brianleach"/></a> <a href="https://github.com/codexGW"><img src="https://avatars.githubusercontent.com/u/9350182?v=4&s=48" width="48" height="48" alt="codexGW" title="codexGW"/></a>
  <a href="https://github.com/dirbalak"><img src="https://avatars.githubusercontent.com/u/30323349?v=4&s=48" width="48" height="48" alt="dirbalak" title="dirbalak"/></a> <a href="https://github.com/Iranb"><img src="https://avatars.githubusercontent.com/u/49674669?v=4&s=48" width="48" height="48" alt="Iranb" title="Iranb"/></a> <a href="https://github.com/rdev"><img src="https://avatars.githubusercontent.com/u/8418866?v=4&s=48" width="48" height="48" alt="Max" title="Max"/></a> <a href="https://github.com/papago2355"><img src="https://avatars.githubusercontent.com/u/68721273?v=4&s=48" width="48" height="48" alt="TideFinder" title="TideFinder"/></a> <a href="https://github.com/cdorsey"><img src="https://avatars.githubusercontent.com/u/12650570?v=4&s=48" width="48" height="48" alt="Chase Dorsey" title="Chase Dorsey"/></a> <a href="https://github.com/Joly0"><img src="https://avatars.githubusercontent.com/u/13993216?v=4&s=48" width="48" height="48" alt="Joly0" title="Joly0"/></a> <a href="https://github.com/adityashaw2"><img src="https://avatars.githubusercontent.com/u/41204444?v=4&s=48" width="48" height="48" alt="adityashaw2" title="adityashaw2"/></a> <a href="https://github.com/tumf"><img src="https://avatars.githubusercontent.com/u/69994?v=4&s=48" width="48" height="48" alt="tumf" title="tumf"/></a> <a href="https://github.com/slonce70"><img src="https://avatars.githubusercontent.com/u/130596182?v=4&s=48" width="48" height="48" alt="slonce70" title="slonce70"/></a> <a href="https://github.com/alexgleason"><img src="https://avatars.githubusercontent.com/u/3639540?v=4&s=48" width="48" height="48" alt="alexgleason" title="alexgleason"/></a>
  <a href="https://github.com/theonejvo"><img src="https://avatars.githubusercontent.com/u/125909656?v=4&s=48" width="48" height="48" alt="theonejvo" title="theonejvo"/></a> <a href="https://github.com/adao-max"><img src="https://avatars.githubusercontent.com/u/153898832?v=4&s=48" width="48" height="48" alt="Skyler Miao" title="Skyler Miao"/></a> <a href="https://github.com/jlowin"><img src="https://avatars.githubusercontent.com/u/153965?v=4&s=48" width="48" height="48" alt="Jeremiah Lowin" title="Jeremiah Lowin"/></a> <a href="https://github.com/peetzweg"><img src="https://avatars.githubusercontent.com/u/839848?v=4&s=48" width="48" height="48" alt="peetzweg/" title="peetzweg/"/></a> <a href="https://github.com/chrisrodz"><img src="https://avatars.githubusercontent.com/u/2967620?v=4&s=48" width="48" height="48" alt="chrisrodz" title="chrisrodz"/></a> <a href="https://github.com/ghsmc"><img src="https://avatars.githubusercontent.com/u/68118719?v=4&s=48" width="48" height="48" alt="ghsmc" title="ghsmc"/></a> <a href="https://github.com/ibrahimq21"><img src="https://avatars.githubusercontent.com/u/8392472?v=4&s=48" width="48" height="48" alt="ibrahimq21" title="ibrahimq21"/></a> <a href="https://github.com/irtiq7"><img src="https://avatars.githubusercontent.com/u/3823029?v=4&s=48" width="48" height="48" alt="irtiq7" title="irtiq7"/></a> <a href="https://github.com/jdrhyne"><img src="https://avatars.githubusercontent.com/u/7828464?v=4&s=48" width="48" height="48" alt="Jonathan D. Rhyne (DJ-D)" title="Jonathan D. Rhyne (DJ-D)"/></a> <a href="https://github.com/kelvinCB"><img src="https://avatars.githubusercontent.com/u/50544379?v=4&s=48" width="48" height="48" alt="kelvinCB" title="kelvinCB"/></a>
  <a href="https://github.com/mitsuhiko"><img src="https://avatars.githubusercontent.com/u/7396?v=4&s=48" width="48" height="48" alt="mitsuhiko" title="mitsuhiko"/></a> <a href="https://github.com/rybnikov"><img src="https://avatars.githubusercontent.com/u/7761808?v=4&s=48" width="48" height="48" alt="rybnikov" title="rybnikov"/></a> <a href="https://github.com/santiagomed"><img src="https://avatars.githubusercontent.com/u/30184543?v=4&s=48" width="48" height="48" alt="santiagomed" title="santiagomed"/></a> <a href="https://github.com/suminhthanh"><img src="https://avatars.githubusercontent.com/u/2907636?v=4&s=48" width="48" height="48" alt="suminhthanh" title="suminhthanh"/></a> <a href="https://github.com/svkozak"><img src="https://avatars.githubusercontent.com/u/31941359?v=4&s=48" width="48" height="48" alt="svkozak" title="svkozak"/></a> <a href="https://github.com/kaizen403"><img src="https://avatars.githubusercontent.com/u/134706404?v=4&s=48" width="48" height="48" alt="kaizen403" title="kaizen403"/></a> <a href="https://github.com/sleontenko"><img src="https://avatars.githubusercontent.com/u/7135949?v=4&s=48" width="48" height="48" alt="sleontenko" title="sleontenko"/></a> <a href="https://github.com/nk1tz"><img src="https://avatars.githubusercontent.com/u/12980165?v=4&s=48" width="48" height="48" alt="Nate" title="Nate"/></a> <a href="https://github.com/CornBrother0x"><img src="https://avatars.githubusercontent.com/u/101160087?v=4&s=48" width="48" height="48" alt="CornBrother0x" title="CornBrother0x"/></a> <a href="https://github.com/DukeDeSouth"><img src="https://avatars.githubusercontent.com/u/51200688?v=4&s=48" width="48" height="48" alt="DukeDeSouth" title="DukeDeSouth"/></a>
  <a href="https://github.com/crimeacs"><img src="https://avatars.githubusercontent.com/u/35071559?v=4&s=48" width="48" height="48" alt="crimeacs" title="crimeacs"/></a> <a href="https://github.com/liebertar"><img src="https://avatars.githubusercontent.com/u/99405438?v=4&s=48" width="48" height="48" alt="Cklee" title="Cklee"/></a> <a href="https://github.com/garnetlyx"><img src="https://avatars.githubusercontent.com/u/12513503?v=4&s=48" width="48" height="48" alt="Garnet Liu" title="Garnet Liu"/></a> <a href="https://github.com/Bermudarat"><img src="https://avatars.githubusercontent.com/u/10937319?v=4&s=48" width="48" height="48" alt="neverland" title="neverland"/></a> <a href="https://github.com/ryancontent"><img src="https://avatars.githubusercontent.com/u/39743613?v=4&s=48" width="48" height="48" alt="ryan" title="ryan"/></a> <a href="https://github.com/sircrumpet"><img src="https://avatars.githubusercontent.com/u/4436535?v=4&s=48" width="48" height="48" alt="sircrumpet" title="sircrumpet"/></a> <a href="https://github.com/AdeboyeDN"><img src="https://avatars.githubusercontent.com/u/65312338?v=4&s=48" width="48" height="48" alt="AdeboyeDN" title="AdeboyeDN"/></a> <a href="https://github.com/neooriginal"><img src="https://avatars.githubusercontent.com/u/54811660?v=4&s=48" width="48" height="48" alt="Neo" title="Neo"/></a> <a href="https://github.com/asklee-klawd"><img src="https://avatars.githubusercontent.com/u/105007315?v=4&s=48" width="48" height="48" alt="asklee-klawd" title="asklee-klawd"/></a> <a href="https://github.com/benediktjohannes"><img src="https://avatars.githubusercontent.com/u/253604130?v=4&s=48" width="48" height="48" alt="benediktjohannes" title="benediktjohannes"/></a>
  <a href="https://github.com/zhangzhefang-github"><img src="https://avatars.githubusercontent.com/u/34058239?v=4&s=48" width="48" height="48" alt="张哲芳" title="张哲芳"/></a> <a href="https://github.com/constansino"><img src="https://avatars.githubusercontent.com/u/65108260?v=4&s=48" width="48" height="48" alt="constansino" title="constansino"/></a> <a href="https://github.com/yuting0624"><img src="https://avatars.githubusercontent.com/u/32728916?v=4&s=48" width="48" height="48" alt="Yuting Lin" title="Yuting Lin"/></a> <a href="https://github.com/joelnishanth"><img src="https://avatars.githubusercontent.com/u/140015627?v=4&s=48" width="48" height="48" alt="OfflynAI" title="OfflynAI"/></a> <a href="https://github.com/18-RAJAT"><img src="https://avatars.githubusercontent.com/u/78920780?v=4&s=48" width="48" height="48" alt="Rajat Joshi" title="Rajat Joshi"/></a> <a href="https://github.com/pahdo"><img src="https://avatars.githubusercontent.com/u/12799392?v=4&s=48" width="48" height="48" alt="Daniel Zou" title="Daniel Zou"/></a> <a href="https://github.com/manikv12"><img src="https://avatars.githubusercontent.com/u/49544491?v=4&s=48" width="48" height="48" alt="Manik Vahsith" title="Manik Vahsith"/></a> <a href="https://github.com/ProspectOre"><img src="https://avatars.githubusercontent.com/u/54486432?v=4&s=48" width="48" height="48" alt="ProspectOre" title="ProspectOre"/></a> <a href="https://github.com/detecti1"><img src="https://avatars.githubusercontent.com/u/1622461?v=4&s=48" width="48" height="48" alt="Lilo" title="Lilo"/></a> <a href="https://github.com/24601"><img src="https://avatars.githubusercontent.com/u/1157207?v=4&s=48" width="48" height="48" alt="24601" title="24601"/></a>
  <a href="https://github.com/awkoy"><img src="https://avatars.githubusercontent.com/u/13995636?v=4&s=48" width="48" height="48" alt="awkoy" title="awkoy"/></a> <a href="https://github.com/dawondyifraw"><img src="https://avatars.githubusercontent.com/u/9797257?v=4&s=48" width="48" height="48" alt="dawondyifraw" title="dawondyifraw"/></a> <a href="https://github.com/apps/google-labs-jules"><img src="https://avatars.githubusercontent.com/in/842251?v=4&s=48" width="48" height="48" alt="google-labs-jules[bot]" title="google-labs-jules[bot]"/></a> <a href="https://github.com/hyojin"><img src="https://avatars.githubusercontent.com/u/3413183?v=4&s=48" width="48" height="48" alt="hyojin" title="hyojin"/></a> <a href="https://github.com/Kansodata"><img src="https://avatars.githubusercontent.com/u/225288021?v=4&s=48" width="48" height="48" alt="Kansodata" title="Kansodata"/></a> <a href="https://github.com/natedenh"><img src="https://avatars.githubusercontent.com/u/13399956?v=4&s=48" width="48" height="48" alt="natedenh" title="natedenh"/></a> <a href="https://github.com/pi0"><img src="https://avatars.githubusercontent.com/u/5158436?v=4&s=48" width="48" height="48" alt="pi0" title="pi0"/></a> <a href="https://github.com/dddabtc"><img src="https://avatars.githubusercontent.com/u/104875499?v=4&s=48" width="48" height="48" alt="dddabtc" title="dddabtc"/></a> <a href="https://github.com/AkashKobal"><img src="https://avatars.githubusercontent.com/u/98216083?v=4&s=48" width="48" height="48" alt="AkashKobal" title="AkashKobal"/></a> <a href="https://github.com/wu-tian807"><img src="https://avatars.githubusercontent.com/u/61640083?v=4&s=48" width="48" height="48" alt="wu-tian807" title="wu-tian807"/></a>
  <a href="https://github.com/kyleok"><img src="https://avatars.githubusercontent.com/u/58307870?v=4&s=48" width="48" height="48" alt="Ganghyun Kim" title="Ganghyun Kim"/></a> <a href="https://github.com/sbking"><img src="https://avatars.githubusercontent.com/u/3913213?v=4&s=48" width="48" height="48" alt="Stephen Brian King" title="Stephen Brian King"/></a> <a href="https://github.com/tosh-hamburg"><img src="https://avatars.githubusercontent.com/u/58424326?v=4&s=48" width="48" height="48" alt="tosh-hamburg" title="tosh-hamburg"/></a> <a href="https://github.com/John-Rood"><img src="https://avatars.githubusercontent.com/u/62669593?v=4&s=48" width="48" height="48" alt="John Rood" title="John Rood"/></a> <a href="https://github.com/divisonofficer"><img src="https://avatars.githubusercontent.com/u/41609506?v=4&s=48" width="48" height="48" alt="JINNYEONG KIM" title="JINNYEONG KIM"/></a> <a href="https://github.com/dinakars777"><img src="https://avatars.githubusercontent.com/u/250428393?v=4&s=48" width="48" height="48" alt="Dinakar Sarbada" title="Dinakar Sarbada"/></a> <a href="https://github.com/aj47"><img src="https://avatars.githubusercontent.com/u/8023513?v=4&s=48" width="48" height="48" alt="aj47" title="aj47"/></a> <a href="https://github.com/Protocol-zero-0"><img src="https://avatars.githubusercontent.com/u/257158451?v=4&s=48" width="48" height="48" alt="Protocol Zero" title="Protocol Zero"/></a> <a href="https://github.com/Limitless2023"><img src="https://avatars.githubusercontent.com/u/127183162?v=4&s=48" width="48" height="48" alt="Limitless" title="Limitless"/></a> <a href="https://github.com/cheeeee"><img src="https://avatars.githubusercontent.com/u/21245729?v=4&s=48" width="48" height="48" alt="Mykyta Bozhenko" title="Mykyta Bozhenko"/></a>
  <a href="https://github.com/nicholascyh"><img src="https://avatars.githubusercontent.com/u/188132635?v=4&s=48" width="48" height="48" alt="Nicholas" title="Nicholas"/></a> <a href="https://github.com/shivamraut101"><img src="https://avatars.githubusercontent.com/u/110457469?v=4&s=48" width="48" height="48" alt="Shivam Kumar Raut" title="Shivam Kumar Raut"/></a> <a href="https://github.com/andreesg"><img src="https://avatars.githubusercontent.com/u/810322?v=4&s=48" width="48" height="48" alt="andreesg" title="andreesg"/></a> <a href="https://github.com/fwhite13"><img src="https://avatars.githubusercontent.com/u/173006051?v=4&s=48" width="48" height="48" alt="Fred White" title="Fred White"/></a> <a href="https://github.com/Anandesh-Sharma"><img src="https://avatars.githubusercontent.com/u/30695364?v=4&s=48" width="48" height="48" alt="Anandesh-Sharma" title="Anandesh-Sharma"/></a> <a href="https://github.com/ysqander"><img src="https://avatars.githubusercontent.com/u/80843820?v=4&s=48" width="48" height="48" alt="ysqander" title="ysqander"/></a> <a href="https://github.com/ezhikkk"><img src="https://avatars.githubusercontent.com/u/105670095?v=4&s=48" width="48" height="48" alt="ezhikkk" title="ezhikkk"/></a> <a href="https://github.com/andreabadesso"><img src="https://avatars.githubusercontent.com/u/3586068?v=4&s=48" width="48" height="48" alt="andreabadesso" title="andreabadesso"/></a> <a href="https://github.com/BinaryMuse"><img src="https://avatars.githubusercontent.com/u/189606?v=4&s=48" width="48" height="48" alt="BinaryMuse" title="BinaryMuse"/></a> <a href="https://github.com/cordx56"><img src="https://avatars.githubusercontent.com/u/23298744?v=4&s=48" width="48" height="48" alt="cordx56" title="cordx56"/></a>
  <a href="https://github.com/DevSecTim"><img src="https://avatars.githubusercontent.com/u/2226767?v=4&s=48" width="48" height="48" alt="DevSecTim" title="DevSecTim"/></a> <a href="https://github.com/edincampara"><img src="https://avatars.githubusercontent.com/u/142477787?v=4&s=48" width="48" height="48" alt="edincampara" title="edincampara"/></a> <a href="https://github.com/fcatuhe"><img src="https://avatars.githubusercontent.com/u/17382215?v=4&s=48" width="48" height="48" alt="fcatuhe" title="fcatuhe"/></a> <a href="https://github.com/gildo"><img src="https://avatars.githubusercontent.com/u/133645?v=4&s=48" width="48" height="48" alt="gildo" title="gildo"/></a> <a href="https://github.com/itsjaydesu"><img src="https://avatars.githubusercontent.com/u/220390?v=4&s=48" width="48" height="48" alt="itsjaydesu" title="itsjaydesu"/></a> <a href="https://github.com/ivanrvpereira"><img src="https://avatars.githubusercontent.com/u/183991?v=4&s=48" width="48" height="48" alt="ivanrvpereira" title="ivanrvpereira"/></a> <a href="https://github.com/loeclos"><img src="https://avatars.githubusercontent.com/u/116607327?v=4&s=48" width="48" height="48" alt="loeclos" title="loeclos"/></a> <a href="https://github.com/MarvinCui"><img src="https://avatars.githubusercontent.com/u/130876763?v=4&s=48" width="48" height="48" alt="MarvinCui" title="MarvinCui"/></a> <a href="https://github.com/p6l-richard"><img src="https://avatars.githubusercontent.com/u/18185649?v=4&s=48" width="48" height="48" alt="p6l-richard" title="p6l-richard"/></a> <a href="https://github.com/thejhinvirtuoso"><img src="https://avatars.githubusercontent.com/u/258521837?v=4&s=48" width="48" height="48" alt="thejhinvirtuoso" title="thejhinvirtuoso"/></a>
  <a href="https://github.com/yudshj"><img src="https://avatars.githubusercontent.com/u/16971372?v=4&s=48" width="48" height="48" alt="yudshj" title="yudshj"/></a> <a href="https://github.com/Wangnov"><img src="https://avatars.githubusercontent.com/u/48670012?v=4&s=48" width="48" height="48" alt="Wangnov" title="Wangnov"/></a> <a href="https://github.com/JonathanWorks"><img src="https://avatars.githubusercontent.com/u/124476234?v=4&s=48" width="48" height="48" alt="Jonathan Works" title="Jonathan Works"/></a> <a href="https://github.com/yassine20011"><img src="https://avatars.githubusercontent.com/u/59234686?v=4&s=48" width="48" height="48" alt="Yassine Amjad" title="Yassine Amjad"/></a> <a href="https://github.com/djangonavarro220"><img src="https://avatars.githubusercontent.com/u/251162586?v=4&s=48" width="48" height="48" alt="Django Navarro" title="Django Navarro"/></a> <a href="https://github.com/hirefrank"><img src="https://avatars.githubusercontent.com/u/183158?v=4&s=48" width="48" height="48" alt="Frank Harris" title="Frank Harris"/></a> <a href="https://github.com/kennyklee"><img src="https://avatars.githubusercontent.com/u/1432489?v=4&s=48" width="48" height="48" alt="Kenny Lee" title="Kenny Lee"/></a> <a href="https://github.com/ThomsenDrake"><img src="https://avatars.githubusercontent.com/u/120344051?v=4&s=48" width="48" height="48" alt="Drake Thomsen" title="Drake Thomsen"/></a> <a href="https://github.com/wangai-studio"><img src="https://avatars.githubusercontent.com/u/256938352?v=4&s=48" width="48" height="48" alt="wangai-studio" title="wangai-studio"/></a> <a href="https://github.com/AytuncYildizli"><img src="https://avatars.githubusercontent.com/u/47717026?v=4&s=48" width="48" height="48" alt="AytuncYildizli" title="AytuncYildizli"/></a>
  <a href="https://github.com/KnHack"><img src="https://avatars.githubusercontent.com/u/2346724?v=4&s=48" width="48" height="48" alt="Charlie Niño" title="Charlie Niño"/></a> <a href="https://github.com/17jmumford"><img src="https://avatars.githubusercontent.com/u/36290330?v=4&s=48" width="48" height="48" alt="Jeremy Mumford" title="Jeremy Mumford"/></a> <a href="https://github.com/Yeom-JinHo"><img src="https://avatars.githubusercontent.com/u/81306489?v=4&s=48" width="48" height="48" alt="Yeom-JinHo" title="Yeom-JinHo"/></a> <a href="https://github.com/robaxelsen"><img src="https://avatars.githubusercontent.com/u/13132899?v=4&s=48" width="48" height="48" alt="Rob Axelsen" title="Rob Axelsen"/></a> <a href="https://github.com/junjunjunbong"><img src="https://avatars.githubusercontent.com/u/153147718?v=4&s=48" width="48" height="48" alt="junwon" title="junwon"/></a> <a href="https://github.com/prathamdby"><img src="https://avatars.githubusercontent.com/u/134331217?v=4&s=48" width="48" height="48" alt="Pratham Dubey" title="Pratham Dubey"/></a> <a href="https://github.com/amitbiswal007"><img src="https://avatars.githubusercontent.com/u/108086198?v=4&s=48" width="48" height="48" alt="amitbiswal007" title="amitbiswal007"/></a> <a href="https://github.com/Slats24"><img src="https://avatars.githubusercontent.com/u/42514321?v=4&s=48" width="48" height="48" alt="Slats" title="Slats"/></a> <a href="https://github.com/orenyomtov"><img src="https://avatars.githubusercontent.com/u/168856?v=4&s=48" width="48" height="48" alt="Oren" title="Oren"/></a> <a href="https://github.com/parkertoddbrooks"><img src="https://avatars.githubusercontent.com/u/585456?v=4&s=48" width="48" height="48" alt="Parker Todd Brooks" title="Parker Todd Brooks"/></a>
  <a href="https://github.com/mattqdev"><img src="https://avatars.githubusercontent.com/u/115874885?v=4&s=48" width="48" height="48" alt="MattQ" title="MattQ"/></a> <a href="https://github.com/Milofax"><img src="https://avatars.githubusercontent.com/u/2537423?v=4&s=48" width="48" height="48" alt="Milofax" title="Milofax"/></a> <a href="https://github.com/stevebot-alive"><img src="https://avatars.githubusercontent.com/u/261149299?v=4&s=48" width="48" height="48" alt="Steve (OpenClaw)" title="Steve (OpenClaw)"/></a> <a href="https://github.com/ZetiMente"><img src="https://avatars.githubusercontent.com/u/76985631?v=4&s=48" width="48" height="48" alt="Matthew" title="Matthew"/></a> <a href="https://github.com/Cassius0924"><img src="https://avatars.githubusercontent.com/u/62874592?v=4&s=48" width="48" height="48" alt="Cassius0924" title="Cassius0924"/></a> <a href="https://github.com/0xbrak"><img src="https://avatars.githubusercontent.com/u/181251288?v=4&s=48" width="48" height="48" alt="0xbrak" title="0xbrak"/></a> <a href="https://github.com/8BlT"><img src="https://avatars.githubusercontent.com/u/162764392?v=4&s=48" width="48" height="48" alt="8BlT" title="8BlT"/></a> <a href="https://github.com/Abdul535"><img src="https://avatars.githubusercontent.com/u/54276938?v=4&s=48" width="48" height="48" alt="Abdul535" title="Abdul535"/></a> <a href="https://github.com/abhaymundhara"><img src="https://avatars.githubusercontent.com/u/62872231?v=4&s=48" width="48" height="48" alt="abhaymundhara" title="abhaymundhara"/></a> <a href="https://github.com/aduk059"><img src="https://avatars.githubusercontent.com/u/257603478?v=4&s=48" width="48" height="48" alt="aduk059" title="aduk059"/></a>
  <a href="https://github.com/afurm"><img src="https://avatars.githubusercontent.com/u/6375192?v=4&s=48" width="48" height="48" alt="afurm" title="afurm"/></a> <a href="https://github.com/aisling404"><img src="https://avatars.githubusercontent.com/u/211950534?v=4&s=48" width="48" height="48" alt="aisling404" title="aisling404"/></a> <a href="https://github.com/akari-musubi"><img src="https://avatars.githubusercontent.com/u/259925157?v=4&s=48" width="48" height="48" alt="akari-musubi" title="akari-musubi"/></a> <a href="https://github.com/albertlieyingadrian"><img src="https://avatars.githubusercontent.com/u/12984659?v=4&s=48" width="48" height="48" alt="albertlieyingadrian" title="albertlieyingadrian"/></a> <a href="https://github.com/Alex-Alaniz"><img src="https://avatars.githubusercontent.com/u/88956822?v=4&s=48" width="48" height="48" alt="Alex-Alaniz" title="Alex-Alaniz"/></a> <a href="https://github.com/ali-aljufairi"><img src="https://avatars.githubusercontent.com/u/85583841?v=4&s=48" width="48" height="48" alt="ali-aljufairi" title="ali-aljufairi"/></a> <a href="https://github.com/altaywtf"><img src="https://avatars.githubusercontent.com/u/9790196?v=4&s=48" width="48" height="48" alt="altaywtf" title="altaywtf"/></a> <a href="https://github.com/araa47"><img src="https://avatars.githubusercontent.com/u/22760261?v=4&s=48" width="48" height="48" alt="araa47" title="araa47"/></a> <a href="https://github.com/Asleep123"><img src="https://avatars.githubusercontent.com/u/122379135?v=4&s=48" width="48" height="48" alt="Asleep123" title="Asleep123"/></a> <a href="https://github.com/avacadobanana352"><img src="https://avatars.githubusercontent.com/u/263496834?v=4&s=48" width="48" height="48" alt="avacadobanana352" title="avacadobanana352"/></a>
  <a href="https://github.com/barronlroth"><img src="https://avatars.githubusercontent.com/u/5567884?v=4&s=48" width="48" height="48" alt="barronlroth" title="barronlroth"/></a> <a href="https://github.com/bennewton999"><img src="https://avatars.githubusercontent.com/u/458991?v=4&s=48" width="48" height="48" alt="bennewton999" title="bennewton999"/></a> <a href="https://github.com/bguidolim"><img src="https://avatars.githubusercontent.com/u/987360?v=4&s=48" width="48" height="48" alt="bguidolim" title="bguidolim"/></a> <a href="https://github.com/bigwest60"><img src="https://avatars.githubusercontent.com/u/12373979?v=4&s=48" width="48" height="48" alt="bigwest60" title="bigwest60"/></a> <a href="https://github.com/caelum0x"><img src="https://avatars.githubusercontent.com/u/130079063?v=4&s=48" width="48" height="48" alt="caelum0x" title="caelum0x"/></a> <a href="https://github.com/championswimmer"><img src="https://avatars.githubusercontent.com/u/1327050?v=4&s=48" width="48" height="48" alt="championswimmer" title="championswimmer"/></a> <a href="https://github.com/dutifulbob"><img src="https://avatars.githubusercontent.com/u/261991368?v=4&s=48" width="48" height="48" alt="dutifulbob" title="dutifulbob"/></a> <a href="https://github.com/eternauta1337"><img src="https://avatars.githubusercontent.com/u/550409?v=4&s=48" width="48" height="48" alt="eternauta1337" title="eternauta1337"/></a> <a href="https://github.com/foeken"><img src="https://avatars.githubusercontent.com/u/13864?v=4&s=48" width="48" height="48" alt="foeken" title="foeken"/></a> <a href="https://github.com/gittb"><img src="https://avatars.githubusercontent.com/u/8284364?v=4&s=48" width="48" height="48" alt="gittb" title="gittb"/></a>
  <a href="https://github.com/HeimdallStrategy"><img src="https://avatars.githubusercontent.com/u/223014405?v=4&s=48" width="48" height="48" alt="HeimdallStrategy" title="HeimdallStrategy"/></a> <a href="https://github.com/junsuwhy"><img src="https://avatars.githubusercontent.com/u/4645498?v=4&s=48" width="48" height="48" alt="junsuwhy" title="junsuwhy"/></a> <a href="https://github.com/knocte"><img src="https://avatars.githubusercontent.com/u/331303?v=4&s=48" width="48" height="48" alt="knocte" title="knocte"/></a> <a href="https://github.com/MackDing"><img src="https://avatars.githubusercontent.com/u/19878893?v=4&s=48" width="48" height="48" alt="MackDing" title="MackDing"/></a> <a href="https://github.com/nobrainer-tech"><img src="https://avatars.githubusercontent.com/u/445466?v=4&s=48" width="48" height="48" alt="nobrainer-tech" title="nobrainer-tech"/></a> <a href="https://github.com/Noctivoro"><img src="https://avatars.githubusercontent.com/u/183974570?v=4&s=48" width="48" height="48" alt="Noctivoro" title="Noctivoro"/></a> <a href="https://github.com/Raikan10"><img src="https://avatars.githubusercontent.com/u/20675476?v=4&s=48" width="48" height="48" alt="Raikan10" title="Raikan10"/></a> <a href="https://github.com/Swader"><img src="https://avatars.githubusercontent.com/u/1430603?v=4&s=48" width="48" height="48" alt="Swader" title="Swader"/></a> <a href="https://github.com/algal"><img src="https://avatars.githubusercontent.com/u/264412?v=4&s=48" width="48" height="48" alt="Alexis Gallagher" title="Alexis Gallagher"/></a> <a href="https://github.com/alexstyl"><img src="https://avatars.githubusercontent.com/u/1665273?v=4&s=48" width="48" height="48" alt="alexstyl" title="alexstyl"/></a> <a href="https://github.com/ethanpalm"><img src="https://avatars.githubusercontent.com/u/56270045?v=4&s=48" width="48" height="48" alt="Ethan Palm" title="Ethan Palm"/></a>
  <a href="https://github.com/yingchunbai"><img src="https://avatars.githubusercontent.com/u/33477283?v=4&s=48" width="48" height="48" alt="yingchunbai" title="yingchunbai"/></a> <a href="https://github.com/joshrad-dev"><img src="https://avatars.githubusercontent.com/u/62785552?v=4&s=48" width="48" height="48" alt="joshrad-dev" title="joshrad-dev"/></a> <a href="https://github.com/danballance"><img src="https://avatars.githubusercontent.com/u/13839912?v=4&s=48" width="48" height="48" alt="Dan Ballance" title="Dan Ballance"/></a> <a href="https://github.com/GHesericsu"><img src="https://avatars.githubusercontent.com/u/60202455?v=4&s=48" width="48" height="48" alt="Eric Su" title="Eric Su"/></a> <a href="https://github.com/kimitaka"><img src="https://avatars.githubusercontent.com/u/167225?v=4&s=48" width="48" height="48" alt="Kimitaka Watanabe" title="Kimitaka Watanabe"/></a> <a href="https://github.com/itsjling"><img src="https://avatars.githubusercontent.com/u/2521993?v=4&s=48" width="48" height="48" alt="Justin Ling" title="Justin Ling"/></a> <a href="https://github.com/lutr0"><img src="https://avatars.githubusercontent.com/u/76906369?v=4&s=48" width="48" height="48" alt="lutr0" title="lutr0"/></a> <a href="https://github.com/RayBB"><img src="https://avatars.githubusercontent.com/u/921217?v=4&s=48" width="48" height="48" alt="Raymond Berger" title="Raymond Berger"/></a> <a href="https://github.com/atalovesyou"><img src="https://avatars.githubusercontent.com/u/3534502?v=4&s=48" width="48" height="48" alt="atalovesyou" title="atalovesyou"/></a> <a href="https://github.com/jayhickey"><img src="https://avatars.githubusercontent.com/u/1676460?v=4&s=48" width="48" height="48" alt="jayhickey" title="jayhickey"/></a>
  <a href="https://github.com/jonasjancarik"><img src="https://avatars.githubusercontent.com/u/2459191?v=4&s=48" width="48" height="48" alt="jonasjancarik" title="jonasjancarik"/></a> <a href="https://github.com/latitudeki5223"><img src="https://avatars.githubusercontent.com/u/119656367?v=4&s=48" width="48" height="48" alt="latitudeki5223" title="latitudeki5223"/></a> <a href="https://github.com/minghinmatthewlam"><img src="https://avatars.githubusercontent.com/u/14224566?v=4&s=48" width="48" height="48" alt="minghinmatthewlam" title="minghinmatthewlam"/></a> <a href="https://github.com/rafaelreis-r"><img src="https://avatars.githubusercontent.com/u/57492577?v=4&s=48" width="48" height="48" alt="rafaelreis-r" title="rafaelreis-r"/></a> <a href="https://github.com/ratulsarna"><img src="https://avatars.githubusercontent.com/u/105903728?v=4&s=48" width="48" height="48" alt="ratulsarna" title="ratulsarna"/></a> <a href="https://github.com/timkrase"><img src="https://avatars.githubusercontent.com/u/38947626?v=4&s=48" width="48" height="48" alt="timkrase" title="timkrase"/></a> <a href="https://github.com/efe-buken"><img src="https://avatars.githubusercontent.com/u/262546946?v=4&s=48" width="48" height="48" alt="efe-buken" title="efe-buken"/></a> <a href="https://github.com/manmal"><img src="https://avatars.githubusercontent.com/u/142797?v=4&s=48" width="48" height="48" alt="manmal" title="manmal"/></a> <a href="https://github.com/easternbloc"><img src="https://avatars.githubusercontent.com/u/92585?v=4&s=48" width="48" height="48" alt="easternbloc" title="easternbloc"/></a> <a href="https://github.com/ManuelHettich"><img src="https://avatars.githubusercontent.com/u/17690367?v=4&s=48" width="48" height="48" alt="manuelhettich" title="manuelhettich"/></a>
  <a href="https://github.com/sktbrd"><img src="https://avatars.githubusercontent.com/u/116202536?v=4&s=48" width="48" height="48" alt="sktbrd" title="sktbrd"/></a> <a href="https://github.com/larlyssa"><img src="https://avatars.githubusercontent.com/u/13128869?v=4&s=48" width="48" height="48" alt="larlyssa" title="larlyssa"/></a> <a href="https://github.com/Mind-Dragon"><img src="https://avatars.githubusercontent.com/u/262945885?v=4&s=48" width="48" height="48" alt="Mind-Dragon" title="Mind-Dragon"/></a> <a href="https://github.com/pcty-nextgen-service-account"><img src="https://avatars.githubusercontent.com/u/112553441?v=4&s=48" width="48" height="48" alt="pcty-nextgen-service-account" title="pcty-nextgen-service-account"/></a> <a href="https://github.com/tmchow"><img src="https://avatars.githubusercontent.com/u/517103?v=4&s=48" width="48" height="48" alt="tmchow" title="tmchow"/></a> <a href="https://github.com/uli-will-code"><img src="https://avatars.githubusercontent.com/u/49715419?v=4&s=48" width="48" height="48" alt="uli-will-code" title="uli-will-code"/></a> <a href="https://github.com/mgratch"><img src="https://avatars.githubusercontent.com/u/2238658?v=4&s=48" width="48" height="48" alt="Marc Gratch" title="Marc Gratch"/></a> <a href="https://github.com/JackyWay"><img src="https://avatars.githubusercontent.com/u/53031570?v=4&s=48" width="48" height="48" alt="JackyWay" title="JackyWay"/></a> <a href="https://github.com/aaronveklabs"><img src="https://avatars.githubusercontent.com/u/225997828?v=4&s=48" width="48" height="48" alt="aaronveklabs" title="aaronveklabs"/></a> <a href="https://github.com/CJWTRUST"><img src="https://avatars.githubusercontent.com/u/235565898?v=4&s=48" width="48" height="48" alt="CJWTRUST" title="CJWTRUST"/></a>
  <a href="https://github.com/erik-agens"><img src="https://avatars.githubusercontent.com/u/80908960?v=4&s=48" width="48" height="48" alt="erik-agens" title="erik-agens"/></a> <a href="https://github.com/odnxe"><img src="https://avatars.githubusercontent.com/u/403141?v=4&s=48" width="48" height="48" alt="odnxe" title="odnxe"/></a> <a href="https://github.com/T5-AndyML"><img src="https://avatars.githubusercontent.com/u/22801233?v=4&s=48" width="48" height="48" alt="T5-AndyML" title="T5-AndyML"/></a> <a href="https://github.com/j1philli"><img src="https://avatars.githubusercontent.com/u/3744255?v=4&s=48" width="48" height="48" alt="Josh Phillips" title="Josh Phillips"/></a> <a href="https://github.com/mujiannan"><img src="https://avatars.githubusercontent.com/u/46643837?v=4&s=48" width="48" height="48" alt="mujiannan" title="mujiannan"/></a> <a href="https://github.com/marcodd23"><img src="https://avatars.githubusercontent.com/u/3519682?v=4&s=48" width="48" height="48" alt="Marco Di Dionisio" title="Marco Di Dionisio"/></a> <a href="https://github.com/RandyVentures"><img src="https://avatars.githubusercontent.com/u/149904821?v=4&s=48" width="48" height="48" alt="Randy Torres" title="Randy Torres"/></a> <a href="https://github.com/afern247"><img src="https://avatars.githubusercontent.com/u/34192856?v=4&s=48" width="48" height="48" alt="afern247" title="afern247"/></a> <a href="https://github.com/0oAstro"><img src="https://avatars.githubusercontent.com/u/79555780?v=4&s=48" width="48" height="48" alt="0oAstro" title="0oAstro"/></a> <a href="https://github.com/alexanderatallah"><img src="https://avatars.githubusercontent.com/u/1011391?v=4&s=48" width="48" height="48" alt="alexanderatallah" title="alexanderatallah"/></a>
  <a href="https://github.com/testingabc321"><img src="https://avatars.githubusercontent.com/u/8577388?v=4&s=48" width="48" height="48" alt="testingabc321" title="testingabc321"/></a> <a href="https://github.com/humanwritten"><img src="https://avatars.githubusercontent.com/u/206531610?v=4&s=48" width="48" height="48" alt="humanwritten" title="humanwritten"/></a> <a href="https://github.com/aaronn"><img src="https://avatars.githubusercontent.com/u/1653630?v=4&s=48" width="48" height="48" alt="aaronn" title="aaronn"/></a> <a href="https://github.com/Alphonse-arianee"><img src="https://avatars.githubusercontent.com/u/254457365?v=4&s=48" width="48" height="48" alt="Alphonse-arianee" title="Alphonse-arianee"/></a> <a href="https://github.com/gtsifrikas"><img src="https://avatars.githubusercontent.com/u/8904378?v=4&s=48" width="48" height="48" alt="gtsifrikas" title="gtsifrikas"/></a> <a href="https://github.com/hrdwdmrbl"><img src="https://avatars.githubusercontent.com/u/554881?v=4&s=48" width="48" height="48" alt="hrdwdmrbl" title="hrdwdmrbl"/></a> <a href="https://github.com/hugobarauna"><img src="https://avatars.githubusercontent.com/u/2719?v=4&s=48" width="48" height="48" alt="hugobarauna" title="hugobarauna"/></a> <a href="https://github.com/jiulingyun"><img src="https://avatars.githubusercontent.com/u/126459548?v=4&s=48" width="48" height="48" alt="jiulingyun" title="jiulingyun"/></a> <a href="https://github.com/kitze"><img src="https://avatars.githubusercontent.com/u/1160594?v=4&s=48" width="48" height="48" alt="kitze" title="kitze"/></a> <a href="https://github.com/loukotal"><img src="https://avatars.githubusercontent.com/u/18210858?v=4&s=48" width="48" height="48" alt="loukotal" title="loukotal"/></a>
  <a href="https://github.com/MSch"><img src="https://avatars.githubusercontent.com/u/7475?v=4&s=48" width="48" height="48" alt="MSch" title="MSch"/></a> <a href="https://github.com/odrobnik"><img src="https://avatars.githubusercontent.com/u/333270?v=4&s=48" width="48" height="48" alt="odrobnik" title="odrobnik"/></a> <a href="https://github.com/reeltimeapps"><img src="https://avatars.githubusercontent.com/u/637338?v=4&s=48" width="48" height="48" alt="reeltimeapps" title="reeltimeapps"/></a> <a href="https://github.com/rhjoh"><img src="https://avatars.githubusercontent.com/u/105699450?v=4&s=48" width="48" height="48" alt="rhjoh" title="rhjoh"/></a> <a href="https://github.com/ronak-guliani"><img src="https://avatars.githubusercontent.com/u/23518228?v=4&s=48" width="48" height="48" alt="ronak-guliani" title="ronak-guliani"/></a> <a href="https://github.com/snopoke"><img src="https://avatars.githubusercontent.com/u/249606?v=4&s=48" width="48" height="48" alt="snopoke" title="snopoke"/></a>
</p>
