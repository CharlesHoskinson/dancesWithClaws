# Plan 02 — HSM Loose Ends + Real-Device Bootstrap + Logan E2E

**Status:** Design — awaiting writing-plans handoff
**Date:** 2026-04-20
**Base branch:** `feature/hsm-loose-ends` (off `master`, with Plan 01 vendor-ported in a preceding commit)
**Author:** Charles Hoskinson (with Claude)

---

## 1. Context

Plan 01 delivered the YubiHSM2 driver, simulator, blueprint parser, reconcile loop, CLI verbs, CI, and T0 wire goldens. 77 tests green, all against the simulator. The spec's §5 self-review flagged three items as scope-deferred:

1. **R-MAC verification** — `unwrapSessionResponse` decrypts the body but never verifies the response MAC. A tampered response would silently decrypt to garbage. The simulator wraps with a real R-MAC, so the protocol data is already on the wire; the driver just ignores it.
2. **Credential Manager wiring** — `openclaw hsm` takes `--admin-enc/--admin-mac` as hex flags. Real operators need to pull sealed SCP03 keys from Windows Credential Manager via the existing `extensions/tee-vault/src/integrations/credential-manager.ts` surface.
3. **`plan.update` drift detection** — `plan()` only compares auth-key IDs. Capability / domain / delegated-capability drift is invisible. The spec's `blueprint_converges` theorem (§4.5) requires full state equivalence.

The user additionally asked for:

- Adversarial / QA subagents reviewing the code (not just a code-quality pass — crypto integrity deserves red-team testing).
- A provision-a-brand-new-YubiHSM2 bootstrap flow on real hardware.
- A Logan (Moltbook Cardano-educator agent) end-to-end run with HSM-sealed credentials using local Gemma for the LLM step: fetch news via Perplexity → summarize via local Gemma → post to Moltbook.

## 2. Goals

1. **R-MAC integrity.** Every wrapped response is verified before its decrypted payload is trusted. Tampered responses raise a typed error; audit logs the attempt.
2. **Operator-clean credential handling.** `openclaw hsm bootstrap/apply/diff` reads SCP03 keys from Windows Credential Manager via a pluggable `CredentialResolver` interface. Hex flags remain for CI / tests.
3. **Reconcile drift detection.** `plan()` emits an `update` step whenever an auth key's capabilities, domains, or delegated capabilities diverge from the blueprint. `apply()` executes updates (delete-then-put, since YubiHSM2 has no in-place auth-key rewrite).
4. **Brand-new-device bootstrap.** `openclaw hsm bootstrap` detects the factory state, derives SCP03 keys from the factory password via PBKDF2-SHA256, generates a random admin key, writes it into Credential Manager, replaces the factory admin, then applies `hsm-blueprint.yaml` end-to-end. Idempotent: re-running on an already-bootstrapped device is a no-op.
5. **Logan end-to-end on real hardware.** A harness script that, given a plugged-in YubiHSM2, seals `MOLTBOOK_API_KEY` + `PERPLEXITY_API_KEY` under the `plugin-sealer` auth key, then runs Logan through one full turn: Perplexity research → Gemma summarize → Moltbook post. Green means the complete sealed-credential pipeline works on silicon.
6. **Adversarial QA.** For the R-MAC work specifically, write attack tests before implementation (adversarial TDD). For every other task, dispatch the `superpowers:code-reviewer` subagent after green.

## 3. Non-goals

- **Attestation chain verification** (§4.4(d)) — deferred to Plan 03 alongside the rest of the P2 work.
- **Audit-log drain worker** — we include a *minimal* drainer as a provisioning-safety net (the device wedges after ~62 commands under `permanent_force_audit: true`), but the full periodic worker is P2.
- **Wrap-key / opaque-object drift detection** — `plan.update` only covers auth keys in this plan. Wrap keys get create-only support; opaque objects remain unmanaged.
- **Remote LLM providers** — the Anthropic key would normally be sealed, but the user chose local Gemma via Ollama; no remote-LLM credential is part of this plan's sealed-set.
- **In-place YubiHSM2 session reconnect** — if the bootstrap flow crashes mid-provision, the operator recovers by factory-reset (`openclaw hsm factory-reset --confirm`) and re-runs. No crash-recovery state machine.

## 4. Approaches considered

### 4.1 R-MAC verification

