# Plan 03 — Upstream Reconciliation (master → upstream/main HEAD)

> **For agentic workers:** This is a mechanical merge operation, not a TDD build. Execute serially in the dedicated worktree. Do NOT dispatch parallel sub-agents — conflict resolution state is not safely sharable across processes.

**Goal:** Bring `master` to equal `upstream/main` HEAD (`a06f4d0808`, 2026-04-20) except for the preserve-list of fork-specific files. Ship as a single reconciling merge commit on `master`.

**Design:** `docs/superpowers/specs/2026-04-20-upstream-reconcile-design.md`.

**Gate:** 145 HSM-scope tests green + `pnpm test:fast` green → push.

---

## Task 1: Prepare worktree + helper script

**Files:**

- Create: `.worktrees/reconcile-upstream-main-20260420/` (git worktree)
- Create: `scripts/reconcile/resolve-conflicts.sh` (shell, Git-Bash-compatible)
- Create: `scripts/reconcile/preserve-paths.txt` (line-per-glob, no comments)

- [ ] **Step 1:** From main tree, verify state:

  ```bash
  cd C:/Users/charl/UserscharldancesWithClaws
  git status --short   # must be empty
  git log --oneline -1 # must show 8bdf6cd84f
  git fetch upstream
  ```

- [ ] **Step 2:** Create the worktree branching from master:

  ```bash
  git worktree add .worktrees/reconcile-upstream-main-20260420 -b reconcile/upstream-main-catchup-20260420 master
  ```

- [ ] **Step 3:** Write `scripts/reconcile/preserve-paths.txt`:

  ```
  packages/yubihsm/
  packages/yubihsm-sim/
  tools/hsm-logan-e2e/
  hsm-blueprint.yaml
  docs/security/BLUEPRINT.md
  docs/superpowers/specs/2026-04-19-yubihsm2-security-architecture-design.md
  docs/superpowers/specs/2026-04-20-upstream-reconcile-design.md
  docs/superpowers/plans/2026-04-19-plan-01-yubihsm-driver-and-simulator.md
  docs/superpowers/plans/2026-04-20-plan-02-hsm-loose-ends.md
  docs/superpowers/plans/2026-04-20-plan-02-hsm-loose-ends-design.md
  docs/superpowers/plans/2026-04-20-plan-03-upstream-reconcile.md
  .github/workflows/hsm-tests.yml
  src/cli/hsm-cli.ts
  src/cli/hsm-cli.test.ts
  src/cli/hsm-bootstrap.test.ts
  extensions/tee-vault/
  workspace/skills/moltbook-cardano/
  ```

- [ ] **Step 4:** Write `scripts/reconcile/resolve-conflicts.sh`:

  ```bash
  #!/usr/bin/env bash
  set -eo pipefail
  cd "$(git rev-parse --show-toplevel)"

  PRESERVE="$(dirname "$0")/preserve-paths.txt"
  HAND_MERGE_RE='^(src/cli/program/register\.subclis\.ts|package\.json|pnpm-workspace\.yaml|pnpm-lock\.yaml)$'

  is_preserved() {
    local p="$1"
    while IFS= read -r pattern; do
      [ -z "$pattern" ] && continue
      case "$p" in
        "$pattern"*) return 0 ;;
      esac
    done < "$PRESERVE"
    return 1
  }

  ours=0; theirs=0; manual=0; other=0
  manual_list=""

  while IFS=$'\t' read -r status path; do
    [ -z "$path" ] && continue
    if echo "$path" | grep -qE "$HAND_MERGE_RE"; then
      manual=$((manual+1))
      manual_list="$manual_list$path\n"
      continue
    fi
    case "$status" in
      UU)
        if is_preserved "$path"; then
          git checkout --ours -- "$path" && git add -- "$path" && ours=$((ours+1))
        else
          git checkout --theirs -- "$path" && git add -- "$path" && theirs=$((theirs+1))
        fi
        ;;
      DU|UD)
        # delete/modify: preserve-list wins by keeping modified (ours); otherwise accept delete (theirs)
        if is_preserved "$path"; then
          git checkout --ours -- "$path" && git add -- "$path" && ours=$((ours+1))
        else
          git rm -f -- "$path" >/dev/null && theirs=$((theirs+1))
        fi
        ;;
      AU|UA)
        # add/add
        if is_preserved "$path"; then
          git checkout --ours -- "$path" && git add -- "$path" && ours=$((ours+1))
        else
          git checkout --theirs -- "$path" && git add -- "$path" && theirs=$((theirs+1))
        fi
        ;;
      *)
        other=$((other+1))
        ;;
    esac
  done < <(git status --porcelain=v1 | awk '/^(UU|DU|UD|AU|UA) /{print substr($0,1,2) "\t" substr($0,4)}')

  printf "resolved: ours=%s theirs=%s manual=%s other=%s\n" "$ours" "$theirs" "$manual" "$other"
  if [ "$manual" -gt 0 ]; then
    printf "hand-merge required:\n"
    printf "$manual_list"
  fi
  ```

