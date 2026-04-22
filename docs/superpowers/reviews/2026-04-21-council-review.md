---
title: Council review — Logan Local Stack design
date: 2026-04-21
spec: ../specs/2026-04-21-logan-local-hsm-gemma-design.md
reviewers: security | ops-sre | architecture | perf-cost
verdict: approve-with-conditions (all four)
---

# Council Review — Logan Local Stack

Four independent reviewers read the [unified design](../specs/2026-04-21-logan-local-hsm-gemma-design.md) and four [research artifacts](../research/). Summary verdicts:

| Lens         | Verdict                                                     | High | Med | Low |
| ------------ | ----------------------------------------------------------- | ---- | --- | --- |
| Security     | Approve with conditions                                     | 1    | 5   | 1   |
| Ops / SRE    | Approve with conditions (3am score 5/10 → 8/10 after fixes) | 4    | 5   | 3   |
| Architecture | Proceed with schema pass + hook-now                         | 2    | 4   | 4   |
| Perf / Cost  | Cautiously feasible (60–70% confidence, GPU unvalidated)    | 2    | 6   | 2   |

## High-severity findings (all four lenses consolidated)

| #   | Finding                                                                                                                                                                    | Lens       | Resolution                                                                                                                                                       |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| H1  | Windows DPAPI/Credential-Guard kernel-trust boundary not explicit. Host-SYSTEM compromise → PIN → HSM unlock.                                                              | Sec        | Explicit note added to spec Threat-Model; mitigation = YubiHSM touch-required auth or interactive Windows Hello for PIN (deferred)                               |
| H2  | Wrapper script does not exist; Task Scheduler can't fire nothing.                                                                                                          | Ops        | Wrapper and hook both shipped in Phase D/E (not deferred). Owner: this implementation plan.                                                                      |
| H3  | Service-context PIN resolution hangs. `credentialManager.resolveHsmPin()` prompts when Credential Manager lookup fails. Task Scheduler `run as SYSTEM` breaks it silently. | Ops        | Pin Task Scheduler to **user context**, add `--pin-from credmgr` non-interactive flag (small CLI change, included in plan)                                       |
| H4  | Ollama-readiness race at startup. Systemd start is async; wrapper may `docker run` before socket binds.                                                                    | Ops        | Add readiness gate in wrapper (`until curl --unix-socket … /api/tags; do sleep 1; done`, with 60s timeout)                                                       |
| H5  | Observability is a hand-wave. No log paths, severity levels, or grep patterns for each failure mode.                                                                       | Ops        | Plan adds Observability Runbook: explicit log paths + grep patterns per failure class                                                                            |
| H6  | Wrapper-vs-hook split creates two test surfaces and tech debt.                                                                                                             | Arch       | Build both in the same phase; wrapper becomes thin bootstrap for `YUBIHSM_PIN`; hook does the vault work in-process                                              |
| H7  | `vault://` URI scheme is ambiguous vs. existing empty-string `env.vars` defaults.                                                                                          | Arch       | Introduce a separate `secrets` block in `openclaw.json`, keyed by entry label. `env.vars` stays literal.                                                         |
| H8  | Arc 140V + Gemma 4 e2b on Ollama SYCL is unvalidated. If <5 t/s, Logan misses the hour window.                                                                             | Perf       | Pre-flight: 1h GPU smoke test before any other Phase. Abort-and-redesign gate.                                                                                   |
| H9  | Single-fallback cascade + no cloud backstop = silent pause on Ollama crash.                                                                                                | Sec + Perf | Acceptable given 1h heartbeat, but adds: systemd auto-restart for Ollama; `openclaw tee health-check`-style gate at wrapper start; visible log line when paused. |

## Medium findings (selected, merged)

- **PIN transiently in `$env:YUBIHSM_PIN`** (Sec): move unlock inside the hook; wrapper only sets `YUBIHSM_PIN` for that subprocess window.
- **Ollama API unrestricted** (Sec): restrict to `/api/generate`, `/api/embed`, `/api/chat`, `/api/tags` via a tiny local reverse-proxy shim or unixsocketd filter. Block `/api/pull`, `/api/delete`, `/api/copy`, `/api/create`.
- **Shared socket contention** (Arch + Perf): chat and embedding through one socket; long inference blocks RAG. Accept for 1h heartbeat; re-evaluate if heartbeat frequency increases.
- **Phase C/E cleanup gaps** (Ops): Phase C must explicitly write new `fallbacks: ["ollama/gemma4:e4b"]` to `openclaw.json`. Phase E must back up `openclaw.json` before edit. Phase D's `tee init` must check-and-bail if vault exists.
- **Backup strategy is one-shot** (Ops): Add recurring vault backup after `session_end`; destination must be off-disk (IronKey per `mostlySecure.md`); restore test monthly.
- **Shared GPU memory pressure** (Perf): 7.2 GB Gemma + 0.7 GB embedder + KV cache can spike to 10–12 GB; watch Arc memory; consider CPU for embeddings.
- **Schema growth** (Arch): before code lands, decide: `secrets` block vs. inline `vault://`, mount volumes under `docker.extraVolumes` or new top-level `mounts`, fallback policy separate from cascade list.
- **Model digest pinning** (Sec): tag by digest, not label (e.g. `gemma4:e2b@sha256:…`) in the primary config to resist supply-chain swap.
- **Quality regression risk** (Perf): day-1 canary post review; be prepared to toggle cloud backstop if coherence regresses visibly.
- **Squid fallback brittle** (Perf + Sec): if used at all, raise `read_timeout` to 120s; otherwise remove the fallback path entirely rather than leave it silently broken.

## Low findings (rolled into plan as checklist items)

- Version pins for Ollama, YubiHSM firmware, graphene-pk11 in an "approved versions" block.
- Hot-reload path for model upgrades (pause → pull → update config → start).
- Heartbeat health-check command and last-heartbeat-timestamp signal.
- Explicit Task Scheduler registration snippet in the runbook.
- Full Ollama uninstall+reinstall sequence (scoop removal is terse today).
- Socket path existence pre-check at Phase A.0.

## Accepted residual risks

1. **Host SYSTEM compromise defeats the vault.** Documented in threat model. Kernel must be trusted; HVCI/KMCI is out of scope.
2. **Ollama RCE jailbreak** escapes the sandbox into WSL2, but Windows Firewall prevents LAN lateral movement.
3. **Silent pause** on Ollama catastrophic failure. Logan skips posts until operator restarts. Acceptable at 1h cadence with monitoring.

## Changes applied to the spec

After folding the findings:

1. Threat model section adds kernel-trust boundary, DPAPI limitation, and Ollama API-surface restriction.
2. Architecture section replaces wrapper-only-now with wrapper-AND-hook in the same phase.
3. Schema decision: introduce `secrets` block in `openclaw.json` rather than mixing `vault://` URIs into `env.vars`.
4. Phase A gets a new A.0 pre-flight: GPU smoke test (1h on Arc 140V), socket-path check, version-pin capture.
5. Phase C includes explicit `openclaw.json` edit for `fallbacks`.
6. Phase D includes vault-exists guard, backup-before-edit rule, and `--pin-from credmgr` CLI shim.
7. Observability Runbook added with log paths and grep patterns.
8. Verification tests grow a canary task (day-1 post review).

See updated [spec](../specs/2026-04-21-logan-local-hsm-gemma-design.md) for applied edits.