**A. Verify inside `unwrapSessionResponse`, track response-ICV per session.** Driver and simulator both maintain a response-side ICV chain (initialized to all-zero, advanced by each response MAC). Unwrap computes `expected = CMAC(S-RMAC, prev_response_icv || wrapped_without_mac)[0..8]`, compares to the frame's trailing 8 bytes, throws `ResponseMacError` on mismatch. **Recommended** — keeps the crypto boundary inside the primitive, keeps sim/driver symmetric.

**B. External `verifySessionResponse()` helper called from `session.sendCommand` only.** Leaves the primitive as a pure decrypt. **Rejected** — an unverified decrypt is a tempting foot-gun; callers may skip the verify step.

**C. Best-effort verify with a feature flag.** **Rejected** — the spec's P1 gate says response integrity matters. No flag.

### 4.2 Credential Manager wiring

**A. Inline calls.** `hsm apply` calls `getCredential('TeeVault-YubiHSM-<role>')` directly per auth_key.credential_ref. **Rejected** — couples the CLI to Windows, makes cross-platform testing awkward.

**B. Pluggable `CredentialResolver` interface with three built-in resolvers** (Windows Credential Manager / hex flags / JSON file), selected by CLI priority: explicit flag > config file > Credential Manager. Test doubles plug in trivially. **Recommended** — matches the pattern used by `resolveCommandSecretRefsViaGateway` in the existing security-cli.

**C. One-shot import then env vars.** `hsm set-admin-credential` seeds `HSM_ADMIN_ENC_HEX` + `HSM_ADMIN_MAC_HEX` at every subsequent invocation. **Rejected** — defeats the point of Credential Manager (keys would land in process environment, visible to other processes).

### 4.3 Reconcile drift detection

**A. Per-auth-key `GET_OBJECT_INFO` calls in `plan()`.** Fetches capabilities, domains, delegated-capabilities, algorithm, label. Emits update step if any diverge. **Recommended** — matches spec §4.5 `blueprint_converges`.

**B. Skip drift detection; only detect presence.** **Rejected** — cap drift silently leaves the device over-privileged.

**C. Full drift detection for all object types.** **Rejected** — scope creep; wrap keys and opaques don't have drift concerns for this plan's use cases.

### 4.4 Brand-new-device bootstrap

**A. Password-derived factory session + random admin replacement + blueprint apply.** Single `openclaw hsm bootstrap` verb that does all three in order, idempotent re-runs (detect if admin ≠ factory, skip replacement). **Recommended.**

**B. Separate verbs.** `hsm factory-login`, `hsm rotate-admin`, `hsm apply`. **Rejected** — operators do these together; separate verbs add order-of-operations foot-guns.

**C. Require manual admin rotation first, blueprint-apply separately.** **Rejected** — same foot-gun risk; operators forget to rotate admin before provisioning workers.

### 4.5 Logan end-to-end harness

**A. Ollama + gemma3:4b on localhost.** Harness script starts `ollama serve` (or detects running), pulls the model if missing, runs Logan with `LLM_PROVIDER=ollama LLM_MODEL=gemma3:4b`. **Recommended** — smallest moving parts on Windows, no native build.

**B. In-process `node-llama-cpp`.** **Rejected** — heavy native dependency, Windows builds can be fragile.

**C. Perplexity does both research and summarization, no local LLM.** **Rejected** — doesn't match user's explicit "use local Gemma" ask.

### 4.6 Adversarial QA strategy

**A. Code-reviewer pass after every task.** Standard `superpowers:code-reviewer`. **Recommended for every task.**

**B. Dedicated crypto red-team pass for R-MAC only.** A subagent whose prompt is "generate five classes of tampering attacks against an R-MAC-verified response stream; confirm each is rejected by the driver with the correct error." **Recommended in addition to (A) for the R-MAC task.**

**C. Adversarial TDD** — write attack tests first, treat them as the failing tests for R-MAC's TDD cycle. **Recommended** — crypto features that only test the happy path are a known failure mode; attack tests *are* the spec.

All three combine: C+B+A for R-MAC; A for everything else.

## 5. Architecture

### 5.1 New / modified files

