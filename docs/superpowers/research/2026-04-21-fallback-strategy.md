---
topic: Logan fallback cascade redesign (Gemma 4 variants)
date: 2026-04-21
status: research-complete
recommendation: Drop 31b. Keep e4b + conditional 26b. No pre-pull. Optional cloud backstop via vaulted key.
confidence: 0.75
---

# Fallback Strategy Research — Logan

## What Actually Triggers Fallback in OpenClaw

From `src/agents/model-fallback.ts` + tests:

- Auth / billing / rate-limit errors
- HTTP 5xx transient + overload signals
- Network failures (ECONNREFUSED/ETIMEDOUT/EAI_AGAIN…)
- "Unknown model" / "Model not found"
- Runtime AbortErrors (properly named)
- **Exception:** context-overflow errors rethrow immediately — no cascade.

## Which Failures the Local Cascade Helps With

| Failure mode           | Helps?                                |
| ---------------------- | ------------------------------------- |
| Model not pulled       | ✓ (next model tried)                  |
| OOM at load time       | ✓ (smaller next model might fit)      |
| Context overflow       | ✗ (rethrow)                           |
| **Ollama server down** | ✗ (all four ECONNREFUSED identically) |
| Runtime crash          | △ (depends on cause)                  |

**Key insight:** the dominant local failure — Ollama process dead — is not improved by the local cascade; it just makes the failure slower (each model incurs its own connect/timeout before moving on).

## Cold-Load Cost at Fallback Time

| Transition | Disk delta | SSD cold-load (approx) |
| ---------- | ---------- | ---------------------- |
| e2b → e4b  | +2.4 GB    | 20–40 s                |
| e4b → 26b  | +8.4 GB    | 40–90 s                |
| 26b → 31b  | +12–15 GB  | 60–120 s               |

Ollama does not auto-evict on model switch; memory pressure drives eviction.

## VRAM Reality (Q4_K_M)

| VRAM  | e2b  | e4b      | 26b      | 31b  |
| ----- | ---- | -------- | -------- | ---- |
| 8 GB  | ✓    | marginal | ✗        | ✗    |
| 12 GB | ✓+KV | ✓        | ✗        | ✗    |
| 16 GB | ✓+KV | ✓+KV     | marginal | ✗    |
| 24 GB | ✓+KV | ✓+KV     | ✓+KV     | ✗    |
| 48 GB | ✓+KV | ✓+KV     | ✓+KV     | ✓+KV |

User's host VRAM is unknown — must be confirmed before finalizing.

## Workload Fit

Logan heartbeats every 1 h, emits 200–1000-token posts, pulls ≤ ~16 K context after RAG. e2b is likely sufficient on quality; bigger fallbacks buy marginal quality for large cold-load cost. Latency tolerance is loose (hour-scale), so a 30–90 s cold-load on rare fallback is acceptable.

## Local-Only vs Cloud Backstop

- **Local-only (status quo):** Ollama dead = Logan silent. The cascade makes that failure slower, not fixed.
- **Cloud backstop (haiku-4-5 or similar):** Ollama dead → cloud still serves. Trade: ~$0.002–0.005 per post, keys need vaulting, audit trail shows cloud origin, partial walk-back on "fully local".

## Revised Fallbacks

```json
"fallbacks": [
  "ollama/gemma4:e4b",
  "ollama/gemma4:26b"
]
```

Rationale:

- Drop `gemma4:31b` — needs 24+ GB VRAM comfortably, >30 GB disk, cold-load dominates at the size. Rarely reached, rarely useful.
- Keep `e4b` — cheap secondary, fits alongside e2b on 12 GB+ systems, 20–30 s recovery.
- Keep `26b` only conditional on ≥16 GB VRAM. For <16 GB hosts, drop to `["ollama/gemma4:e4b"]` only.

Optional (after HSM vault is wired) — append cloud backstop:

```json
"fallbacks": [
  "ollama/gemma4:e4b",
  "ollama/gemma4:26b",
  "anthropic/claude-haiku-4-5"
]
```

Cloud key MUST live in YubiHSM-sealed vault, not `.bashrc`. Also requires logging/alerting on cloud-fallback so "Ollama is quietly down" doesn't become "mystery API bill".

## Pre-Pull Decision

- `gemma4:31b` — **do not pre-pull.** Would waste ~30+ GB on a model unlikely to be used.
- `gemma4:26b` — **conditional.** Pre-pull only if VRAM ≥ 24 GB and NVMe, otherwise on-demand is fine.
- `gemma4:e4b` — already pulled, keep.
- `gemma4:e2b` — already pulled, primary.

## Summary

| Item           | Decision                       |
| -------------- | ------------------------------ |
| Drop 31b       | Yes                            |
| Keep 26b       | Conditional on VRAM ≥ 16 GB    |
| Keep e4b       | Yes                            |
| Cloud backstop | Optional, only via vaulted key |
| Pre-pull 26b   | Only if VRAM ≥ 24 GB           |
| Pre-pull 31b   | Never                          |

## Host Confirmed (2026-04-21)

- GPU: **Intel Arc 140V** (Lunar Lake integrated), 16 GB shared memory
- System RAM: **32 GB**
- Implication: integrated GPU with shared pool, not discrete VRAM. Ollama on Intel Arc requires SYCL/Level-Zero; performance tier roughly equivalent to a low-end discrete card.
- **26b is borderline** on 16 GB shared (will partial-offload to CPU). **31b is unusable** (RAM pressure would push the system into swap).

## Final Cascade for This Host

```json
"fallbacks": ["ollama/gemma4:e4b"]
```

Single fallback. Drop both 26b and 31b. If Ollama dies, Logan pauses rather than cascading through unusable models. Cloud backstop becomes attractive _after_ HSM vault is ready.

## Sources

- gemma4.wiki VRAM requirements guide
- Ollama Gemma 4 size comparison posts (April 2026)
- OpenClaw `src/agents/model-fallback.ts` + tests
