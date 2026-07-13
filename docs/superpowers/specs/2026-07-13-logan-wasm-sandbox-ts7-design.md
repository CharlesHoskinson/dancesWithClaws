# Design: Logan WASM sandbox + TypeScript 7 toolchain

**Date:** 2026-07-13  
**Status:** Approved (Approach A)  
**Repo:** `CharlesHoskinson/dancesWithClaws` (Logan / ELL on OpenClaw)

## Summary

Replace Logan’s **Docker-in-WSL2 agent sandbox and Squid egress path** with a **Rust + Wasmtime** host that runs **WASI (P2) guest modules** under explicit capabilities. Keep the **OpenClaw gateway and Ollama on the host (Node + local models)**. Adopt **TypeScript 7** for typecheck/IDE/CI speed. Do **not** rewrite the full OpenClaw monorepo to Rust in this milestone.

## Motivation

Today Logan depends on:

| Component | Role |
|-----------|------|
| `Dockerfile.sandbox` | Isolate agent `exec` / tools |
| Squid proxy + `security/proxy/allowed-domains.txt` | Egress allowlist |
| WSL2 Docker | Where that stack actually runs on Windows |

That path is heavy (cold start, WSL coupling, dual OS). Industry guidance (2026) treats WASM as best for **capability-scoped plugins and short sandboxed tasks**, and Docker as still appropriate for full POSIX / long-running infra. Logan’s agent tool isolation matches WASM’s strengths. TypeScript 7’s native (Go) compiler delivers large typecheck speedups on monorepos without changing the runtime language.

## Goals

1. Run Logan agent tool isolation **without requiring WSL2 Docker**.
2. Enforce **deny-by-default egress** (allowlist equivalent to current proxy policy).
3. Scope filesystem access to **workspace (and explicit roots only)**.
4. Integrate with OpenClaw as a first-class sandbox backend (`wasm`), with Docker optional fallback.
5. Adopt **TypeScript 7** for Logan-facing and (where green) monorepo typecheck/CI.
6. Preserve security *intent* of the current hardened stack (non-ambient authority, timeouts, size limits).

## Non-goals

- Rewriting OpenClaw gateway/core/channels to Rust.
- Running Ollama inside WASM.
- Full monorepo “all code is Rust.”
- Perfect POSIX / interactive `bash` inside the guest.
- Deprecating Docker for Azure/Caddy deploy in this milestone (out of band).
- Browser-only Wasm; target is **server-side WASI + Component Model where useful**.

## Current state (baseline)

- Agent: `logan` in `openclaw.json`; model `ollama/gemma4:e2b` (+ fallbacks).
- Sandbox config: Docker image `openclaw-sandbox:bookworm-slim`, network `oc-sandbox-net`, proxy DNS/extraHosts, seccomp, `exec` allowlisted to `curl`.
- Proxy allowlist (post-Moltbook): `.openai.com`, `.sokosumi.com` (and related).
- Monorepo: overwhelmingly TypeScript/Node; negligible Rust outside Tauri Linux bits.
- Proven smokes: Docker proxy allowlist (WSL), host gateway + Ollama agent turn (sandbox off).

## Target architecture

```text
┌──────────────────────────────────────────────────────────────┐
│ Host (Windows preferred; Linux OK)                           │
│                                                              │
│  Ollama (gemma4:e2b)                                         │
│  OpenClaw gateway (Node; typechecked with TS 7)              │
│       │                                                      │
│       │  tool dispatch (exec / wasi tools)                   │
│       ▼                                                      │
│  openclaw-wasm-sandbox (Rust)                                │
│       │  Wasmtime + WASI Preview 2                           │
│       │  policy (allowlist, roots, mem, time, bytes)         │
│       ├─ guest modules (Rust → wasm32-wasip2)                │
│       │    e.g. wasi-curl-equivalent, scoped fs helpers      │
│       └─ host-mediated HTTPS (allowlist enforced in Rust)    │
└──────────────────────────────────────────────────────────────┘
```

### Host (Rust)

Responsibilities:

- Load policy from disk (reuse / extend `security/proxy/allowed-domains.txt` format).
- Instantiate Wasmtime store with **no ambient authority**.
- Preopen only configured directories (workspace path from OpenClaw).
- Mediate outbound HTTPS: guest requests → host client → **domain allowlist check** → response capped by size/time.
- Enforce wall-clock timeout, fuel/memory limits, max concurrent guests.
- Emit structured results (JSON) consumable by OpenClaw tool layer.

### Guests (WASM)

- Prefer **Rust** crates compiled to `wasm32-wasip2`.
- First guest: HTTPS fetch/curl-equivalent **via host import**, not raw unrestricted sockets.
- No general shell, no `docker.sock`, no host process spawn from guest.
- Future tools register as additional modules with the same policy envelope.

### OpenClaw integration

- Add sandbox backend mode: `wasm` (name TBD in implementation, e.g. `agents.defaults.sandbox.backend` or Logan-local override).
- Map existing tool policy:
  - `exec` + `safeBins: ["curl"]` → only the registered WASM curl tool (or host-mediated curl API).
  - `read` / `write` / `edit` → either stay host-side with path guards, or WASI preopens; **must not** widen beyond workspace.
- Keep `backend: "docker"` optional for parity/debug; **Logan default becomes `wasm`**.

## Mapping: Docker pieces → WASM

