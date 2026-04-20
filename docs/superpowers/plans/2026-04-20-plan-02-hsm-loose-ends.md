# Plan 02 — HSM Loose Ends + Real-Device Bootstrap + Logan E2E

> **For agentic workers:** Execute task-by-task via `superpowers:subagent-driven-development`. Each task follows TDD: write failing test → implement → green → commit. For Task 1 specifically, use **adversarial TDD** (attack tests *are* the spec).

**Goal:** Close Plan 01's scope-deferred items (R-MAC verification, Credential Manager wiring, reconcile drift detection), add a `hsm bootstrap` verb that provisions a factory-fresh YubiHSM2, and prove the end-to-end sealed-credential path on real hardware by running Logan (Moltbook Cardano-educator agent) against the bootstrapped device using local Gemma for LLM.

**Architecture:** Companion to Plan 01's packages. All driver changes land in `packages/yubihsm/`; simulator changes in `packages/yubihsm-sim/`. Credential resolution gets a new package-internal folder `packages/yubihsm/src/credential-resolver/` with a `CredentialResolver` interface + three implementations (hex-flag / JSON file / Windows Credential Manager). A new top-level `tools/hsm-logan-e2e/` directory holds the orchestration harness (not a library — operator-facing script).

**Tech Stack:** Same as Plan 01. New dep: `node-llama-cpp`? No — Ollama runs out-of-process, we just HTTP-client to it (`undici`, already a dep). No additional native deps.

