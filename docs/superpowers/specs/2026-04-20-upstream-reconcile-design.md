# Upstream Reconciliation — dancesWithClaws → openclaw/main HEAD

**Status:** Design — auto-mode execution approved; plan handoff imminent.
**Date:** 2026-04-20
**Base:** `master` at `5475e084a7` (HSM Plans 01+02 merged).
**Target:** `upstream/main` at `a06f4d0808` (HEAD as of today).

---

## 1. Why

Master forked from upstream on 2026-03-01. In the seven weeks since, upstream has shipped **17,426 commits**. The fork's HSM work landed cleanly on the old base but is now sitting on a tree that's months out of date with respect to the plugin SDK, CLI dispatcher, provider catalogue, test harness, CI scaffolding, and security patches. "Compliance with openclaw as of today" means master needs to equal `upstream/main` HEAD except for a narrow preserve-list of fork-specific code.

## 2. Decisions (user-confirmed)

| #   | Question                           | Decision                                                                          |
| --- | ---------------------------------- | --------------------------------------------------------------------------------- |
| Q1  | Scope & session budget             | All the way to `upstream/main` HEAD in one pass. Single reconciling merge commit. |
| Q2  | `origin/custom` as stepping stone? | Ignore. Direct merge `upstream/main → master`.                                    |
| Q3  | Default conflict resolution        | `--theirs` on non-protected paths; `--ours` on preserve-list.                     |
| Q4  | Verification gate                  | HSM-scope 145 tests + upstream's `pnpm test:fast`.                                |
| Q5  | Isolation posture                  | Worktree-isolated reconcile branch.                                               |

## 3. Preserve-list (always `--ours`)

Absolute paths under the repo root. Conflict resolution defaults to `--ours` when both sides touched any file in this list:

```
packages/yubihsm/**
packages/yubihsm-sim/**
tools/hsm-logan-e2e/**
hsm-blueprint.yaml
docs/security/BLUEPRINT.md
docs/superpowers/specs/2026-04-19-yubihsm2-security-architecture-design.md
docs/superpowers/specs/2026-04-20-upstream-reconcile-design.md     # this file
docs/superpowers/plans/2026-04-19-plan-01-yubihsm-driver-and-simulator.md
docs/superpowers/plans/2026-04-20-plan-02-hsm-loose-ends.md
docs/superpowers/plans/2026-04-20-plan-02-hsm-loose-ends-design.md
docs/superpowers/plans/2026-04-20-plan-03-upstream-reconcile.md    # created in plan doc
.github/workflows/hsm-tests.yml
src/cli/hsm-cli.ts
src/cli/hsm-cli.test.ts
src/cli/hsm-bootstrap.test.ts
extensions/tee-vault/**      # our fork owns this extension
workspace/skills/moltbook-cardano/**
```

Shared files requiring the `hsm` entry to be re-inserted if upstream's version won:

```
src/cli/program/register.subclis.ts
package.json                 # workspace deps for @dancesWithClaws/yubihsm + yubihsm-sim
pnpm-workspace.yaml          # tools/* glob
pnpm-lock.yaml               # regenerated via pnpm install after package.json resolved
```

## 4. Non-goals

- **No partial/staged releases.** User chose Q1 = one pass. If the merge can't complete in one sitting, abort and reassess; don't land half.
- **No cherry-picking from `origin/custom`.** Per Q2.
- **No full local `pnpm test` or `pnpm tsgo:all`.** Per Q4 — those are flaky on this Windows machine and their signal-to-noise makes them counter-productive for verification of a mechanical merge. CI owns those.
- **No destructive history rewrite.** No rebase, no force push. Single reconciling merge commit plus a fork-customization follow-up commit if the post-merge state needs `hsm` re-registration or similar touch-ups.
- **No Logan real-device run during this operation.** Separate concern; must still work after the merge, but operator-driven.

## 5. Architecture

### 5.1 Workspace

```
main tree  (C:/Users/charl/UserscharldancesWithClaws)
  └─ branch: master @ 5475e084a7  (unchanged throughout operation)

worktree   (C:/Users/charl/UserscharldancesWithClaws/.worktrees/reconcile-upstream-main-20260420)
  └─ branch: reconcile/upstream-main-catchup-20260420  (ephemeral)
     └─ starts from master, receives upstream/main merge, lives until tests green, then fast-forwards into master
```

