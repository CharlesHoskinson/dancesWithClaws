---
title: Logan Local Stack — Gemma 4 + YubiHSM 2 Unified Design
date: 2026-04-21
status: approved-with-conditions (post-council)
authors: Charles Hoskinson (PO), Claude (research & synthesis)
reviewers: security, ops-sre, architecture, perf-cost (see ../reviews/2026-04-21-council-review.md)
supersedes: OpenAI-backed runtime + bashrc-based secrets
host: Windows 11, Intel Arc 140V (16 GB shared), 32 GB RAM, WSL2
---

# Logan Local Stack — Unified Design

Logan (ELL) runs entirely on the local host: chat model and embeddings served by Ollama, all persistent secrets sealed by YubiHSM 2, network egress pinned behind the existing Squid sidecar. No required cloud dependency.

This design consolidates four independent research tracks into one coherent plan. Individual research artifacts: [embeddings](../research/2026-04-21-embeddings.md), [sandbox-network](../research/2026-04-21-sandbox-network.md), [fallback-strategy](../research/2026-04-21-fallback-strategy.md), [hsm-workflow](../research/2026-04-21-hsm-workflow.md).

## Threat Model (post-council additions)

- **Kernel-trust boundary.** Host Windows kernel is trusted. SYSTEM-level compromise can extract DPAPI master key → decrypt Credential Manager → get HSM PIN → unlock vault. This is a Windows-platform limit; mitigation (HVCI/KMCI, YubiHSM touch-required auth) is deferred.
- **HSM compromise.** Physical theft of YubiHSM alone is insufficient (VMK inside device, PIN separate). Theft plus PIN plus host access is catastrophic; backup + rotation is the only defense.
- **Ollama API surface.** Ollama has no authentication. Sandbox must only be able to call `/api/generate`, `/api/embed`, `/api/chat`, `/api/tags`. Admin endpoints (`/api/pull`, `/api/delete`, `/api/copy`, `/api/create`) MUST be blocked by a local socket filter/shim.
- **Silent-pause failure mode.** If Ollama is unreachable, Logan misses heartbeats rather than cascading to cloud. Must be monitored, not silent.

## Decisions at a Glance

| #   | Decision                                                                                | Confidence | Rollback                                                                     |
| --- | --------------------------------------------------------------------------------------- | ---------- | ---------------------------------------------------------------------------- |
| D1  | Chat primary = `ollama/gemma4:e2b`, fallback = `[ollama/gemma4:e4b]`. Drop 26b and 31b. | 0.80       | Re-add `gemma4:26b` if e4b OOMs in practice                                  |
| D2  | Embeddings = `ollama/mxbai-embed-large` (1024 dim), hybrid weights 0.75/0.25            | 0.85       | `nomic-embed-text` (768 dim), weights 0.7/0.3                                |
| D3  | Sandbox reaches Ollama via Unix-socket bind-mount; Ollama migrates into WSL2            | 0.70       | Squid HTTP forward for `ollama.lan` (only if requests are non-streaming)     |
| D4  | Secrets sealed in YubiHSM vault; wrapper script injects at agent start                  | 0.80       | Keep `~/.bashrc` as temporary fallback while wrapper is validated            |
| D5  | No pre-pull of 26b/31b. No cloud backstop until after HSM vault is live.                | 0.85       | Add `anthropic/claude-haiku-4-5` via vault if Ollama uptime becomes an issue |

## System Overview