```
packages/yubihsm/
  src/scp03/wrap.ts                 (modify: R-MAC verification path)
  src/session.ts                    (modify: track response-ICV, pass to unwrap)
  src/commands/get-object-info.ts   (new: CMD 0x4E)
  src/commands/factory-reset.ts     (new: CMD 0x08 — bootstrap safety net)
  src/scp03/password-kdf.ts         (new: PBKDF2 factory password → enc/mac)
  src/blueprint/reconcile.ts        (modify: detect + emit update steps)
  src/credential-resolver/
    types.ts                        (new: CredentialResolver interface + ResolvedCredential)
    hex-flag.ts                     (new: reads from CLI flags)
    json-file.ts                    (new: reads from $HOME/.openclaw/hsm-creds.json)
    compose.ts                      (new: priority chain)

extensions/tee-vault/src/integrations/credential-manager.ts  (extend with hsm-cred helpers)

src/cli/
  hsm-cli.ts                        (modify: wire CredentialResolver chain + bootstrap verb)

packages/yubihsm-sim/
  src/handlers.ts                   (modify: per-session response-ICV tracking, GET_OBJECT_INFO handler, FACTORY_RESET handler)
  src/sessions.ts                   (modify: responseIcv field on SessionState)

# end-to-end
tools/hsm-logan-e2e/
  run.ts                            (new: orchestration script)
  ollama.ts                         (new: detect + start + pull model)
  README.md                         (new: operator runbook)

# tests
packages/yubihsm/tests/
  scp03/wrap.adversarial.test.ts    (new: R-MAC attack suite)
  commands/get-object-info.test.ts  (new)
  blueprint/reconcile.update.test.ts (new: drift detection)
  integration/real-device.test.ts   (new: optional, skips if no device)
```

### 5.2 Key data flows

**R-MAC verification (driver):**

```
outer response bytes  ─►  decodeResponse()
                            │
                            ▼
                         outer.data  (1B sessionId | encBody | 8B MAC)
                            │
         session state (sRmac, prevResponseIcv) ─► unwrapSessionResponse({
                            │                        sEnc, sRmac, icv=prevResponseIcv,
                            │                        counter, wrapped })
                            │                       computes CMAC(sRmac, prevResponseIcv || sessionId||encBody)
                            │                       verifies ==  trailing 8 MAC bytes
                            │                       throws ResponseMacError on mismatch
                            │                       else returns inner + newResponseIcv = full CMAC
                            ▼
                    sessionState.responseIcv = newResponseIcv
                    decoded inner APDU passes to sendCommand caller
```

**CredentialResolver (CLI):**

```
hsm apply \
  --admin-id 2 \
  [--admin-enc HEX] \
  [--admin-mac HEX] \
  [--creds-file path.json]
                            │
                            ▼
                    composeResolver([
                      hexFlagResolver(opts),              // priority 1
                      jsonFileResolver(path),             // priority 2
                      credentialManagerResolver(),        // priority 3
                    ])
                            │
                            ▼
                    resolve({role: "admin", id: 2})
                            │
                            ▼
                    first non-null  ►  {encKey, macKey}  ►  openSession(...)
```

**Bootstrap flow:**

```
openclaw hsm bootstrap --blueprint hsm-blueprint.yaml
  1. GET_DEVICE_INFO (unwrapped)                    ← probe connector
  2. try openSession(authKeyId=1, factory_pw="password")
     (factory keys = PBKDF2-SHA256(pw, "Yubico", 10000, 32) split 16|16)
  3. if fails → device already bootstrapped, skip to step 6
  4. generate randomBytes(32) → newEncKey | newMacKey
  5. putAuthenticationKey(id=1, label="admin", caps=from blueprint, delegated=from blueprint,
                          encKey=newEncKey, macKey=newMacKey)
     closeSession()
     writeCredentialManager("TeeVault-YubiHSM-Admin", newEncKey|newMacKey as hex)
  6. openSession(authKeyId=1, new admin keys from Credential Manager)
  7. plan(), apply() — exactly the same as hsm apply
  8. factory-reset-if-aborted trap (ctrl+c): leaves a HALF_APPLIED.marker so next run picks up
```

**Logan E2E harness:**

```
tools/hsm-logan-e2e/run.ts
  1. start ollama (spawn ollama serve, wait for :11434)
  2. pull gemma3:4b if missing
  3. openclaw hsm bootstrap  (idempotent)
  4. seal MOLTBOOK_API_KEY + PERPLEXITY_API_KEY via plugin-sealer wrap key
     → write sealed blobs to $HOME/.openclaw/sealed-secrets/
  5. invoke Logan with prompt: "Find today's Cardano governance news, summarize for Moltbook, post it."
     Logan's tools:
       perplexity.search(query)   → unwraps PERPLEXITY_API_KEY, calls API
       gemma.summarize(text)      → localhost:11434
       moltbook.post(content)     → unwraps MOLTBOOK_API_KEY, calls API
  6. poll Moltbook API for Logan's latest post
  7. assert: post exists, contains Cardano-related keywords, is within the last 60s
  8. teardown: stop ollama, close sessions
```