Rollback: `git worktree remove .worktrees/reconcile-upstream-main-20260420 && git branch -D reconcile/upstream-main-catchup-20260420`. Main tree untouched.

### 5.2 Flow

```
1. git worktree add .worktrees/reconcile-upstream-main-20260420 -b reconcile/upstream-main-catchup-20260420 master
2. cd .worktrees/reconcile-upstream-main-20260420
3. git merge upstream/main --no-commit --no-ff
   → expect large conflict set
4. Resolution loop (scripted helper + manual inspection for hotspots):
   a. For each conflicted preserve-list path:  git checkout --ours <path> && git add <path>
   b. For each conflicted non-preserve path:   git checkout --theirs <path> && git add <path>
   c. Hand-merge shared files (register.subclis.ts, package.json, pnpm-workspace.yaml)
   d. Regenerate pnpm-lock.yaml via `pnpm install`
   e. Hand-stitch register.subclis.ts to re-insert the `hsm` CLI entry if upstream moved/removed it
5. git commit -m "Merge upstream/main (a06f4d0808) — catch up to openclaw as of 2026-04-20"
6. Verification:
   - pnpm --filter @dancesWithClaws/yubihsm test        (expect 113 pass)
   - pnpm --filter @dancesWithClaws/yubihsm-sim test    (expect 21 pass)
   - pnpm --filter @dancesWithClaws/hsm-logan-e2e test  (expect 1 pass)
   - pnpm exec vitest run src/cli/hsm-cli.test.ts src/cli/hsm-bootstrap.test.ts  (expect 10 pass)
   - pnpm test:fast                                     (upstream's fast-suite; expect its usual pass rate)
7. If green → switch main tree to master, git merge --no-ff reconcile/..., push origin master.
   If red  → fix on the reconcile branch (do NOT touch master), re-run step 6.
8. Worktree + branch cleanup after successful push.
```

### 5.3 Conflict-resolution scripting

Hand-resolving thousands of conflicts one file at a time is infeasible. A small helper script `scripts/reconcile/resolve-conflicts.sh` runs inside the worktree and:

- Reads the conflict list via `git diff --name-only --diff-filter=U`.
- Matches each path against the preserve-list regex; if it matches, `git checkout --ours` + `git add`.
- Otherwise `git checkout --theirs` + `git add`.
- Emits a trailing summary: N paths kept as ours, M paths taken from upstream, K paths still conflicted (the hand-merge set — shared files that need manual attention).
- **Never commits.** Human (this agent) reviews the K remaining, commits manually.

Shared files are hand-merged: `src/cli/program/register.subclis.ts`, `package.json`, `pnpm-workspace.yaml`. The `pnpm-lock.yaml` is regenerated, not merged.

### 5.4 Error handling

- **Unresolvable conflict** (e.g., upstream removed a file the preserve-list requires — shouldn't happen since HSM lives in paths upstream doesn't touch, but: flag-fail, abort merge, report to user). This is the one place where the plan can need to stop and ask.
- **Build or type-check regression after merge**: if upstream renamed an API that `src/cli/hsm-cli.ts` imports, the reconcile must patch the import on the reconcile branch before landing on master. Treated as expected work, not an escalation.
- **Test failure in HSM scope**: hard-fail. Anything that breaks the 145 HSM tests must be fixed on the reconcile branch before the merge lands.
- **Test failure in `pnpm test:fast`**: expected baseline from upstream side should still hold. If it doesn't, investigate — is the fix in our wrapper code, or did upstream ship a genuine regression? If upstream-side regression, file in the PR description but don't block (we're adopting upstream's state faithfully).
- **Abort path**: `git merge --abort` works even after partial resolution. Worktree reset to pre-merge state. Operation recoverable.

### 5.5 Commit story

Single reconciling merge commit on master with body:

```
Merge upstream/main (a06f4d0808) — catch master up to openclaw as of 2026-04-20

17,426 upstream commits absorbed. Previous merge base was 2c5b898eea (2026-03-01).

Preserved fork customizations (--ours):
  packages/yubihsm/**, packages/yubihsm-sim/**, tools/hsm-logan-e2e/**,
  hsm-blueprint.yaml, docs/security/BLUEPRINT.md, docs/superpowers/**,
  .github/workflows/hsm-tests.yml, src/cli/hsm-cli.ts + tests,
  extensions/tee-vault/**, workspace/skills/moltbook-cardano/**.

Hand-merged:
  src/cli/program/register.subclis.ts — re-inserted hsm CLI entry alongside any upstream catalog changes.
  package.json — kept workspace deps for @dancesWithClaws/yubihsm{,-sim}; took upstream's external dep bumps.
  pnpm-workspace.yaml — preserved tools/* glob.
  pnpm-lock.yaml — regenerated via pnpm install.

Verification: 145 HSM-scope tests green; pnpm test:fast green.
Documented in docs/superpowers/specs/2026-04-20-upstream-reconcile-design.md
and docs/superpowers/plans/2026-04-20-plan-03-upstream-reconcile.md.
```

## 6. Expected conflict hotspots

Empirical prediction based on what upstream typically touches over 7 weeks of activity:

1. **`src/cli/program/register.subclis.ts`** — we already know upstream reshuffled the CLI catalog once (added `secrets`). Likely again. Hand-merge: insert `hsm` entry alphabetically.
2. **`package.json`** — dep version bumps across dozens of packages. Take upstream's for externals; keep ours for `@dancesWithClaws/yubihsm{,-sim}` workspace deps.
3. **`pnpm-lock.yaml`** — not merged; `pnpm install` regenerates after package.json resolves.
4. **`src/plugin-sdk/**`** — if upstream changed the plugin contract, our `extensions/tee-vault/\*\*` may need a small shim to re-satisfy. Flag in PR description if API shape changed; the tee-vault extension is small and its tests will catch breakage.
5. **`src/channels/**`** — provider-channel drift. Non-protected, default `--theirs`.
6. **`src/plugins/**`** — same, `--theirs`.
7. **`.github/workflows/**`** — fork-specific CI edits. Our `hsm-tests.yml`is preserved. The`ci.yml`/ release workflows probably have divergence from the blacksmith-runner removal commits on master;`--theirs` then audit. If CI breaks post-push, fix forward on master.
8. **`docs/**`** — large surface, almost always `--theirs`; documentation updates don't conflict semantically.
9. **`openspec/**`\*\* — the openspec schema location. If the fork has openspec customizations they'd need preserving; audit at start of operation.
10. **`.oxlintrc.json`**, **`tsconfig*.json`** — shared config files. `--theirs` (adopt upstream's lint/type rules). HSM packages have their own package-level tsconfigs, untouched.

## 7. Testing strategy

Gate-definition checkpoint is in §5.2 step 6. Key notes:

- **`pnpm install` will be slow** (first run on 17k-commit-fresher deps ≈ 1–2 minutes of resolver work + downloads).
- **First test run may be slow or noisy** — fresh node_modules, possible Windows-specific native-build tail. Filter to just the HSM packages first for a quick signal, then broaden.
- **`pnpm test:fast` on Windows may have its own native-build side effects**. If a test is flaky-on-Windows-only, document and proceed rather than block — the CI Linux runner is authoritative.
- **TS `noEmit` / tsgo is not in the gate.** There are pre-existing TS errors in `src/session.ts` and `src/cli/hsm-cli.ts` from Plan 02 that tests survive; a fresh upstream merge won't change that.

## 8. Rollback safety

Every path below the worktree layer is reversible:

- **Before merge starts** — nothing to roll back.
- **Mid-merge, pre-commit** — `git merge --abort` in the worktree.
- **Merged to reconcile branch, not yet merged into master** — delete worktree + branch.
- **Merged into master, not yet pushed** — `git reset --hard 5475e084a7` on master. (Only safe because origin/master hasn't been updated yet.)
- **Pushed** — forward-fix commit only. No force push to master.

## 9. Handoff

Plan doc at `docs/superpowers/plans/2026-04-20-plan-03-upstream-reconcile.md` will list the executable steps — helper script, merge invocation, verification commands, push sequence. Execution runs immediately in auto mode after plan is written.