```
                                           Windows 11 host
┌──────────────────────────────────────────────────────────────────────────────────┐
│                                                                                  │
│  YubiHSM 2 (USB) ── yubihsm-connector @ localhost:12345                          │
│                           │                                                      │
│                           ▼                                                      │
│                   TEE-Vault (vault.enc, AES-GCM, VMK in HSM)                     │
│                           │                                                      │
│      PIN via Windows Credential Manager                                          │
│                                                                                  │
│                    WSL2 Ubuntu                                                   │
│   ┌──────────────────────────────────────────────────────────────┐               │
│   │                                                              │               │
│   │  Ollama server (WSL2)  ──  /tmp/ollama.sock (Unix socket)    │               │
│   │     ├── gemma4:e2b  (primary, 7.2 GB)                        │               │
│   │     └── gemma4:e4b  (fallback, 9.6 GB)                       │               │
│   │     └── mxbai-embed-large (embeddings, 700 MB)               │               │
│   │                                                              │               │
│   │  launch-logan-with-vault.ps1 / .sh                           │               │
│   │     ├─▶ openclaw tee unlock (PIN from Cred Mgr)              │               │
│   │     ├─▶ openclaw tee export --label moltbook_api_key         │               │
│   │     └─▶ openclaw agent start logan (with decrypted env)      │               │
│   │                                                              │               │
│   │  Docker network: oc-sandbox-net (172.30.0.0/24)              │               │
│   │  ┌─────────────────────────┐  ┌─────────────────────────┐    │               │
│   │  │  Logan sandbox          │  │  Squid proxy sidecar    │    │               │
│   │  │  (openclaw-sandbox)     │  │  172.30.0.10            │    │               │
│   │  │  readOnlyRoot           │  │  allowlist: moltbook.com│    │               │
│   │  │  capDrop: ALL           │  │     + deps              │    │               │
│   │  │  seccomp                │  │                         │    │               │
│   │  │                         │  │                         │    │               │
│   │  │  /tmp/ollama.sock ◀─────┼──┼─────── bind-mount       │    │               │
│   │  │     (read-only)         │  │                         │    │               │
│   │  │                         │  │                         │    │               │
│   │  │  env: MOLTBOOK_API_KEY ─┼──┼─ injected at docker run │    │               │
│   │  └────────────┬────────────┘  └────────────┬────────────┘    │               │
│   │               │                            │                 │               │
│   │               └───── Moltbook ─────────────┘                 │               │
│   │                     (via Squid only)                         │               │
│   └──────────────────────────────────────────────────────────────┘               │
│                                                                                  │
│  Windows Firewall: blocks WSL2 → LAN (security/windows-firewall-rules.ps1)       │
└──────────────────────────────────────────────────────────────────────────────────┘
```

Authoritative diagram: [diagrams/logan-local-stack.mmd](../diagrams/logan-local-stack.mmd).

## Component Responsibilities

### Ollama (WSL2, host-local)

- Serves four endpoints via Unix socket: `gemma4:e2b`, `gemma4:e4b`, `mxbai-embed-large`, and whatever else is installed.
- Model dir lives on WSL2 filesystem (not `/mnt/c`), fast I/O.
- Starts at WSL2 boot via systemd unit or `@reboot` shell hook.

### TEE-Vault

- Holds secrets sealed by a VMK that lives **inside** the HSM. Decryption calls touch the HSM via PKCS#11.
- Session-end hook re-locks the vault.
- Audit log records every retrieval (`tee-audit.ts`).

### Launch wrapper (`launch-logan-with-vault.ps1` + WSL2 `.sh`)

- Single entry point invoked by Task Scheduler on boot.
- Resolves PIN from Windows Credential Manager → sets `YUBIHSM_PIN`.
- `openclaw tee unlock`.
- `openclaw tee export --label moltbook_api_key` → `$env:MOLTBOOK_API_KEY`.
- `openclaw agent start logan`.

### Logan agent (Docker sandbox on `oc-sandbox-net`)

- Consumes `MOLTBOOK_API_KEY` from injected env.
- Calls Ollama at `unix:///tmp/ollama.sock` (bind-mounted read-only).
- Egresses to Moltbook via Squid only.

### Squid proxy sidecar

- Unchanged: domain allowlist, iptables egress rules, Cap NET_ADMIN/SETUID/SETGID.
- No new allowlist entries for Ollama (socket path bypasses network).

## Data Flow

### Startup

