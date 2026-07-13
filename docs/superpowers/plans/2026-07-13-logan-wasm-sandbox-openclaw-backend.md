# Logan WASM Sandbox OpenClaw Backend (P2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the P1 `logan-wasm-sandbox` host into OpenClaw as a first-class sandbox backend (`backend: "wasm"`) so the Logan agent can complete a tool-using turn on Windows **without Docker/WSL**, with the same allowlist egress intent as Squid.

**Architecture:** OpenClaw already has a process-wide sandbox backend registry (`registerSandboxBackend` in `src/agents/sandbox/backend.ts`) and handle contract (`SandboxBackendHandle` in `backend-handle.types.ts`). P2 registers a **`wasm`** backend that:

1. Keeps **workspace FS** on the host under existing path guards / fs-bridge patterns (narrow preopens later; do not invent a full POSIX guest).
2. Routes **network-bound tool paths** (especially `curl`/HTTP-shaped `exec`) through the Rust host CLI or a thin Node→Rust bridge, reusing `security/proxy/allowed-domains.txt`.
3. Leaves **browser / arbitrary shell / package install** on Docker or native fallback (hybrid model per research).

**Tech Stack:** Existing OpenClaw TS sandbox registry; P1 Rust CLI at `tools/logan-wasm-sandbox`; config types in `src/config/types.agents-shared.ts` (`AgentSandboxConfig.backend`); optional small Node child-process wrapper; Wasmtime stays in Rust (no Node-native Wasmtime required for P2).

**Research basis:** `docs/superpowers/research/2026-07-13-docker-wsl-to-wasm-sandbox.md` (WASM-first hybrid; WIT brokers later; native fallback permanent for shell/browser/GPU).

**P1 baseline (shipped):** `tools/logan-wasm-sandbox` + `tools/logan-wasi-http` + `scripts/logan-wasm-smoke.ps1`; per-hop HTTPS allowlist + streaming body cap; guest wall-clock timeout; no OpenClaw backend yet.