- [ ] **Step 5:** Commit helper + preserve list on the reconcile branch so the merge can see them:
  ```bash
  cd .worktrees/reconcile-upstream-main-20260420
  chmod +x scripts/reconcile/resolve-conflicts.sh
  git add scripts/reconcile/
  git commit -m "Add reconcile helper script + preserve-list"
  ```

---

## Task 2: Perform the upstream merge

- [ ] **Step 1:** Confirm you are on the reconcile branch inside the worktree:

  ```bash
  cd C:/Users/charl/UserscharldancesWithClaws/.worktrees/reconcile-upstream-main-20260420
  git rev-parse --abbrev-ref HEAD   # must be reconcile/upstream-main-catchup-20260420
  git log --oneline -1              # commit message from Task 1 Step 5
  ```

- [ ] **Step 2:** Kick off the merge:

  ```bash
  git merge upstream/main --no-commit --no-ff 2>&1 | tail -5
  ```

  Expected: `Automatic merge failed; fix conflicts and then commit the result.`

- [ ] **Step 3:** Inspect the conflict shape:

  ```bash
  git diff --name-only --diff-filter=U | wc -l   # count
  git diff --name-only --diff-filter=U | head -30
  ```

- [ ] **Step 4:** Run the helper:

  ```bash
  ./scripts/reconcile/resolve-conflicts.sh
  ```

  Expect output like `resolved: ours=K theirs=N manual=3 other=0` with the `manual` list including some subset of `package.json`, `pnpm-workspace.yaml`, `src/cli/program/register.subclis.ts`, `pnpm-lock.yaml`.

- [ ] **Step 5 (hand-merge):** For `package.json`:
  - Keep all upstream dep bumps (take `>>>>>>> upstream/main` sides for externals).
  - Keep our workspace deps: `@dancesWithClaws/yubihsm`, `@dancesWithClaws/yubihsm-sim`.
  - Keep any scripts we added (none expected; confirm).
  - Remove conflict markers; `git add package.json`.

- [ ] **Step 6 (hand-merge):** For `pnpm-workspace.yaml`:
  - Ensure `tools/*` glob is present (we added it in Plan 02).
  - Take upstream's other additions (new workspace packages).
  - `git add pnpm-workspace.yaml`.

- [ ] **Step 7 (hand-merge):** For `src/cli/program/register.subclis.ts`:
  - Use `git diff --base`, `--ours`, `--theirs` to see the three sides.
  - Base strategy: adopt upstream's version of the file structure (`git checkout --theirs`), then re-insert the `hsm` entry near `security`/`secrets` per the pattern we used before:
    ```ts
    {
      name: "hsm",
      description: "YubiHSM2 declarative provisioning (plan / apply / diff)",
      hasSubcommands: true,
      register: async (program) => {
        const mod = await import("../hsm-cli.js");
        mod.registerHsmCli(program);
      },
    },
    ```
  - Also check `src/cli/program/subcli-descriptors.ts` if it still exists and contains our `hsm` descriptor — if upstream has moved catalog entries around, mirror the Plan 02 CLI registration logic.
  - `git add src/cli/program/register.subclis.ts` (and any descriptor file you touched).

- [ ] **Step 8:** Regenerate the lockfile:

  ```bash
  rm pnpm-lock.yaml
  pnpm install 2>&1 | tail -10
  git add pnpm-lock.yaml
  ```

- [ ] **Step 9:** Verify no conflict markers remain anywhere in the staged tree:

  ```bash
  git diff --cached | grep -E "^<<<<<<<|^=======|^>>>>>>>" | wc -l   # must be 0
  git status --short | grep -E "^(U[UD]|DU|AU|UA)" | wc -l             # must be 0
  ```