1. Task Scheduler triggers `launch-logan-with-vault.ps1`.
2. PIN fetched from Credential Manager (never logged, never written to disk).
3. `openclaw tee unlock` opens PKCS#11 session → HSM returns VMK handle.
4. `openclaw tee export --label moltbook_api_key` AES-GCM-decrypts the entry using an EEK derived from the VMK.
5. Decrypted `MOLTBOOK_API_KEY` is placed only in the wrapper's process env.
6. `openclaw agent start logan` spawns the Docker sandbox with `--env MOLTBOOK_API_KEY=<plaintext>` and `-v /tmp/ollama.sock:/tmp/ollama.sock:ro`.
7. `session_end` hook re-locks the vault when Logan's session ends.

### Chat turn

1. Heartbeat fires (hourly).
2. Agent queries `ollama/gemma4:e2b` via Unix socket → Gemma 4 generates.
3. If primary fails (model missing, OOM, crash): OpenClaw retries on `ollama/gemma4:e4b` once. No further local fallback.
4. RAG lookups: `mxbai-embed-large` embeds the query; sqlite-vec index returns top-K; hybrid score 0.75 vector / 0.25 text.
5. Agent POSTs result to Moltbook via `curl` → Squid → moltbook.com.

### Failure

- **Ollama down:** both models fail identically; heartbeat skipped; alert via existing logging stack.
- **HSM unplugged:** next unlock attempt errors with clear message; wrapper exits non-zero; Task Scheduler retries on next trigger.
- **Vault HMAC mismatch:** wrapper fails fast, instructs to restore from `openclaw tee backup` output.

## Config Schema Decision (post-council)

Instead of overloading `env.vars` with `vault://` URIs, add a distinct `secrets` block:

```jsonc
{
  "agents": {
    "list": [
      {
        "id": "logan",
        "env": { "vars": { "LOG_LEVEL": "info" } },
        "secrets": {
          "MOLTBOOK_API_KEY": { "source": "vault", "label": "moltbook_api_key" },
        },
        "sandbox": {
          "docker": {
            "extraVolumes": ["/tmp/ollama.sock:/tmp/ollama.sock:ro"],
          },
        },
        "model": {
          "primary": "ollama/gemma4:e2b@sha256:<digest>",
          "fallbacks": ["ollama/gemma4:e4b@sha256:<digest>"],
          "cascadePolicy": "local-only",
        },
      },
    ],
  },
}
```

Digest pinning resists supply-chain swap (finding Sec-8). `cascadePolicy: "local-only"` separates "which models are tried" from "should cloud ever be reached" (finding Arch-6). `secrets` block removes ambiguity with `env.vars` literals (finding Arch-7).

## Migration Plan (Summary, plan file is authoritative)

Phase A.0 — Pre-flight (new, per perf-council)

- Capture `ollama --version`, `yubihsm-shell --version`, graphene-pk11 version, WSL2 distro + kernel.
- Confirm Ollama is not currently bound to a port conflict; check `/tmp/ollama.sock` absence.
- Confirm at least 50 GB free on C: and on the WSL2 ext4 volume.
- **GPU smoke test (abort gate):** run a 1-hour loop that pings `gemma4:e2b` with 500-token prompts and measures tokens/sec. Accept ≥5 t/s on Intel Arc 140V; abort and redesign if CPU-only fallback kicks in.

Phase A — Ollama in WSL2

1. Uninstall scoop-installed Ollama (Windows host): `scoop uninstall ollama`.
2. Install Ollama inside WSL2 (`curl -fsSL https://ollama.com/install.sh | sh`); enable systemd unit with `OLLAMA_HOST=unix:///tmp/ollama.sock`.
3. Re-pull `gemma4:e2b`, `gemma4:e4b`, `mxbai-embed-large`. Capture resolved digests for digest pinning.
4. Smoke-test from WSL2: `curl --unix-socket /tmp/ollama.sock http://localhost/api/tags`.
5. Install a minimal socket filter (Unix-socket reverse-proxy shim) that exposes only `/api/generate|/api/embed|/api/chat|/api/tags` and blocks admin endpoints. Bind-mount the FILTER socket into the sandbox, not the raw Ollama socket.

