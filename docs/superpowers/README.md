# Superpowers Wiki — Logan

Structured record of design, research, reviews, and plans produced while running Logan entirely local on this host.

**Host baseline (2026-04-21):** Windows 11 / WSL2, Intel Arc 140V (16 GB shared) + 32 GB RAM, YubiHSM 2 attached, Ollama via scoop (to be migrated into WSL2).

## Index

### Specs

- [2026-04-21 — Logan Local Stack unified design](specs/2026-04-21-logan-local-hsm-gemma-design.md) — Gemma 4 (e2b primary, e4b fallback) + mxbai-embed-large + YubiHSM-vaulted secrets + Unix-socket sandbox path. **Status: draft (post-council, folded feedback pending).**

### Research

- [2026-04-21 — Embeddings provider](research/2026-04-21-embeddings.md) — Swap to `ollama/mxbai-embed-large` (1024 dim), rollback `nomic-embed-text`. Confidence 0.85.
- [2026-04-21 — Sandbox network](research/2026-04-21-sandbox-network.md) — Primary: Unix-socket bind-mount. Fallback: Squid HTTP forward for non-streaming. Confidence 0.70.
- [2026-04-21 — HSM workflow](research/2026-04-21-hsm-workflow.md) — Wrapper script near-term, `agent_env_prepare` hook medium-term. Confidence 0.80.
- [2026-04-21 — Fallback strategy](research/2026-04-21-fallback-strategy.md) — Drop 26b/31b. Single `e4b` fallback on Intel Arc 140V. Confidence 0.75.

### Reviews

- [2026-04-21 — Council review (merged)](reviews/2026-04-21-council-review.md) — Security + Ops/SRE + Architecture + Perf/Cost reviewers.

### Plans

- [2026-04-21 — Implementation plan](plans/2026-04-21-logan-local-hsm-gemma-plan.md) — Phase A–G executable steps.

### Diagrams

- [logan-local-stack.mmd](diagrams/logan-local-stack.mmd) — Mermaid source. Renders in GitHub.

## Ground rules

- Specs are living docs; update them when the design changes, not the plan.
- Research docs are snapshots at a date. Don't rewrite history — supersede with a new doc and link from the old one.
- Every review produces findings. Each finding is resolved by an edit to the spec, an item in the plan, or an explicit accept-the-risk note.
- No AI attribution in commits, per repo conventions.
