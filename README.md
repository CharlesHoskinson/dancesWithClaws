![Hello Fellow Bots](hello-fellow-bots.jpg)

# Logan (ELL) — Exit Liquidity Lobster

A **local** Cardano-focused AI agent built with [OpenClaw](https://openclaw.ai).

## What is this

Logan (codename **ELL** — Exit Liquidity Lobster) is a Cardano educator that runs on your machine. He explains protocol design, governance, and ecosystem topics using a curated knowledge base (hybrid RAG). Marine biology analogies are optional flair. **Price predictions are not.**

This repo is a fork of the [OpenClaw monorepo](https://github.com/openclaw/openclaw) with Logan's workspace, knowledge base, sandbox hardening, Sokosumi hooks, and deploy assets layered on top.

## Architecture

```
Single agent · Local Gemma 4 (Ollama) · Hourly heartbeats · Hardened Docker sandbox + proxy
```

| Piece | Choice |
|-------|--------|
| Agent | `logan` (default) |
| Primary model | `ollama/gemma4:e2b` (~7.2GB, edge-oriented) |
| Fallbacks | `ollama/gemma4:e4b`, `ollama/llama3.2:1b` |
| Heartbeat | 1h — local status, knowledge refresh, memory hygiene |
| RAG | `workspace/knowledge/` via `memorySearch` |
| Sandbox image | `openclaw-sandbox:bookworm-slim` (user `sandboxuser`) |
| Egress | Squid proxy allowlist (OpenAI, Sokosumi by default) |
| Tools | `minimal` + alsoAllow exec/read/write/edit/memory_*/Sokosumi read tools |

## Quick start (host)

```powershell
# deps + build
npx pnpm@11.2.2 install
npx pnpm@11.2.2 build

# Ollama
ollama pull gemma4:e2b
# OpenClaw requires any non-empty OLLAMA_API_KEY to register the provider
$env:OLLAMA_API_KEY = "ollama-local"

# one-shot gateway smoke (sandbox off on host)
.\scripts\logan-gateway-smoke.ps1 -Model ollama/gemma4:e2b
```

## Docker sandbox smoke (WSL)

```bash
bash scripts/logan-docker-smoke.sh
```

Builds sandbox + proxy, checks allowlisted HTTPS CONNECT vs blocked domains.

## Configuration

Primary config: `openclaw.json` at repo root.

| Setting | Value |
|---------|--------|
| `agents.list[0].model.primary` | `ollama/gemma4:e2b` |
| `env.vars.OLLAMA_API_KEY` | `ollama-local` (placeholder; required) |
| `tools.sokosumi` | optional marketplace endpoint |
| `sandbox.docker.image` | `openclaw-sandbox:bookworm-slim` |

Workspace identity and ops: `workspace/AGENT.md`, `HEARTBEAT.md`, `MEMORY.md`, `knowledge/`.

## Sokosumi (optional)

Set `SOKOSUMI_API_KEY` to browse marketplace agents/jobs. `sokosumi_create_job` stays denied by default.

## Deploy

Azure-oriented compose lives under `deploy/`:

- `openclaw-gateway` + `caddy` serving a **static** Lobster Thoughts page
- `.env`: `OPENAI_API_KEY`, `SOKOSUMI_API_KEY`, `OPENCLAW_GATEWAY_TOKEN`, `SITE_DOMAIN`
- Workflow: `.github/workflows/deploy-logan.yml` (branches `main` / `custom`)

Generate static site:

```bash
FETCH_ONCE=1 node deploy/site/fetch.mjs
```

## Security

- Sandbox: non-root, RO root, seccomp, capability drop
- Proxy: domain allowlist + rate limit (`security/proxy/`)
- TEE vault extension for hardware-backed secrets (`extensions/tee-vault/`)

## Repo layout (Logan surface)

```
openclaw.json
workspace/                 # agent identity, heartbeat, knowledge RAG
deploy/                    # Azure compose + static site
security/                  # proxy + seccomp
extensions/tee-vault/      # optional HSM/DPAPI vault
scripts/logan-*-smoke.*    # smoke tests
docs/architecture/         # C4 diagrams
openspec/changes/ell-logan-cardano-bot/
```

Everything else is upstream OpenClaw.

## License

MIT (see `LICENSE`), same as upstream OpenClaw unless noted otherwise.