| Docker / WSL today | Milestone replacement |
|--------------------|------------------------|
| `Dockerfile.sandbox` + `sandboxuser` | Wasmtime guest; no Linux user |
| Squid + allowlist file | Rust host allowlist (same domain list source) |
| `oc-sandbox-net` / proxy DNS | Host-only networking; guest never open world sockets |
| seccomp / cap_drop | WASI capabilities + host resource limits |
| `exec` curl only | Registered WASM / host-mediated HTTP tool |
| Gateway + Ollama | Unchanged on host |

## TypeScript 7

| Item | Decision |
|------|----------|
| What TS 7 is | Native Go port of the compiler/language service (~8–12× typecheck on large codebases); app still TypeScript → JS |
| Logan use | Install `typescript@7` for `tsc` / CI / editor; enable parallel checkers where CI CPU allows |
| Compatibility | Side-by-side TS 6 API package if eslint/plugins need programmatic API until 7.1 |
| Scope order | (1) Logan scripts/config packages and CI job, (2) widen monorepo typecheck if clean |
| Not claimed | “Runtime is TS 7” — Node still runs emitted JS |

## Phased delivery

| Phase | Deliverable | Exit criteria |
|-------|-------------|---------------|
| **P0** | This design + implementation plan | Spec + plan in `docs/superpowers/` |
| **P1** | Rust host + policy + allowlist HTTP smoke CLI | Allowlisted host succeeds CONNECT/HTTP; denied host fails; no Docker — **DONE** (`tools/logan-wasm-sandbox`, smoke script; hardening: per-hop redirects + streaming body cap) |
| **P2** | OpenClaw backend wired; Logan agent turn uses wasm sandbox | Agent turn OK on Windows host without Docker/WSL — plan: `docs/superpowers/plans/2026-07-13-logan-wasm-sandbox-openclaw-backend.md` |
| **P3** | TS 7 in CI for agreed package set | Green typecheck; documented install |
| **P4** | Defaults + docs; Docker path optional | `openclaw.json` + README default to wasm |

## Research note (2026-07-13)

Long-form industry assessment (WASM-first **hybrid**, WIT brokers, native/microVM fallback for shell/browser/GPU) is filed at:

- `docs/superpowers/research/2026-07-13-docker-wsl-to-wasm-sandbox.md`

P1 is the hot-path proof (embedded Wasmtime host + host-mediated HTTPS). P2 wires OpenClaw’s existing `registerSandboxBackend` surface. Full WIT worlds, worktree schedulers, and microVM fallback remain post-P2.

## Security requirements

1. **Default deny** network; allowlist is the only egress path for tool HTTP.
2. **No ambient FS**; only preopened roots from config.
3. **No host exec** from guest (no shell breakout).
4. **Timeouts and byte caps** on every guest invocation.
5. **Secrets** never logged; allowlist and policy paths are not secrets but policy files are reviewed as security-critical.
6. **Parity tests** with former proxy smoke: allow vs deny domains.

## Testing strategy

| Layer | Tests |
|-------|--------|
| Rust unit | Allowlist matching, path canonicalization, timeout, size limits |
| CLI integration | Host binary runs guest against mock HTTP / real public endpoints (deny evil.com-class) |
| OpenClaw | Config loads `backend=wasm`; agent turn with `sandbox` on; tool policy still denies browser/spawn/create_job |
| Regression | Existing deploy tests remain green; docker smoke remains available behind flag |
| TS 7 | CI job runs native `tsc`; failure blocks merge once adopted |

## Risks and mitigations

| Risk | Mitigation |
|------|------------|
| Expectation of full bash in sandbox | Document tool catalog only; no shell |
| Upstream OpenClaw Docker assumptions | Thin adapter; minimize fork surface; prefer config-driven backend |
| Windows TLS / proxy edge cases | Host uses OS TLS; single HTTP stack in Rust |
| Scope creep to full rewrite | Non-goals enforced in PR review |
| WASI API churn | Pin Wasmtime + wasi version; prefer host-mediated HTTP over full sockets in P1 |

## Success criteria (milestone complete)

1. Logan completes an agent turn on **Windows host** with wasm sandbox and **no Docker/WSL**.
2. Tool HTTPS is **allowlist-enforced** (policy file).
3. Workspace mutations cannot escape configured roots.
4. TypeScript 7 typechecks the agreed package set in CI.
5. Design and plan documents are committed under `docs/superpowers/`.

## Out-of-scope follow-ons (later milestones)

- Rust rewrite of gateway / session runtime.
- Spin/Kube/edge deployment of Logan workers.
- GPU or Ollama-in-sandbox.
- ComponentizeJS for TypeScript guests (optional after Rust guests stable).

## References

- [Docker vs WebAssembly (2026)](https://wasmruntime.com/en/blog/docker-vs-webassembly-2026) — isolation, cold start, hybrid recommendation.
- [Announcing TypeScript 7.0](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/) — native Go compiler, tooling not language rewrite.
- Wasmtime / WASI P2 / Component Model (Bytecode Alliance); Spin (CNCF) for future edge packaging.
- Wasm I/O 2026: Wasm as agent sandbox isolation model.

## Decision record

| Decision | Choice |
|----------|--------|
| Strategy | **A — Logan sandbox-first** |
| Runtime | Wasmtime embedded in Rust host |
| Guest language (P1) | Rust → `wasm32-wasip2` |
| Egress | Host-mediated HTTPS + domain allowlist |
| Gateway / LLM | Host Node + Ollama |
| TS 7 | Toolchain/CI first |
| Docker | Optional fallback; not required for Logan default path |

---

**P1 plan:** `docs/superpowers/plans/2026-07-13-logan-wasm-sandbox-host.md` (executed).  
**P2 plan:** `docs/superpowers/plans/2026-07-13-logan-wasm-sandbox-openclaw-backend.md`.