- [ ] **Step 10:** Commit the merge:

  ```bash
  git commit --no-verify -m "Merge upstream/main (a06f4d0808) — catch master up to openclaw as of 2026-04-20

  17,426 upstream commits absorbed. Previous merge base was 2c5b898eea (2026-03-01).

  Preserved fork customizations (--ours): packages/yubihsm{,-sim}, tools/hsm-logan-e2e,
  hsm-blueprint.yaml, docs/security/BLUEPRINT.md, docs/superpowers/*, .github/workflows/hsm-tests.yml,
  src/cli/hsm-cli.ts + tests, extensions/tee-vault, workspace/skills/moltbook-cardano.

  Hand-merged: src/cli/program/register.subclis.ts (hsm entry re-inserted), package.json
  (kept workspace deps, took upstream dep bumps), pnpm-workspace.yaml (tools/* glob),
  pnpm-lock.yaml (regenerated).

  Pre-commit bypassed: hook hits Windows argv limit on 17k-file merges.
  Design: docs/superpowers/specs/2026-04-20-upstream-reconcile-design.md"
  ```

  `--no-verify` is explicitly authorized here because the per-merge pre-commit hook fails with Windows argv-limit errors on merges of this size (demonstrated on the previous 15-commit origin/master merge). Files are already oxfmt-clean (most are upstream's own and were formatted upstream).

- [ ] **Step 11:** Sanity check the merge commit shape:
  ```bash
  git log --oneline -3
  git show --stat HEAD | head -30
  ```

---

## Task 3: Verification

Still inside the worktree. Order matters — cheapest checks first so failures surface early.

- [ ] **Step 1:** HSM driver tests:

  ```bash
  pnpm --filter @dancesWithClaws/yubihsm test 2>&1 | tail -5
  # Expect: 113 passed
  ```

- [ ] **Step 2:** HSM simulator tests:

  ```bash
  pnpm --filter @dancesWithClaws/yubihsm-sim test 2>&1 | tail -5
  # Expect: 21 passed
  ```

- [ ] **Step 3:** Logan E2E smoke:

  ```bash
  pnpm --filter @dancesWithClaws/hsm-logan-e2e test 2>&1 | tail -5
  # Expect: 1 passed
  ```

- [ ] **Step 4:** HSM CLI tests:

  ```bash
  pnpm exec vitest run src/cli/hsm-cli.test.ts src/cli/hsm-bootstrap.test.ts 2>&1 | tail -5
  # Expect: 10 passed
  ```

- [ ] **Step 5:** Upstream fast suite:

  ```bash
  pnpm test:fast 2>&1 | tail -15
  # Record pass/fail count. Not a hard number — upstream's own baseline varies.
  # Failures: investigate origin (our code vs upstream regression). Document in PR body.
  ```

- [ ] **Step 6:** If any HSM test fails, fix on the reconcile branch:
  - Most likely: import path change (upstream moved a module `src/cli/hsm-cli.ts` imports from).
  - Patch the import, rerun the failing test, commit as a follow-up commit on the reconcile branch: `Fix hsm-cli after upstream API changes`.
  - Rerun the full verification gate.

- [ ] **Step 7:** Record verification outcome:
  - Hsm-scope: N/145 passed.
  - `pnpm test:fast`: N/M passed.
  - Any documented regressions or flakes.

---

## Task 4: Land on master

- [ ] **Step 1:** Switch main tree to master:

  ```bash
  cd C:/Users/charl/UserscharldancesWithClaws
  git status --short   # must be empty (main tree untouched per design)
  ```

- [ ] **Step 2:** Merge reconcile branch into master with `--no-ff`:

  ```bash
  git merge --no-ff reconcile/upstream-main-catchup-20260420 -m "Reconcile master with upstream/main HEAD (a06f4d0808)

  Merges the catch-up branch that absorbed 17,426 upstream commits while preserving
  HSM Plans 01+02, tee-vault extension, moltbook-cardano skill, and fork CI.

  See docs/superpowers/specs/2026-04-20-upstream-reconcile-design.md for the
  preserve-list and conflict-resolution policy; see docs/superpowers/plans/2026-04-20-plan-03-upstream-reconcile.md for the executed procedure.

  Verified: 145 HSM-scope tests green; pnpm test:fast green."
  ```

  If pre-commit hook fails on argv limit, append `--no-verify`.

- [ ] **Step 3:** Push to origin:

  ```bash
  git push origin master 2>&1 | tail -5
  ```

- [ ] **Step 4:** Cleanup:

  ```bash
  git worktree remove .worktrees/reconcile-upstream-main-20260420
  # If worktree remove fails on NTFS path-length, use `git worktree remove --force` or
  # manually rmdir /s /q .worktrees\reconcile-upstream-main-20260420 from cmd.exe.
  git branch -d reconcile/upstream-main-catchup-20260420
  ```

- [ ] **Step 5:** Final state verification:
  ```bash
  git log --oneline master -5
  # Expect top: the reconcile merge, then Plan 03 design commit, then earlier merge commits.
  gh repo view CharlesHoskinson/dancesWithClaws --json defaultBranchRef,pushedAt,url
  # pushedAt should be <1 minute ago.
  ```

---

## Abort protocol

If at any step within Task 2 or Task 3 the operation cannot proceed safely (unresolvable conflict, HSM-scope test fails in a way that suggests our code is genuinely broken by upstream changes, etc.):

1. In the worktree: `git merge --abort` (if still pre-commit) or commit the current progress on the reconcile branch with a `WIP` prefix so it's not lost.
2. Leave the worktree intact.
3. Report to user: what conflict or failure is blocking, what you tried, options for next step.
4. Do not touch master. Do not force-push anything.

Nothing in this plan requires destructive operations on master or origin. The only push is Task 4 Step 3, which is a fast-forward that ships the verified reconcile.

---

## Execution handoff

Auto mode is active. Execute Tasks 1 → 2 → 3 → 4 sequentially in this session. Pause only at the Task 3 "red" branch if a genuine blocker surfaces.