Phase B — Embeddings swap 5. Edit `openclaw.json`: `memorySearch.provider: "ollama"`, `memorySearch.model: "mxbai-embed-large"`, weights `0.75 / 0.25`. 6. Remove `env.vars.OPENAI_API_KEY` (or set empty). 7. Trigger one RAG query; let sqlite-vec rebuild embeddings (~1–2 min on 41 files).

Phase C — Fallback tightening 8. Edit `openclaw.json`: `model.primary: "ollama/gemma4:e2b@sha256:<digest>"`, `model.fallbacks: ["ollama/gemma4:e4b@sha256:<digest>"]`, `model.cascadePolicy: "local-only"`. Drop 26b, 31b. (Schema addition to be landed in OpenClaw config types; guard with config-migration note.) 9. Delete `gemma4:26b` / `gemma4:31b` if previously pulled (they were not pulled — nothing to do).

Phase D — HSM bootstrap (with new idempotency + non-interactive flag work) 10. Verify `yubihsm-connector` running (`Get-Service yubihsm-connector` or `curl http://localhost:12345/connector/status`); verify `yubihsm-shell` reachable. 11. `openclaw tee credential store --target hsmPin` (cache PIN in Credential Manager; stored in user context, NOT SYSTEM). 12. `openclaw tee init --backend yubihsm` (must be idempotent — guard with vault-exists check). 13. Add CLI shim: `openclaw tee unlock --pin-from credmgr` (new non-interactive flag, reads Credential Manager directly, no env-var exposure window). Run it. 14. `echo "$MOLTBOOK_API_KEY" | openclaw tee import --label moltbook_api_key --type api_token --tag production,cardano`. 15. Verify: `openclaw tee list` shows entry; `openclaw tee export --label moltbook_api_key` returns correct value. 16. `openclaw tee backup --out /mnt/ironkey/backups/vault.enc.$(date +%Y%m%d)` (off-disk per `mostlySecure.md`). Register recurring backup cron (daily).

Phase E — Sandbox wiring + `agent_env_prepare` hook (built now, not deferred) 17. Backup `openclaw.json` → `openclaw.json.bak-<timestamp>` before edit. 18. Modify `openclaw.json` per the config schema block above: add `secrets` block and `sandbox.docker.extraVolumes`. 19. Add `OLLAMA_HOST=unix:///tmp/ollama.sock` to agent env literals. 20. Implement `agent_env_prepare` hook in `src/agents/acp-spawn.ts`: fires after `applyConfigEnvVars()`, before sandbox spawn; iterates `agent.secrets`; calls in-process `vault_retrieve`; merges results into the sandbox-bound env only; never writes to process.env globally. 21. Dry-run: `docker exec <sandbox> curl --unix-socket /tmp/ollama.sock http://localhost/api/tags` → should list models.

Phase F — Wrapper + scheduler 22. Write `scripts/launch-logan-with-vault.ps1` (Windows) and `.sh` (WSL). Wrapper ONLY: - resolves PIN from Credential Manager into `$env:YUBIHSM_PIN` (for this subprocess alone); - waits for Ollama readiness via `until curl --unix-socket /tmp/ollama.sock /api/tags; do sleep 1; done` with 60 s timeout; - runs `openclaw tee unlock --pin-from credmgr` (vault stays unlocked for the hook); - runs `openclaw agent start logan` (hook retrieves secret in-process); - traps exit → `openclaw tee lock`. 23. Register Windows Task Scheduler job → runs on user logon, invokes wrapper. **Run as the logged-in user, NOT SYSTEM.** 24. Remove `MOLTBOOK_API_KEY` export from `~/.bashrc`. 25. Reboot → verify clean startup.

Phase G — Verification tasks 26. Send Logan three verification tasks (see below), inspect posts for quality and sourcing. 27. Kill Ollama → verify Logan logs clear error and pauses instead of spinning on fallbacks. 28. Day-1 canary: review first three live Moltbook posts for coherence, on-brand tone, and factual correctness against the Cardano RAG.

## Observability Runbook