---

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-13-logan-wasm-sandbox-ts7-design.md` (Approach A, **P2 only**).
- TypeScript 7: use monorepo `tsgo` / `@typescript/native-preview` for typecheck of P2 TS (skill: `.agents/skills/typescript-7`). Full monorepo TS7 default remains optional; do **not** break TS6 API for eslint.
- Do **not** rewrite gateway/core to Rust.
- Do **not** require Docker/WSL for Logan wasm path success tests.
- Reuse domain list: `security/proxy/allowed-domains.txt`.
- Default deny egress; timeouts + byte caps mandatory on every host-mediated request (already in P1 host).
- Prefer **thin adapter** over forking deep Docker code paths; register via `registerSandboxBackend("wasm", ...)`.
- Hybrid is intentional: `capabilities.browser: false` for wasm; browser stays docker/host-controlled.
- Windows host primary; Linux CI optional when Rust binary is present.
- Commits: small, conventional (`feat:`, `test:`, `docs:`, `fix:`).
- Guest shell is **not** a goal: map safeBins/curl to host-mediated HTTP; deny general shell.

## File structure (expected)

| Path                                                                 | Responsibility                                                                  |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `src/agents/sandbox/wasm-backend.ts`                                 | `createWasmSandboxBackend` + handle                                             |
| `src/agents/sandbox/wasm-backend.test.ts`                            | Unit tests (mock spawn / fixture binary)                                        |
| `src/agents/sandbox/backend.ts`                                      | Ensure wasm auto-registers with docker/ssh (or plugin load path)                |
| `src/config/types.sandbox.ts` / `types.agents-shared.ts`             | Optional `wasm?: { bin?, allowlist?, timeoutSecs?, maxBytes? }` settings        |
| `src/config/zod-schema*.ts` + schema help                            | Validate new config keys                                                        |
| `src/commands/doctor-sandbox.ts`                                     | Doctor: wasm bin present when backend=wasm; do not warn Docker-missing for wasm |
| `openclaw.json` (Logan local)                                        | `agents.list`/`defaults.sandbox.backend: "wasm"` for Logan                      |
| `tools/logan-wasm-sandbox/**`                                        | Only if bridge needs new CLI surface (e.g. JSON machine mode already exists)    |
| `scripts/logan-wasm-agent-smoke.ps1`                                 | End-to-end: gateway + wasm sandbox agent turn (optional if hard)                |
| `docs/gateway/sandboxing.md` or Logan README                         | Document `backend: "wasm"`                                                      |
| `docs/superpowers/specs/2026-07-13-logan-wasm-sandbox-ts7-design.md` | Note P1 done; P2 status                                                         |

---

### Task 1: Config surface for wasm backend settings (TDD)

**Files:**

- Modify: `src/config/types.agents-shared.ts` (or `types.sandbox.ts`)
- Modify: Zod schema + help strings for sandbox
- Test: existing config schema tests / new focused test

**Interfaces:**

- Consumes: `AgentSandboxConfig.backend?: string` (already exists; default remains `"docker"`)
- Produces:
  - Optional nested settings, e.g.:
    ```ts
    wasm?: {
      /** Path to logan-wasm-sandbox binary; default: resolve next to repo tools build or PATH */
      bin?: string;
      /** Allowlist file; default: security/proxy/allowed-domains.txt relative to state/repo */
      allowlist?: string;
      timeoutSecs?: number; // default 30
      maxBytes?: number;    // default 1048576
    };
    ```

- [ ] **Step 1: Write failing schema/type tests** for `agents.defaults.sandbox.wasm.*` parse round-trip

- [ ] **Step 2: Implement types + Zod**

- [ ] **Step 3: Commit**
  ```
  feat(sandbox): add wasm backend config types
  ```

---

### Task 2: Wasm backend handle (spawn host CLI; no Docker)

**Files:**

- Create: `src/agents/sandbox/wasm-backend.ts`
- Create: `src/agents/sandbox/wasm-backend.test.ts`

**Interfaces:**

- Consumes: `CreateSandboxBackendParams`, P1 CLI:
  - `logan-wasm-sandbox http --allowlist <path> --url <url> --timeout-secs N --max-bytes N`
  - Exit 0 / 1 / 2 + JSON stdout
- Produces: `SandboxBackendHandle` with:
  - `id: "wasm"`
  - `capabilities: { browser: false }`
  - `workdir` = host workspace path (session workspace)
  - `buildExecSpec` / `runShellCommand`: **policy-restricted**
    - Allow only curated shapes (e.g. curl-equivalent GET/HEAD to https URL) → spawn wasm host CLI
    - Deny general shell (`/bin/sh`, arbitrary argv) with clear error
  - `createFsBridge`: prefer **host-side** bridge / existing path safety (workspace-only); do not require guest FS for P2 minimum
  - `manager`: no-op or lightweight (no containers to prune)

**Design note (locked):**  
Do **not** reimplement Docker exec inside wasm. The wasm backend is a **capability-narrow** runtime: HTTP via host CLI + host FS guards. Full shell remains docker/ssh.

- [ ] **Step 1: Failing unit tests**
  - Factory returns handle with `id === "wasm"` and `browser: false`
  - `runShellCommand` / exec path for disallowed command fails closed
  - Allowed curl-shaped invocation spawns binary with expected args (mock `child_process`)

- [ ] **Step 2: Implement factory + handle**

- [ ] **Step 3: Register backend**
  - Auto-register alongside docker/ssh in the same load path that registers bundled backends
  - Id: `"wasm"`

- [ ] **Step 4: Commit**
  ```
  feat(sandbox): register wasm backend using logan-wasm-sandbox host
  ```

---

### Task 3: Doctor + explain UX

**Files:**

- Modify: `src/commands/doctor-sandbox.ts` (+ tests)
- Modify: sandbox explain if needed

- [ ] **Step 1: When `backend=wasm`**, doctor checks:
  - Binary resolvable
  - Allowlist file readable
  - Does **not** require Docker daemon
- [ ] **Step 2: When `backend=docker`**, keep existing Docker warnings
- [ ] **Step 3: Commit**
  ```
  feat(doctor): validate wasm sandbox backend without Docker
  ```

---

### Task 4: Logan config default for local agent

**Files:**

- Modify: local `openclaw.json` (or documented sample) for Logan agent only
- Prefer **per-agent** override: `agents.list[id=logan].sandbox.backend = "wasm"` so upstream default stays docker

Example:

```json
{
  "agents": {
    "list": [
      {
        "id": "logan",
        "sandbox": {
          "mode": "all",
          "backend": "wasm",
          "wasm": {
            "allowlist": "security/proxy/allowed-domains.txt"
          }
        }
      }
    ]
  }
}
```

- [ ] **Step 1: Set Logan override (do not force monorepo-wide default)**
- [ ] **Step 2: Document in README WASM section**
- [ ] **Step 3: Commit**
  ```
  chore(logan): default Logan agent sandbox backend to wasm
  ```

---

### Task 5: Tool policy mapping (curl / safeBins)

**Files:**

- Modify: tool policy or exec path that honors sandbox backend (inspect current `sandbox-tool-policy` + bash tools)
- Tests: sandboxed session with wasm denies browser spawn; allows mediated HTTP path

**Locked behavior:**

- `safeBins: ["curl"]` (or Logan equivalent) → wasm host `http` / `guest-http`, **not** real curl in a container
- `browser`, `create_job`, unrestricted `exec` remain denied or routed off-wasm

- [ ] **Step 1: Map curl-like tool invocations to host CLI**
- [ ] **Step 2: Tests for deny/allow**
- [ ] **Step 3: Commit**
  ```
  feat(sandbox): map curl-shaped exec to wasm host HTTPS
  ```

---

### Task 6: Integration smoke (Windows)

**Files:**

- Create: `scripts/logan-wasm-agent-smoke.ps1` (or extend existing Logan smoke)
- Docs: README pointer

**Steps:**

1. Build release host binary if missing
2. Ensure gateway config has Logan `backend: wasm`
3. Run a minimal agent turn that triggers allowlisted HTTPS (or direct CLI if agent turn too heavy)
4. Assert deny for evil.com-class still holds
5. Assert no Docker requirement

- [ ] **Step 1: Script + run until green**
- [ ] **Step 2: Commit**
  ```
  docs: add Logan wasm agent sandbox smoke
  ```

---

### Task 8: TypeScript 7 typecheck gate for wasm backend (tsgo)

**Skill:** `.agents/skills/typescript-7/SKILL.md`

**Files:** docs only if needed; ensure P2 TS is covered by existing `tsgo:core`

- [ ] **Step 1:** Confirm `@typescript/native-preview` installed; `pnpm tsgo:core` (or project that includes `src/agents/sandbox`) green after Tasks 1–5
- [ ] **Step 2:** Document in README WASM section: typecheck via `pnpm tsgo:core` / TS7 native
- [ ] **Step 3:** Commit only if docs/scripts change
  ```
  docs: document TypeScript 7 tsgo gate for wasm sandbox
  ```

### Task 7: P2 acceptance checklist (no new features)

**Files:** none (verification)

- [ ] **Unit/integration:** wasm backend tests pass
- [ ] **CLI:** `scripts/logan-wasm-smoke.ps1` still `WASM_SMOKE_OK`
- [ ] **Agent path:** Logan turn with sandbox wasm succeeds on Windows without Docker (or documented partial if gateway live deps block; must not regress P1)
- [ ] **Non-goals still hold:** no TS7 work; no Rust gateway rewrite; docker backend still registered
- [ ] **Spec coverage table** updated in this plan (checkboxes)

| Spec P2 requirement              | Task                      |
| -------------------------------- | ------------------------- |
| OpenClaw backend wired           | 2–3                       |
| Logan agent uses wasm sandbox    | 4–6                       |
| Agent turn without Docker/WSL    | 6–7                       |
| Allowlist egress                 | 2, 5, P1 host             |
| Workspace roots not widened      | 2 (host FS bridge)        |
| Docker remains optional fallback | 2 registration + defaults |

---

## Deferred to later phases (explicit non-goals for P2)

| Item                                                     | Phase                     |
| -------------------------------------------------------- | ------------------------- |
| Full WIT Component Model HTTP import                     | P2.1 / research phase-two |
| Shared Engine pool, worktree scheduler, evidence bundles | Post-P2                   |
| Native microVM fallback lane                             | Post-P2                   |
| TypeScript 7 CI                                          | **P3**                    |
| Monorepo default `backend: wasm` for all agents          | **P4**                    |
| GPU / browser inside wasm                                | Never (native/docker)     |

## Security follow-ups already done in P1 (do not regress)

- Per-hop redirect allowlist + https re-check
- Streaming body cap + Content-Length pre-check
- Guest wall-clock timeout; guest no TCP/UDP/DNS

## Risks

| Risk                                             | Mitigation                                                                              |
| ------------------------------------------------ | --------------------------------------------------------------------------------------- |
| `SandboxBackendHandle` assumes shell/docker exec | Narrow wasm handle; fail closed on arbitrary shell                                      |
| Binary path on Windows                           | Resolve `tools/logan-wasm-sandbox/target/release/logan-wasm-sandbox.exe` + env override |
| Doctor false-positives for Docker                | Backend-aware doctor checks                                                             |
| Scope creep to WIT                               | Keep CLI bridge until OpenClaw path is proven                                           |

---

## Execution handoff

Plan saved to `docs/superpowers/plans/2026-07-13-logan-wasm-sandbox-openclaw-backend.md`.

**Two execution options:**

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks
2. **Inline Execution** — this session with executing-plans checkpoints

**Which approach?**