**Gate:**
1. R-MAC adversarial suite green (5 attack classes rejected, chain doesn't advance on rejection).
2. `plan()` detects capability / domain / delegated-cap drift and emits `update` steps; `apply()` executes them.
3. `CredentialResolver` chain resolves (hex flag > JSON file > Credential Manager) with full test coverage on mocks.
4. `openclaw hsm bootstrap` on a fresh simulator is idempotent and converges to blueprint state.
5. On a real YubiHSM2 with `HSM_REAL_DEVICE=1`: bootstrap succeeds, Logan completes one full turn (Perplexity research → Gemma summarize → Moltbook post), post is visible on Moltbook.
6. `superpowers:code-reviewer` approves every task; a dedicated crypto-adversarial subagent approves Task 1.

---

## Context every task needs

**Repo root:** `C:/Users/charl/UserscharldancesWithClaws`
**Branch:** `feature/hsm-loose-ends` (off `master`, with Plan 01 vendor-ported at `6f2492fa49`).
**Design:** `docs/superpowers/plans/2026-04-20-plan-02-hsm-loose-ends-design.md`.
**Spec:** `docs/superpowers/specs/2026-04-19-yubihsm2-security-architecture-design.md`.
**Plan 01 (history):** `docs/superpowers/plans/2026-04-19-plan-01-yubihsm-driver-and-simulator.md`.

**Pre-commit on this machine:** `scripts/format-staged.js` now passes `shell: true` on win32 (fixed in the vendor-port commit). Pre-commit chain runs oxfmt → lint → tsgo → madge — budget ~7 min per commit.

**Existing tests to keep green:** 77 across `packages/yubihsm` (56) + `packages/yubihsm-sim` (21) + 3 CLI tests in `src/cli/hsm-cli.test.ts`.

---

## Task 1: R-MAC verification (adversarial TDD)

**Files:**
- Create: `packages/yubihsm/tests/scp03/wrap.adversarial.test.ts`
- Modify: `packages/yubihsm/src/scp03/wrap.ts`
- Modify: `packages/yubihsm/src/session.ts` (track response-ICV)
- Modify: `packages/yubihsm-sim/src/handlers.ts` (produce correct R-MAC, track per-session response-ICV)
- Modify: `packages/yubihsm-sim/src/sessions.ts` (add `responseIcv: Uint8Array` field to `SessionState`)

**Why adversarial TDD:** the happy path already works (Plan 01 green). The value of R-MAC verification is rejecting tampered responses. The attack suite *is* the feature contract.

- [ ] **Step 1: Write the failing adversarial test suite.**

`wrap.adversarial.test.ts` covers the five attack classes from the design doc §6:
1. Single-bit flip in encrypted body → `ResponseMacError`.
2. Single-bit flip in 8-byte MAC tag → `ResponseMacError`.
3. Session-ID substitution (change byte 0 of the wrapped frame) → `ResponseMacError`.
4. Truncation (drop the trailing MAC byte) → a typed length error (doesn't have to be `ResponseMacError`, just not silent success).
5. Counter / ICV replay — supply a legit wrapped frame but with the wrong prior-response-ICV → `ResponseMacError`.

Plus the defensive test: after any rejection, the session's response-ICV must not advance (a helper assertion on the shared `session.responseIcv` state).

Also: one happy-path test that an untampered wrapped response from the simulator unwraps cleanly.

- [ ] **Step 2: Run to verify the tests fail.**

Run: `pnpm --filter @dancesWithClaws/yubihsm test wrap.adversarial`
Expected: FAIL — `ResponseMacError` doesn't exist; `unwrapSessionResponse` ignores MAC.

- [ ] **Step 3: Implement.**

In `packages/yubihsm/src/scp03/wrap.ts`:
- Add `ResponseMacError extends Error` export.
- In `unwrapSessionResponse`: before decrypting, compute `expected = aesCmac(args.sRmac, concat(args.icv, args.wrapped[0..-8]))` and compare first 8 bytes against `args.wrapped[-8..]`. Mismatch → throw `ResponseMacError`. Short frame → throw typed length error.
- Return the new ICV (full CMAC output) alongside inner bytes so the caller can advance the chain.

In `packages/yubihsm/src/session.ts`:
- Add `responseIcv = new Uint8Array(16)` to session state.
- In `sendCommand`, pass `responseIcv` to `unwrapSessionResponse`, advance on success, leave unchanged on any thrown error.

In `packages/yubihsm-sim/src/sessions.ts`:
- Add `responseIcv: Uint8Array` to `SessionState` (init all-zero).

In `packages/yubihsm-sim/src/handlers.ts`:
- In `handleSessionMessage` response wrap, pass `session.responseIcv` as the wrap ICV; advance `session.responseIcv = wrapped.newIcv` after send. (The sim previously used an all-zero icv for the response.)
- Use `session.sRmac` (not `sMac`) for response MAC derivation.

- [ ] **Step 4: Run to verify all tests pass.**

Run: `pnpm --filter @dancesWithClaws/yubihsm test` and `pnpm --filter @dancesWithClaws/yubihsm-sim test`.
Expected: all 77 previous tests + new adversarial tests green.

- [ ] **Step 5: Dispatch crypto-adversarial subagent.**

Spawn a fresh `general-purpose` subagent with the prompt from §Adversarial QA below. It has one job: look at the R-MAC implementation + the new attack tests and try to find a sixth attack class the tests miss. If it finds one, write it as a new failing test and iterate. Only proceed when the subagent explicitly says "no further attack classes identified."

- [ ] **Step 6: Dispatch `superpowers:code-reviewer`.**

Standard code-quality review pass.

- [ ] **Step 7: Commit.**

```bash
git add packages/yubihsm/src/scp03/wrap.ts packages/yubihsm/src/session.ts \
        packages/yubihsm/tests/scp03/wrap.adversarial.test.ts \
        packages/yubihsm-sim/src/handlers.ts packages/yubihsm-sim/src/sessions.ts
git commit -m "Add R-MAC verification to SCP03 session unwrap (adversarial TDD)"
```

---

## Task 2: New driver primitives (password KDF + GET_OBJECT_INFO + FACTORY_RESET)

**Files:**
- Create: `packages/yubihsm/src/scp03/password-kdf.ts`
- Create: `packages/yubihsm/src/commands/get-object-info.ts`
- Create: `packages/yubihsm/src/commands/factory-reset.ts`
- Create: `packages/yubihsm/tests/scp03/password-kdf.test.ts`
- Create: `packages/yubihsm/tests/commands/get-object-info.test.ts`
- Create: `packages/yubihsm/tests/commands/factory-reset.test.ts`
- Modify: `packages/yubihsm-sim/src/handlers.ts` (add `GET_OBJECT_INFO = 0x4E` and `FACTORY_RESET = 0x08` inner handlers)
- Modify: `packages/yubihsm-sim/src/store.ts` (add `factoryReset()` method that wipes everything and restores the factory admin key)

**Reference:** GET_OBJECT_INFO (0x4E): payload `[id:2][type:1]`, response `[id:2][type:1][algorithm:1][label:40][domains:2][capabilities:8][delegated_capabilities:8][sequence:1][origin:1]`. FACTORY_RESET (0x08): payload empty; wipes the device to factory. Password KDF: PBKDF2-HMAC-SHA256(password, salt="Yubico", iterations=10000, keyLen=32), split 16|16 into enc|mac.

- [ ] **Step 1: Write failing tests.**

`password-kdf.test.ts`:
- Known-answer vector: input `"password"`, salt `"Yubico"`, 10_000 iterations → expected first-byte sequence matches the known YubiHSM2 factory keys (cross-checked against `yubihsm-shell info` output; hardcode the 32-byte expected output).
- Input validation: empty password → throws.

`get-object-info.test.ts`:
- Happy path on simulator: put an auth key with known caps, call `getObjectInfo(session, id, AuthenticationKey)`, assert returned object matches.
- Missing object → inner error code 11 (`OBJECT_NOT_FOUND`).

`factory-reset.test.ts`:
- On simulator: seed store with admin + one asymmetric key, call `factoryReset(session)`, verify session is closed, verify store has only the factory admin (id=1, factory password keys).
- Confirms the sim handler wipes state correctly.

- [ ] **Step 2: Run to verify failures.**

Expected: FAILs across all three test files.

- [ ] **Step 3: Implement.**

`password-kdf.ts`:
```ts
import { pbkdf2Sync } from "node:crypto";
export function derivePasswordKeys(password: string): { encKey: Uint8Array; macKey: Uint8Array } {
  if (password.length === 0) throw new Error("password must be non-empty");
  const out = pbkdf2Sync(password, "Yubico", 10_000, 32, "sha256");
  return { encKey: new Uint8Array(out.subarray(0, 16)), macKey: new Uint8Array(out.subarray(16, 32)) };
}
```

`get-object-info.ts`:
- Encode request, decode 65-byte response into `ObjectInfo` interface.

`factory-reset.ts`:
- Fire-and-forget CMD 0x08; close session on success.

Simulator:
- Add `store.factoryReset()` that clears both maps and re-seeds auth key id=1 with factory password-derived keys.
- Handlers add both inner CMDs.

- [ ] **Step 4: Run to verify passes.**

All three test files green. Full driver + sim suites still green.

- [ ] **Step 5: Dispatch code-reviewer.**

- [ ] **Step 6: Commit.**

```bash
git add packages/yubihsm/src/scp03/password-kdf.ts \
        packages/yubihsm/src/commands/get-object-info.ts \
        packages/yubihsm/src/commands/factory-reset.ts \
        packages/yubihsm/tests/scp03/password-kdf.test.ts \
        packages/yubihsm/tests/commands/get-object-info.test.ts \
        packages/yubihsm/tests/commands/factory-reset.test.ts \
        packages/yubihsm-sim/src/handlers.ts \
        packages/yubihsm-sim/src/store.ts \
        packages/yubihsm/src/index.ts
git commit -m "Add password KDF, GET_OBJECT_INFO, FACTORY_RESET primitives"
```

---

## Task 3: Reconcile drift detection (`plan.update`)

**Files:**
- Modify: `packages/yubihsm/src/blueprint/reconcile.ts` (plan + apply: detect and execute update steps)
- Create: `packages/yubihsm/tests/blueprint/reconcile.update.test.ts`

- [ ] **Step 1: Write failing tests.**

`reconcile.update.test.ts`:
- **Capability drift:** blueprint says admin has `[generate-asymmetric-key, put-authentication-key]`; device has `[generate-asymmetric-key]` (one cap missing). `plan()` returns one `update` step; `apply()` rewrites the auth key; `diff()` converges.
- **Domain drift:** blueprint domains=[1,2]; device domains=[1]. Same pattern.
- **Delegated-capability drift:** same pattern.
- **No-op:** device matches blueprint → empty plan.
- **Idempotent apply:** running apply twice in a row leaves zero delta.

- [ ] **Step 2: Run to verify failures.**

Expected: FAIL — `plan()` currently emits empty `update`.

- [ ] **Step 3: Implement.**

In `plan()`:
- After `listObjects({type: AuthenticationKey})`, for every id that's also in the desired set, issue a `getObjectInfo(session, id, AuthenticationKey)`.
- Compare caps / domains / delegated_caps to the blueprint's converted values.
- If any differ, push `{ kind: "update-auth-key", id, authKey: blueprintEntry }` to `update`.

In `apply()`:
- For each update step: `deleteObject(session, id, AuthenticationKey)` → `putAuthenticationKey(session, {...})`. Executes in order: creates → updates → deletes (updates between creates and deletes so freshly-created keys don't get rewritten by a stale update path).

- [ ] **Step 4: Run to verify passes.**

All four drift test cases green. Full suite still green.

- [ ] **Step 5: Code review.**

- [ ] **Step 6: Commit.**

```bash
git add packages/yubihsm/src/blueprint/reconcile.ts \
        packages/yubihsm/tests/blueprint/reconcile.update.test.ts
git commit -m "Detect auth-key drift in blueprint reconcile (plan.update)"
```

---

## Task 4: `CredentialResolver` pluggable chain

**Files:**
- Create: `packages/yubihsm/src/credential-resolver/types.ts`
- Create: `packages/yubihsm/src/credential-resolver/hex-flag.ts`
- Create: `packages/yubihsm/src/credential-resolver/json-file.ts`
- Create: `packages/yubihsm/src/credential-resolver/credential-manager.ts`
- Create: `packages/yubihsm/src/credential-resolver/compose.ts`
- Create: `packages/yubihsm/src/credential-resolver/index.ts`
- Create: `packages/yubihsm/tests/credential-resolver/*.test.ts` (one per resolver + compose)
- Modify: `src/cli/hsm-cli.ts` (wire the chain)
- Modify: `src/cli/hsm-cli.test.ts` (assert resolver priority)

- [ ] **Step 1: Write failing tests for each resolver.**

- `hex-flag.test.ts` — returns keys when flags set; returns null when absent.
- `json-file.test.ts` — reads `{ "TeeVault-YubiHSM-Admin": { "enc": "hex...", "mac": "hex..." } }`; returns null on missing file.
- `credential-manager.test.ts` — mocks `execFile` / PowerShell call, asserts the resolver calls the right target name and parses the returned hex.
- `compose.test.ts` — priority ordering: hex flag > json file > credential manager. First non-null wins. Throws `CredentialResolutionError` when every resolver returns null.

- [ ] **Step 2: Run to verify failures.**

- [ ] **Step 3: Implement.**

Interface:
```ts
export interface ResolvedCredential {
  readonly encKey: Uint8Array;
  readonly macKey: Uint8Array;
}
export interface CredentialResolver {
  resolve(role: string, id: number): Promise<ResolvedCredential | null>;
}
```

`credential-manager.ts` bridges to the existing `extensions/tee-vault/src/integrations/credential-manager.ts` API — lazy-imports it, calls `getHsmCredential(role)`, parses the 64-char hex string.

`compose.ts` returns a composite resolver that walks the array and returns the first non-null; throws `CredentialResolutionError` if all return null.

CLI change: `hsm-cli.ts` `readAdminCreds` replaced with `resolveAdminCreds(opts)` that builds a compose chain `[hexFlagResolver(opts), jsonFileResolver(opts.credsFile), credentialManagerResolver()]`. The hex flags stay as test / override path.

- [ ] **Step 4: Run to verify all tests pass.**

- [ ] **Step 5: Code review.**

- [ ] **Step 6: Commit.**

```bash
git add packages/yubihsm/src/credential-resolver \
        packages/yubihsm/tests/credential-resolver \
        packages/yubihsm/src/index.ts \
        src/cli/hsm-cli.ts src/cli/hsm-cli.test.ts
git commit -m "Add pluggable CredentialResolver chain for hsm CLI"
```

---

## Task 5: `openclaw hsm bootstrap` verb

**Files:**
- Modify: `src/cli/hsm-cli.ts` (add `bootstrap` verb)
- Create: `src/cli/hsm-bootstrap.test.ts`

**Flow (idempotent):**
1. Probe device: `getDeviceInfo(transport)` (no session). Assert firmware ≥ `device.min_firmware`.
2. Try to open session with factory-password-derived keys. If succeeds → still in factory state; proceed to rotate. If fails with AUTH_FAIL → assume already-bootstrapped, skip to step 5.
3. Generate `randomBytes(32)` → newEncKey | newMacKey. Write to Credential Manager as `TeeVault-YubiHSM-Admin` = `hex(newEncKey || newMacKey)` **before** rotating the device.
4. Call `putAuthenticationKey(session, { keyId: 1, label: "admin", caps: ..., delegated: ..., encKey: newEncKey, macKey: newMacKey })`. This overwrites the factory admin. Close session.
5. Open fresh session via CredentialResolver chain (Credential Manager will now have the new admin).
6. `plan() → apply()` with the blueprint.
7. Final `diff()` should converge.

- [ ] **Step 1: Write failing test on the simulator.**

`hsm-bootstrap.test.ts`:
- Fresh simulator with just the factory admin (id=1, password="password"-derived keys).
- Invoke `hsm bootstrap --blueprint <temp-path>` via commander, with a `--creds-file` pointing at a temp JSON file so the resolver can write/read synthetic "Credential Manager" state.
- Assert: admin is rotated, blueprint is applied, final diff is empty.
- Run bootstrap **twice** — second run is a no-op.

- [ ] **Step 2: Run to verify failure.** Expected: verb doesn't exist.

- [ ] **Step 3: Implement.**

Add `bootstrap` to `hsm-cli.ts`. Use `CredentialResolver` chain. The "write Credential Manager" step becomes `writeCredential(role, hex)` — a new method on the resolver interface (optional).

For the factory session attempt: `derivePasswordKeys("password")` from Task 2, build a transient resolver with those keys, open session, `putAuthenticationKey`.

- [ ] **Step 4: Run tests.** All green. Idempotent second run passes.

- [ ] **Step 5: Code review.**

- [ ] **Step 6: Commit.**

```bash
git add src/cli/hsm-cli.ts src/cli/hsm-bootstrap.test.ts
git commit -m "Add openclaw hsm bootstrap for factory-fresh device provisioning"
```

---

## Task 6: Logan E2E harness (hardware-optional)

**Files:**
- Create: `tools/hsm-logan-e2e/package.json` (package-internal workspace entry)
- Create: `tools/hsm-logan-e2e/run.ts` (orchestration)
- Create: `tools/hsm-logan-e2e/ollama.ts` (Ollama bring-up helper)
- Create: `tools/hsm-logan-e2e/logan-task.ts` (one-turn Logan invocation)
- Create: `tools/hsm-logan-e2e/tests/run.smoke.test.ts` (against simulator)
- Create: `tools/hsm-logan-e2e/README.md`
- Modify: `pnpm-workspace.yaml` (verify `tools/*` glob — add if missing)

- [ ] **Step 1: Write failing smoke test (simulator path).**

`run.smoke.test.ts`:
- Mocks Ollama + Perplexity + Moltbook (via undici interceptors).
- Invokes the orchestration main against a fresh simulator.
- Asserts: HSM bootstrap ran, two credentials were sealed, all three mocked endpoints were called, exit code 0.

- [ ] **Step 2: Run — fails because nothing exists.**

- [ ] **Step 3: Implement.**

`ollama.ts`:
- `async ensureOllamaRunning(): Promise<{ port: number; stop: () => Promise<void> }>`. Probe `http://127.0.0.1:11434/api/tags`; if up, return with a no-op stop. If down, spawn `ollama serve`, wait for port, return.
- `async ensureModelPulled(model: string): Promise<void>` — call `/api/show`; if 404, POST `/api/pull`.

`logan-task.ts`:
- Single-turn agent loop: receives `{ sealedSecrets, ollamaPort, moltbookApi, perplexityApi }`, returns `{ postId }`.
- Step 1: call Perplexity with the unsealed key: "What is today's biggest Cardano governance story?"
- Step 2: call `http://127.0.0.1:<ollamaPort>/api/generate` with gemma3:4b to summarize in Logan's voice (system prompt lifted from `workspace/skills/moltbook-cardano/SKILL.md`).
- Step 3: POST to Moltbook `/api/v1/posts` with `Authorization: Bearer <unsealed MOLTBOOK_API_KEY>`.

`run.ts`:
- Entry: parse args (`--device` for real-device flag, `--connector` for URL).
- Call `openclaw hsm bootstrap` (programmatic invocation — reuse CLI).
- Seal `MOLTBOOK_API_KEY` + `PERPLEXITY_API_KEY` (reads from env, wraps under `plugin-sealer`).
- Invoke `loganTask(...)`, print the resulting post id.
- Exit 0 on success.

- [ ] **Step 4: Run smoke test — green.**

- [ ] **Step 5: Manual real-device verification.**

Document the manual runbook steps in `README.md`. Run with real device — step-by-step log attached to the PR, not committed.

- [ ] **Step 6: Code review.**

- [ ] **Step 7: Commit.**

```bash
git add tools/hsm-logan-e2e pnpm-workspace.yaml
git commit -m "Add Logan end-to-end harness (HSM-sealed creds + local Gemma)"
```

---

## Task 7: Final gate (verification-before-completion)

**This is not an implementation task — it's the shipping gate.**

- [ ] `pnpm --filter @dancesWithClaws/yubihsm test` green.
- [ ] `pnpm --filter @dancesWithClaws/yubihsm-sim test` green.
- [ ] `pnpm exec vitest run src/cli/hsm-cli.test.ts src/cli/hsm-bootstrap.test.ts tools/hsm-logan-e2e` green.
- [ ] Manual real-device run: `node tools/hsm-logan-e2e/run.ts --device` green; a new Logan post is visible on Moltbook; no credential material appears in logs.
- [ ] `superpowers:code-reviewer` approves the full branch diff against `master`.
- [ ] `superpowers:requesting-code-review` pass (adversarial subagent) explicitly signs off on the R-MAC implementation.

When all of the above is green, proceed to Phase 5: Finishing a Branch.

---

## Adversarial QA

Two flavors:

### Crypto red-team (Task 1 only)

Dispatch a `general-purpose` subagent with this prompt:

> You are a cryptographic adversary. A junior engineer just shipped R-MAC verification for SCP03 session responses in `packages/yubihsm/src/scp03/wrap.ts`. Their attack test suite is in `packages/yubihsm/tests/scp03/wrap.adversarial.test.ts`. Read both. Your job: identify any attack class they missed, OR any test that looks like it tests an attack but actually passes against a flawed implementation (i.e. a "backdoor" test). Write a new failing test for each weakness you find. Do not modify the implementation. Report back with either: (a) "No further attack classes identified — the suite is complete.", or (b) concrete test code for each missed class, and a short analysis. Budget: 30 minutes of wall time.

### Code quality (every task)

After each task's green, dispatch `superpowers:code-reviewer` pointed at the just-staged diff. Their output is advisory; apply fixes that are clear bugs, file issues for style disagreements.

---

## Execution

This plan is suited to `superpowers:subagent-driven-development`. Dispatch one implementer + one reviewer per task; review between tasks. Plan 01's execution cadence (≈7 min per commit with the heavy pre-commit chain) applies.

When the Task 7 gate passes, hand off to `superpowers:finishing-a-development-branch`.