| Failure                    | Signal (grep pattern)                                       | Location                                                        |
| -------------------------- | ----------------------------------------------------------- | --------------------------------------------------------------- |
| Ollama down                | `connection refused\|ECONNREFUSED.*11434\|/tmp/ollama.sock` | `~/.openclaw/logs/agent-logan.log`, WSL2 `journalctl -u ollama` |
| Vault HMAC mismatch        | `HMAC.*mismatch\|integrity check failed`                    | `~/.openclaw/logs/tee-vault.log`                                |
| HSM connector down         | `Cannot reach yubihsm-connector\|localhost:12345`           | Wrapper stderr, Windows Event Log (wrapper task)                |
| Sandbox can't reach Ollama | `exec.*curl.*unix-socket.*failed`                           | `~/.openclaw/logs/agent-logan.log`                              |
| Proxy deny (Moltbook etc.) | `403\|ERR_ACCESS_DENIED`                                    | `docker logs openclaw-proxy`                                    |
| Missed heartbeat           | no `heartbeat fired at <ts>` line in last 90 min            | `~/.openclaw/logs/agent-logan.log`                              |

Add a `openclaw agent status logan` check that prints: last heartbeat timestamp, Ollama reachability, vault lock state, primary/fallback model in use. Run as health-check hook at wrapper start.

## Verification / Acceptance Tests

1. **Local chat:** `docker exec <sandbox> curl --unix-socket /tmp/ollama.sock -d '{"model":"gemma4:e2b","prompt":"hi","stream":false}' http://localhost/api/generate` returns a completion.
2. **Embeddings:** `docker exec <sandbox> curl --unix-socket /tmp/ollama.sock -d '{"model":"mxbai-embed-large","input":"Ouroboros proof of stake"}' http://localhost/api/embed` returns a 1024-dim vector.
3. **Moltbook allowed:** `curl -s -o /dev/null -w "%{http_code}" https://moltbook.com` through the sandbox returns `200`.
4. **Evil.com blocked:** same check to `https://evil.com` returns `403`.
5. **Vault unlock:** `openclaw tee status` shows `unlocked, backend=yubihsm, entries≥1`.
6. **Secret injection:** `docker exec <sandbox> printenv MOLTBOOK_API_KEY` returns the expected key. (One-time assertion during setup; remove from runbook to avoid leaking via shell history.)
7. **Fallback path:** stop Ollama, start Logan, verify failure message references both attempted models and then stops — does not wedge on repeated retries.
8. **Logan task A:** "Summarize eUTxO in 3 sentences with marine analogy." — coherent response, Cardano-correct.
9. **Logan task B:** "Compare Ouroboros Praos to Genesis in a short post." — sourced from knowledge base (check RAG hit count in logs).
10. **Logan task C:** "Reply to @some-agent's post about account-based chains." — stays on-brand, respectful, no price speculation.

## Security & Threat Model Deltas

- **+ HSM-gated secret decryption.** Cloud APIs, leaked `.bashrc`, or screenshot of environment no longer leak the key. Extraction requires HSM + PIN + host access.
- **+ No OpenAI egress.** One fewer authenticated service in the trust graph.
- **± Unix socket bind-mount.** `readOnlyRoot` does not protect against `connect(2)`; sandbox can issue any Ollama API call. Ollama has no auth. Acceptable because: (a) Ollama is a local inference server with no sensitive persistent state; (b) sandbox egress is already fully constrained; (c) a compromised Logan can do nothing useful with model management beyond what it already can do with inference.
- **- Ollama inside WSL2 increases WSL2 attack surface.** Mitigated by the existing interop=false + Windows Firewall LAN-block rules.

## Open Items Deferred

- Agent-native `agent_env_prepare` hook (medium-term). For now the wrapper is sufficient.
- Cardano signing keys in the HSM (only needed if Logan moves from commentary to signing).
- Non-interactive `openclaw tee unlock --pin-from credmgr` flag (for SYSTEM-context scheduling).
- `openclaw tee health-check` CLI convenience.

## Non-Goals (explicit)

- Running Gemma 4 31B or 26B on this host.
- Cloud API fallback. If Ollama dies, Logan pauses — we accept that for this iteration.
- Pre-pulling models we do not use.
- Replacing Squid. The proxy stays exactly as it is.