### 5.3 Error handling

- **`ResponseMacError`** — new typed error in `@dancesWithClaws/yubihsm`. Thrown by `unwrapSessionResponse` on MAC mismatch. Tests assert type, not just message. Adversarial suite verifies every tampering class raises this.
- **`CredentialResolutionError`** — when no resolver can supply a given credential. Includes the role + id being looked up for; does not include key material.
- **`BootstrapAbortedError`** — bootstrap crashed mid-provision. The HALF_APPLIED marker on disk lets re-runs detect and recover.
- **`DriftDetected`** — not an error, a plan-step kind. `apply()` logs every update step before executing.
- Factory reset is explicitly destructive — requires `--confirm` flag and an interactive "yes" prompt unless `--yes` also passed.

### 5.4 Testing strategy

| Tier | Where | What |
|------|-------|------|
| T1 unit | `packages/yubihsm/tests/scp03/wrap.adversarial.test.ts` | 5 tampering classes × R-MAC verify. Written first (adversarial TDD). |
| T1 unit | `packages/yubihsm/tests/commands/get-object-info.test.ts` | happy path + missing-object case |
| T1 unit | `packages/yubihsm/tests/blueprint/reconcile.update.test.ts` | cap drift, domain drift, delegated-cap drift, apply-then-diff converges |
| T1 unit | `packages/yubihsm/tests/scp03/password-kdf.test.ts` | RFC-style vectors |
| T1 unit | `src/credential-resolver/*.test.ts` | each resolver + compose priority |
| T3 sim integration | `src/cli/hsm-bootstrap.test.ts` | fresh sim → bootstrap → apply → diff converges |
| T4 real device | `packages/yubihsm/tests/integration/real-device.test.ts` | skipped unless `HSM_REAL_DEVICE=1`; bootstrap, apply, open session with rotated admin, close |
| E2E | `tools/hsm-logan-e2e/run.ts` | full Logan turn with Ollama + Moltbook + Perplexity |
| Adversarial | `superpowers:code-reviewer` subagent per task; plus crypto red-team subagent for R-MAC task | post-commit review, with a hard requirement to fail on any missed attack class |

### 5.5 Open risks

1. **YubiHSM2 factory reset on ctrl+C during bootstrap.** If the operator aborts after factory-admin is replaced but before blueprint apply completes, the device is in a state where the factory password no longer works but the new admin isn't in Credential Manager either. Mitigation: write the new admin to Credential Manager *before* replacing the factory admin, and leave a HALF_APPLIED marker.
2. **Ollama gemma3:4b pull on first run.** ~3GB download. Mitigation: the harness checks for the model up-front and fails fast with a clear message if the network isn't available.
3. **yubihsm-connector on Windows.** Factory images typically ship the connector as a separate install; the harness detects a missing connector and instructs the operator.
4. **Moltbook rate limits.** The E2E post could get throttled. Mitigation: the harness includes a 60s cool-off between runs and uses a dedicated test-post flag to avoid polluting Logan's public feed.
5. **Gemma's summarization quality with 4B parameters.** The summary may be low-quality; the test only asserts post-created + contains-keywords, not quality.

## 6. Adversarial TDD for R-MAC — attack classes

These five tests get written *before* R-MAC implementation. Each must fail with `ResponseMacError` after the implementation lands:

1. **Single-bit flip in encrypted body** — flip byte N of the response body before passing to unwrap; verify rejection.
2. **Single-bit flip in 8-byte MAC tag** — flip byte of the MAC suffix; verify rejection.
3. **Session-ID substitution** — change the sessionId prefix byte; verify rejection (MAC covers it).
4. **Truncation** — drop the final MAC byte; verify rejection with length error rather than MAC (acceptable; the point is no data leaks).
5. **Counter replay** — supply a previous response's bytes with the wrong response-ICV; verify rejection (chain mismatch).

A sixth defensive test: after any rejection, the session's response-ICV *must not* advance. Otherwise an attacker could desync the chain by spamming bad frames.

## 7. Handoff

Design approved by user (Q1=option-2 branch, Q2=real hardware, Q3=plugged-in brand-new, Q4=proper bootstrap, Q5=multi-provider w/ local Gemma).

Next step: **writing-plans phase** produces `2026-04-20-plan-02-hsm-loose-ends.md` with task-by-task TDD tasks, each 2–5 minutes, each with failing test → implement → green → commit → adversarial review.
