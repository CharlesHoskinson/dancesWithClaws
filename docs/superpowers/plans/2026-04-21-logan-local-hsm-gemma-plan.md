# Logan Local Stack — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Run Logan end-to-end on the local host: Gemma 4 (e2b primary, e4b fallback) over Ollama, `mxbai-embed-large` for RAG embeddings, YubiHSM-sealed secrets injected at agent spawn via an in-process hook, sandbox reaches Ollama through a filtered Unix socket.

**Architecture:** Ollama runs inside WSL2 on `/tmp/ollama.sock`. A small socket-filter shim exposes only inference endpoints to the Logan sandbox, which bind-mounts the filter socket read-only. Secrets live in the existing TEE-Vault (`extensions/tee-vault/`). A new `agent_env_prepare` hook in `src/agents/acp-spawn.ts` retrieves `MOLTBOOK_API_KEY` from the vault at spawn time and injects it into the sandbox env. A thin wrapper script (`scripts/launch-logan-with-vault.*`) is the Task Scheduler entry point: it resolves the HSM PIN from Windows Credential Manager, waits for Ollama readiness, unlocks the vault, starts Logan, and re-locks on exit.

**Tech Stack:** TypeScript (OpenClaw), Node 22, pnpm, Ollama (SYCL on Intel Arc 140V), YubiHSM 2 via graphene-pk11/PKCS#11, Docker Desktop + WSL2, Squid sidecar, PowerShell for Windows orchestration.

**Design source:** [../specs/2026-04-21-logan-local-hsm-gemma-design.md](../specs/2026-04-21-logan-local-hsm-gemma-design.md)
**Council review:** [../reviews/2026-04-21-council-review.md](../reviews/2026-04-21-council-review.md)
**Diagram:** [../diagrams/logan-local-stack.mmd](../diagrams/logan-local-stack.mmd)

## File Structure

**New files**

- `scripts/launch-logan-with-vault.ps1` — Windows wrapper
- `scripts/launch-logan-with-vault.sh` — Linux/WSL wrapper
- `scripts/ollama-socket-filter.ts` — Unix-socket reverse-proxy shim (filters Ollama endpoints)
- `scripts/ollama-systemd/ollama.service` — WSL2 systemd unit file
- `extensions/tee-vault/src/cli/tee-unlock-noninteractive.ts` — adds `--pin-from credmgr` flag
- `src/agents/hooks/agent-env-prepare.ts` — new plugin-hook implementation
- `src/agents/hooks/agent-env-prepare.test.ts`
- `src/config/secrets-schema.ts` — Zod schema for the new `secrets` config block
- `src/config/secrets-schema.test.ts`
- `tools/preflight/gemma-bench.ts` — GPU smoke-test harness

**Modified files**

- `openclaw.json` — schema additions (`secrets` block, `cascadePolicy`, digest-pinned models, `extraVolumes`)
- `src/config/config.ts` — thread `secrets` through
- `src/agents/acp-spawn.ts` — call `agent_env_prepare` hook before sandbox creation
- `src/agents/sandbox/docker.ts` — accept and pass `extraVolumes`
- `src/agents/model-fallback.ts` — respect `cascadePolicy: "local-only"`
- `extensions/tee-vault/src/cli/tee-cli.ts` — wire `--pin-from` flag
- `extensions/tee-vault/src/integrations/credential-manager.ts` — non-interactive resolve
- `README.md` — new Step 10.5 and 10.6 for HSM bootstrap + wrapper install

---

## Phase 0 — Pre-flight (abort gate)

### Task 0.1: Capture baseline versions

**Files:** none (captures to `docs/superpowers/plans/artifacts/preflight-<date>.md`)

- [ ] **Step 1:** Run each command, paste output into a new `preflight-<date>.md`:
  ```bash
  ollama --version
  wsl -l -v
  docker --version
  powershell.exe -Command "Get-Service yubihsm-connector" || echo "not installed"
  powershell.exe -Command "(Get-CimInstance Win32_ComputerSystem).TotalPhysicalMemory"
  powershell.exe -Command "(Get-CimInstance Win32_VideoController).Name"
  df -h /mnt/c | tail -1
  ```
- [ ] **Step 2:** Confirm: ≥50 GB free on C:, Intel Arc 140V detected, yubihsm-connector status known.
- [ ] **Step 3:** `git add docs/superpowers/plans/artifacts/ && git commit -m "chore(docs): capture preflight versions"`

### Task 0.2: GPU smoke-test harness

**Files:**

- Create: `tools/preflight/gemma-bench.ts`

- [ ] **Step 1:** Write the bench tool:

  ```ts
  // tools/preflight/gemma-bench.ts
  import { performance } from "node:perf_hooks";

  const SOCK = process.env.OLLAMA_SOCKET ?? "/tmp/ollama.sock";
  const MODEL = process.argv[2] ?? "gemma4:e2b";
  const TARGET_TOKENS = 500;
  const ITERATIONS = 10;

  async function callOllama(prompt: string): Promise<{ tokens: number; ms: number }> {
    const start = performance.now();
    const res = await fetch(`http://localhost/api/generate`, {
      method: "POST",
      body: JSON.stringify({
        model: MODEL,
        prompt,
        stream: false,
        options: { num_predict: TARGET_TOKENS },
      }),
      // @ts-expect-error — Node undici supports unix socket via dispatcher
      dispatcher: new (await import("undici")).Agent({ connect: { socketPath: SOCK } }),
    });
    const j = (await res.json()) as { response: string; eval_count: number };
    return { tokens: j.eval_count, ms: performance.now() - start };
  }

  (async () => {
    const results = [];
    for (let i = 0; i < ITERATIONS; i++) {
      const r = await callOllama(`List three facts about Cardano. Iteration ${i}.`);
      results.push(r);
      console.log(
        `${i}: ${r.tokens} tokens in ${r.ms.toFixed(0)}ms = ${(r.tokens / (r.ms / 1000)).toFixed(2)} t/s`,
      );
    }
    const avgTps = results.reduce((s, r) => s + r.tokens / (r.ms / 1000), 0) / results.length;
    console.log(`avg: ${avgTps.toFixed(2)} t/s`);
    if (avgTps < 5) {
      console.error("ABORT: average below 5 t/s; design assumptions broken");
      process.exit(1);
    }
  })();
  ```

- [ ] **Step 2:** Commit:
  ```bash
  git add tools/preflight/gemma-bench.ts
  git commit -m "feat(preflight): add Gemma GPU smoke-test harness"
  ```

### Task 0.3: Run the smoke test (abort gate)

- [ ] **Step 1:** From WSL2: `npx tsx tools/preflight/gemma-bench.ts gemma4:e2b`. This presumes Phase 1 (Ollama in WSL2) is already done — if it's not, skip ahead to Phase 1 and return here.
- [ ] **Step 2:** Record avg t/s in `preflight-<date>.md`. Gate: **if avg < 5 t/s, STOP**. Revisit the design.

---

## Phase 1 — Ollama in WSL2 + socket filter

### Task 1.1: Uninstall host Ollama

- [ ] **Step 1 (Windows PowerShell):** `scoop uninstall ollama` → verify: `where ollama.exe` returns nothing.
- [ ] **Step 2:** Also stop any running process: `Get-Process ollama -ErrorAction SilentlyContinue | Stop-Process -Force`.

### Task 1.2: Install Ollama in WSL2 with Unix socket listener

**Files:**

- Create: `scripts/ollama-systemd/ollama.service`

- [ ] **Step 1 (WSL2):** `curl -fsSL https://ollama.com/install.sh | sh`
- [ ] **Step 2:** Create `scripts/ollama-systemd/ollama.service`:

  ```ini
  [Unit]
  Description=Ollama
  After=network-online.target

  [Service]
  Environment="OLLAMA_HOST=unix:///tmp/ollama.sock"
  Environment="OLLAMA_ORIGINS=*"
  ExecStart=/usr/local/bin/ollama serve
  Restart=always
  RestartSec=3
  User=%i

  [Install]
  WantedBy=default.target
  ```

- [ ] **Step 3 (WSL2):** `sudo cp scripts/ollama-systemd/ollama.service /etc/systemd/system/ollama.service && sudo systemctl daemon-reload && sudo systemctl enable --now ollama.service`
- [ ] **Step 4:** Verify: `ls -l /tmp/ollama.sock` exists; `curl --unix-socket /tmp/ollama.sock http://localhost/api/tags` returns JSON.
- [ ] **Step 5:** Pull models: `ollama pull gemma4:e2b && ollama pull gemma4:e4b && ollama pull mxbai-embed-large`.
- [ ] **Step 6:** Capture digests: `ollama show gemma4:e2b --json | jq '.digest'` for each. Record in `preflight-<date>.md`.
- [ ] **Step 7:** Commit:
  ```bash
  git add scripts/ollama-systemd/ollama.service
  git commit -m "feat(ollama): add systemd unit with Unix socket listener"
  ```

### Task 1.3: Write ollama-socket-filter shim (TDD)

**Files:**

- Create: `scripts/ollama-socket-filter.ts`
- Create: `scripts/ollama-socket-filter.test.ts`

Responsibility: listen on a UDS at `/tmp/ollama-filter.sock`, forward requests to `/tmp/ollama.sock` only if path matches an allowlist; reject 403 otherwise. ~80 lines.

- [ ] **Step 1: Failing test**

  ```ts
  // scripts/ollama-socket-filter.test.ts
  import { describe, it, expect, beforeAll, afterAll } from "vitest";
  import { spawn, ChildProcess } from "node:child_process";
  import { request } from "undici";

  const FILTER_SOCK = "/tmp/ollama-filter-test.sock";
  const OLLAMA_SOCK = "/tmp/ollama-upstream-test.sock";
  let proc: ChildProcess;

  beforeAll(async () => {
    proc = spawn("tsx", ["scripts/ollama-socket-filter.ts"], {
      env: {
        ...process.env,
        FILTER_SOCKET: FILTER_SOCK,
        OLLAMA_SOCKET: OLLAMA_SOCK,
        ALLOW: "/api/tags,/api/embed,/api/generate,/api/chat",
      },
      stdio: "inherit",
    });
    await new Promise((r) => setTimeout(r, 500));
  });
  afterAll(() => proc.kill());

  it("rejects /api/pull", async () => {
    const r = await request(`http://localhost/api/pull`, {
      dispatcher: unixDispatcher(FILTER_SOCK),
      method: "POST",
    });
    expect(r.statusCode).toBe(403);
  });

  it("allows /api/tags (may fail upstream, but filter should forward)", async () => {
    const r = await request(`http://localhost/api/tags`, {
      dispatcher: unixDispatcher(FILTER_SOCK),
    });
    expect([200, 502]).toContain(r.statusCode); // 502 ok if upstream not wired in test
  });

  function unixDispatcher(p: string) {
    const { Agent } = require("undici");
    return new Agent({ connect: { socketPath: p } });
  }
  ```

- [ ] **Step 2: Run** `npx vitest run scripts/ollama-socket-filter.test.ts` → expect compile/exec failure (file not found).
- [ ] **Step 3: Implement shim**

  ```ts
  // scripts/ollama-socket-filter.ts
  import { createServer, request as httpRequest } from "node:http";
  import { unlinkSync } from "node:fs";

  const FILTER_SOCKET = process.env.FILTER_SOCKET ?? "/tmp/ollama-filter.sock";
  const OLLAMA_SOCKET = process.env.OLLAMA_SOCKET ?? "/tmp/ollama.sock";
  const ALLOW = (process.env.ALLOW ?? "/api/generate,/api/chat,/api/embed,/api/tags").split(",");

  try {
    unlinkSync(FILTER_SOCKET);
  } catch {
    /* not present */
  }

  const server = createServer((inReq, inRes) => {
    const url = new URL(inReq.url ?? "/", "http://unix");
    if (!ALLOW.some((prefix) => url.pathname === prefix || url.pathname.startsWith(prefix + "/"))) {
      inRes.statusCode = 403;
      inRes.setHeader("content-type", "application/json");
      inRes.end(JSON.stringify({ error: "endpoint blocked by ollama-socket-filter" }));
      return;
    }
    const upstream = httpRequest(
      { socketPath: OLLAMA_SOCKET, path: inReq.url, method: inReq.method, headers: inReq.headers },
      (upRes) => {
        inRes.writeHead(upRes.statusCode ?? 502, upRes.headers);
        upRes.pipe(inRes);
      },
    );
    upstream.on("error", () => {
      inRes.statusCode = 502;
      inRes.end();
    });
    inReq.pipe(upstream);
  });
  server.listen(FILTER_SOCKET, () => console.log(`filter listening on ${FILTER_SOCKET}`));
  ```

- [ ] **Step 4: Run** test again → expect PASS.
- [ ] **Step 5: Commit**
  ```bash
  git add scripts/ollama-socket-filter.ts scripts/ollama-socket-filter.test.ts
  git commit -m "feat(scripts): add ollama-socket-filter shim with endpoint allowlist"
  ```

### Task 1.4: Install filter as systemd unit

- [ ] **Step 1:** Create `scripts/ollama-systemd/ollama-filter.service`:

  ```ini
  [Unit]
  Description=Ollama socket filter
  After=ollama.service
  Requires=ollama.service

  [Service]
  Environment="FILTER_SOCKET=/tmp/ollama-filter.sock"
  Environment="OLLAMA_SOCKET=/tmp/ollama.sock"
  Environment="ALLOW=/api/generate,/api/chat,/api/embed,/api/tags"
  ExecStart=/usr/bin/node /path/to/dancesWithClaws/scripts/ollama-socket-filter.ts
  Restart=always

  [Install]
  WantedBy=default.target
  ```

- [ ] **Step 2:** Install: `sudo cp scripts/ollama-systemd/ollama-filter.service /etc/systemd/system/ && sudo systemctl enable --now ollama-filter.service`.
- [ ] **Step 3:** Verify: `curl --unix-socket /tmp/ollama-filter.sock -X POST http://localhost/api/pull -d '{}'` → returns 403.
- [ ] **Step 4:** Verify: `curl --unix-socket /tmp/ollama-filter.sock http://localhost/api/tags` → returns 200.
- [ ] **Step 5:** Commit.

---

## Phase 2 — Embeddings swap

### Task 2.1: Edit openclaw.json for embeddings

- [ ] **Step 1:** Back up: `cp openclaw.json openclaw.json.bak-$(date +%Y%m%d-%H%M)`.
- [ ] **Step 2:** Edit `openclaw.json` → `agents.list[0].memorySearch`:
  ```json
  "memorySearch": {
    "enabled": true,
    "extraPaths": ["./knowledge"],
    "provider": "ollama",
    "model": "mxbai-embed-large",
    "query": {
      "hybrid": {
        "enabled": true,
        "vectorWeight": 0.75,
        "textWeight": 0.25,
        "candidateMultiplier": 4
      }
    },
    "cache": { "enabled": true, "maxEntries": 50000 }
  }
  ```
- [ ] **Step 3:** Remove `OPENAI_API_KEY` from `env.vars` (key still declared but blank; safe to delete entirely for local stack).
- [ ] **Step 4:** Trigger one RAG query and observe re-embed of 41 files (~1–2 min). Monitor `~/.openclaw/logs/agent-logan.log` for `embeddings-ollama` entries.
- [ ] **Step 5:** Commit:
  ```bash
  git add openclaw.json
  git commit -m "feat(logan): switch memorySearch to local Ollama embeddings (mxbai-embed-large)"
  ```

---

## Phase 3 — Fallback tightening + cascadePolicy

### Task 3.1: Add `cascadePolicy` to config schema (TDD)

**Files:**

- Modify: `src/config/config.ts` (add field to `agents.list[].model` schema)
- Modify: `src/agents/model-fallback.ts`
- Create: `src/agents/model-fallback.cascade-policy.test.ts`

- [ ] **Step 1: Failing test**

  ```ts
  // src/agents/model-fallback.cascade-policy.test.ts
  import { describe, it, expect, vi } from "vitest";
  import { runWithModelFallback } from "./model-fallback.js";
  import type { OpenClawConfig } from "../config/config.js";

  describe("cascadePolicy: local-only", () => {
    it("skips cloud-provider fallbacks when policy=local-only", async () => {
      const cfg = {
        agents: {
          defaults: {
            model: {
              primary: "ollama/gemma4:e2b",
              fallbacks: ["ollama/gemma4:e4b", "anthropic/claude-haiku-4-5"],
              cascadePolicy: "local-only",
            },
          },
        },
      } as OpenClawConfig;

      const run = vi
        .fn()
        .mockRejectedValueOnce(new Error("connect ECONNREFUSED"))
        .mockRejectedValueOnce(new Error("connect ECONNREFUSED"));

      await expect(
        runWithModelFallback({
          cfg,
          provider: "ollama",
          model: "gemma4:e2b",
          run,
          agentDir: "/tmp",
        }),
      ).rejects.toThrow();

      expect(run).toHaveBeenCalledTimes(2); // skipped anthropic
      expect(run).not.toHaveBeenCalledWith("anthropic", expect.anything());
    });
  });
  ```

- [ ] **Step 2: Run** → expect FAIL ("cascadePolicy not recognized").
- [ ] **Step 3: Add schema field.** In `src/config/config.ts`, add `cascadePolicy: z.enum(["local-only", "any"]).optional()` to the model schema. In `src/agents/model-fallback.ts`, read `cfg.agents?.defaults?.model?.cascadePolicy` (and per-agent override) and skip any fallback whose provider is not a local provider (`ollama`, `pi`, etc.) when policy is `local-only`.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit**
  ```bash
  git add src/config/config.ts src/agents/model-fallback.ts src/agents/model-fallback.cascade-policy.test.ts
  git commit -m "feat(model-fallback): add cascadePolicy=local-only"
  ```

### Task 3.2: Update openclaw.json for final fallback shape

- [ ] **Step 1:** Back up openclaw.json.
- [ ] **Step 2:** Edit `agents.list[0].model`:
  ```json
  "model": {
    "primary": "ollama/gemma4:e2b",
    "fallbacks": ["ollama/gemma4:e4b"],
    "cascadePolicy": "local-only"
  }
  ```
  (Digest pinning deferred — requires OpenClaw resolver change to accept `@sha256:…` suffix in model IDs; tracked as separate item under Future Work in the spec.)
- [ ] **Step 3:** Commit:
  ```bash
  git add openclaw.json
  git commit -m "feat(logan): tighten fallback to e4b only, cascadePolicy local-only"
  ```

---

## Phase 4 — Secrets schema + `agent_env_prepare` hook

### Task 4.1: Zod schema for secrets block (TDD)

**Files:**

- Create: `src/config/secrets-schema.ts`
- Create: `src/config/secrets-schema.test.ts`

- [ ] **Step 1: Failing test**

  ```ts
  // src/config/secrets-schema.test.ts
  import { describe, it, expect } from "vitest";
  import { SecretsSchema } from "./secrets-schema.js";

  describe("SecretsSchema", () => {
    it("parses vault-source entries", () => {
      const parsed = SecretsSchema.parse({
        MOLTBOOK_API_KEY: { source: "vault", label: "moltbook_api_key" },
      });
      expect(parsed.MOLTBOOK_API_KEY.source).toBe("vault");
    });

    it("rejects unknown source", () => {
      expect(() =>
        SecretsSchema.parse({
          X: { source: "nosuch", label: "x" },
        }),
      ).toThrow();
    });

    it("requires label for vault source", () => {
      expect(() =>
        SecretsSchema.parse({
          X: { source: "vault" },
        }),
      ).toThrow();
    });
  });
  ```

- [ ] **Step 2: Run** → FAIL (module missing).
- [ ] **Step 3: Implement**

  ```ts
  // src/config/secrets-schema.ts
  import { z } from "zod";

  export const SecretEntrySchema = z.discriminatedUnion("source", [
    z.object({ source: z.literal("vault"), label: z.string().min(1) }),
    z.object({ source: z.literal("env"), name: z.string().min(1) }),
  ]);

  export const SecretsSchema = z.record(z.string().regex(/^[A-Z_][A-Z0-9_]*$/), SecretEntrySchema);

  export type Secrets = z.infer<typeof SecretsSchema>;
  export type SecretEntry = z.infer<typeof SecretEntrySchema>;
  ```

- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit**

### Task 4.2: Wire `secrets` into agent config type

**Files:**

- Modify: `src/config/config.ts` (add `secrets: SecretsSchema.optional()` to agent schema)

- [ ] **Step 1:** Open `src/config/config.ts`, locate the agent entry Zod schema.
- [ ] **Step 2:** Add import and field:
  ```ts
  import { SecretsSchema } from "./secrets-schema.js";
  // inside the agent entry schema:
  secrets: SecretsSchema.optional(),
  ```
- [ ] **Step 3:** Run full config tests: `npx vitest run src/config`. Expect PASS.
- [ ] **Step 4:** Commit.

### Task 4.3: `agent_env_prepare` hook (TDD)

**Files:**

- Create: `src/agents/hooks/agent-env-prepare.ts`
- Create: `src/agents/hooks/agent-env-prepare.test.ts`

Responsibility: given an agent config and a running OpenClaw context exposing `vault_retrieve`, resolve every entry in `agent.secrets` and return an env map. Does not touch `process.env`.

- [ ] **Step 1: Failing test**

  ```ts
  // src/agents/hooks/agent-env-prepare.test.ts
  import { describe, it, expect, vi } from "vitest";
  import { prepareAgentEnv } from "./agent-env-prepare.js";

  describe("prepareAgentEnv", () => {
    it("resolves vault secrets", async () => {
      const vaultRetrieve = vi.fn().mockResolvedValue("SECRET_VALUE");
      const env = await prepareAgentEnv({
        agent: {
          id: "logan",
          secrets: { MOLTBOOK_API_KEY: { source: "vault", label: "moltbook_api_key" } },
        },
        vaultRetrieve,
      });
      expect(env.MOLTBOOK_API_KEY).toBe("SECRET_VALUE");
      expect(vaultRetrieve).toHaveBeenCalledWith("moltbook_api_key");
    });

    it("resolves env-source secrets from passed env map", async () => {
      const env = await prepareAgentEnv({
        agent: { id: "logan", secrets: { X: { source: "env", name: "FOO" } } },
        vaultRetrieve: vi.fn(),
        hostEnv: { FOO: "bar" },
      });
      expect(env.X).toBe("bar");
    });

    it("throws loudly when vault_retrieve fails", async () => {
      const vaultRetrieve = vi.fn().mockRejectedValue(new Error("vault locked"));
      await expect(
        prepareAgentEnv({
          agent: { id: "logan", secrets: { K: { source: "vault", label: "k" } } },
          vaultRetrieve,
        }),
      ).rejects.toThrow(/vault locked/);
    });

    it("returns empty when no secrets declared", async () => {
      const env = await prepareAgentEnv({ agent: { id: "logan" }, vaultRetrieve: vi.fn() });
      expect(env).toEqual({});
    });
  });
  ```

- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement**

  ```ts
  // src/agents/hooks/agent-env-prepare.ts
  import type { Secrets } from "../../config/secrets-schema.js";

  export interface PrepareArgs {
    agent: { id: string; secrets?: Secrets };
    vaultRetrieve: (label: string) => Promise<string>;
    hostEnv?: NodeJS.ProcessEnv;
  }

  export async function prepareAgentEnv(args: PrepareArgs): Promise<Record<string, string>> {
    const out: Record<string, string> = {};
    const secrets = args.agent.secrets ?? {};
    const hostEnv = args.hostEnv ?? process.env;

    for (const [key, entry] of Object.entries(secrets)) {
      if (entry.source === "vault") {
        try {
          out[key] = await args.vaultRetrieve(entry.label);
        } catch (err) {
          throw new Error(
            `agent_env_prepare: failed to resolve vault secret '${entry.label}' for agent '${args.agent.id}': ${(err as Error).message}. ` +
              `Run 'openclaw tee status' and 'openclaw tee unlock' to diagnose.`,
          );
        }
      } else if (entry.source === "env") {
        const value = hostEnv[entry.name];
        if (value === undefined) {
          throw new Error(
            `agent_env_prepare: env variable '${entry.name}' not set for agent '${args.agent.id}'`,
          );
        }
        out[key] = value;
      }
    }
    return out;
  }
  ```

- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit**

### Task 4.4: Call hook from `acp-spawn.ts`

**Files:**

- Modify: `src/agents/acp-spawn.ts`
- Modify: `src/agents/sandbox/docker.ts` (accept injected env map)

- [ ] **Step 1:** In `acp-spawn.ts`, find the section that prepares the env for sandbox spawn (right after `applyConfigEnvVars`). Add:

  ```ts
  import { prepareAgentEnv } from "./hooks/agent-env-prepare.js";
  import { getVaultRetrieve } from "../../extensions/tee-vault/index.js"; // exported accessor

  // ... existing code ...
  const injectedSecrets = await prepareAgentEnv({
    agent: agentCfg,
    vaultRetrieve: getVaultRetrieve(),
  });
  const sandboxEnv = { ...configEnv, ...injectedSecrets };
  // pass sandboxEnv into sandbox spawn
  ```

- [ ] **Step 2:** Add `getVaultRetrieve` export in `extensions/tee-vault/index.ts` that returns a bound retrieve function.
- [ ] **Step 3:** In `sandbox/docker.ts`, accept an explicit `env: Record<string,string>` and pass each entry as `--env KEY=VALUE` (already the pattern — confirm and wire).
- [ ] **Step 4:** Run integration tests that cover agent spawn. Expect PASS.
- [ ] **Step 5:** Commit:
  ```bash
  git commit -am "feat(agents): add agent_env_prepare hook wired at sandbox spawn"
  ```

### Task 4.5: `extraVolumes` support in docker spawn (TDD)

**Files:**

- Modify: `src/agents/sandbox/docker.ts`
- Modify: existing docker-spawn test file

- [ ] **Step 1: Failing test** — add to the existing docker test suite:
  ```ts
  it("appends extraVolumes to docker run args", async () => {
    const args = await buildDockerArgs({
      agent: {
        sandbox: { docker: { extraVolumes: ["/tmp/ollama-filter.sock:/tmp/ollama.sock:ro"] } },
      },
      image: "openclaw-sandbox",
      env: {},
    });
    expect(args).toContain("--volume");
    expect(args).toContain("/tmp/ollama-filter.sock:/tmp/ollama.sock:ro");
  });
  ```
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** — in `docker.ts` loop over `agent.sandbox.docker.extraVolumes ?? []` and push `"--volume", vol`. Whitelist: reject any volume that doesn't match `^/[^:]+:/[^:]+(:(ro|rw))?$` to prevent escape.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit**

---

## Phase 5 — HSM bootstrap + non-interactive unlock

### Task 5.1: `--pin-from credmgr` flag (TDD)

**Files:**

- Modify: `extensions/tee-vault/src/cli/tee-cli.ts` (unlock subcommand)
- Modify: `extensions/tee-vault/src/integrations/credential-manager.ts`
- Create: `extensions/tee-vault/tests/cli/tee-unlock-noninteractive.test.ts`

- [ ] **Step 1: Failing test**

  ```ts
  // extensions/tee-vault/tests/cli/tee-unlock-noninteractive.test.ts
  import { describe, it, expect, vi } from "vitest";
  import { resolvePinNonInteractive } from "../../src/integrations/credential-manager.js";

  describe("resolvePinNonInteractive", () => {
    it("returns PIN from credential manager", async () => {
      vi.mock("../../src/integrations/credential-manager-winapi.js", () => ({
        getStoredCredential: async (target: string) =>
          target === "TeeVault-YubiHSM-PIN" ? "1234" : null,
      }));
      const pin = await resolvePinNonInteractive("credmgr");
      expect(pin).toBe("1234");
    });

    it("throws when source=credmgr and lookup misses", async () => {
      vi.mock("../../src/integrations/credential-manager-winapi.js", () => ({
        getStoredCredential: async () => null,
      }));
      await expect(resolvePinNonInteractive("credmgr")).rejects.toThrow(/Credential Manager/);
    });
  });
  ```

- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** `resolvePinNonInteractive(source: "credmgr"|"env")` in `credential-manager.ts` — no stdin, no prompt; loud failure.
- [ ] **Step 4:** Wire into `tee-cli.ts` unlock subcommand. Add `.option("--pin-from <source>", "credmgr|env")` and branch: if set, call `resolvePinNonInteractive`; if not set, preserve existing interactive fallback behavior.
- [ ] **Step 5: Run tests** → PASS.
- [ ] **Step 6: Commit**

### Task 5.2: Bootstrap vault on host (manual run, documented)

Non-code steps. Commit documentation once the sequence succeeds.

- [ ] **Step 1:** Verify `yubihsm-connector` running: `curl http://localhost:12345/connector/status`.
- [ ] **Step 2:** `openclaw tee credential store --target hsmPin` (paste PIN).
- [ ] **Step 3:** `openclaw tee init --backend yubihsm` → expect "Vault initialized (backend: yubihsm)".
- [ ] **Step 4:** `openclaw tee unlock --pin-from credmgr` → expect "Vault unlocked".
- [ ] **Step 5:** Import secret:
  ```bash
  echo "$MOLTBOOK_API_KEY" | openclaw tee import \
    --label moltbook_api_key \
    --type api_token \
    --tag production,cardano
  ```
- [ ] **Step 6:** Verify: `openclaw tee list` shows entry; `openclaw tee export --label moltbook_api_key` returns correct value.
- [ ] **Step 7:** Backup: `openclaw tee backup --out /mnt/d/backups/vault.enc.$(date +%Y%m%d)` (adjust path to off-disk location, e.g., IronKey).
- [ ] **Step 8:** Commit a short runbook snippet into `docs/superpowers/plans/artifacts/vault-bootstrap-<date>.md`.

### Task 5.3: Recurring vault backup cron

- [ ] **Step 1:** Add cron (WSL2): `crontab -e`, insert `0 2 * * * openclaw tee backup --out /mnt/d/backups/vault.enc.$(date +\%Y\%m\%d) >/dev/null 2>&1`.
- [ ] **Step 2:** Document in runbook. Commit.

---

## Phase 6 — Sandbox wiring + openclaw.json updates

### Task 6.1: Add sandbox extraVolumes + secrets block

- [ ] **Step 1:** Back up `openclaw.json`.
- [ ] **Step 2:** Edit `agents.list[0]`:
  ```json
  "secrets": {
    "MOLTBOOK_API_KEY": { "source": "vault", "label": "moltbook_api_key" }
  },
  "sandbox": {
    "mode": "all",
    "workspaceAccess": "rw",
    "scope": "agent",
    "docker": {
      "readOnlyRoot": true,
      "tmpfs": ["/tmp", "/var/tmp", "/run"],
      "network": "oc-sandbox-net",
      "capDrop": ["ALL"],
      "pidsLimit": 256,
      "memory": "512m",
      "cpus": 1,
      "seccompProfile": "./security/seccomp-sandbox.json",
      "dns": ["172.30.0.10"],
      "extraHosts": ["proxy:172.30.0.10"],
      "extraVolumes": ["/tmp/ollama-filter.sock:/tmp/ollama.sock:ro"],
      "user": "sandboxuser"
    }
  }
  ```
- [ ] **Step 3:** Add to `env.vars`: `"OLLAMA_HOST": "unix:///tmp/ollama.sock"`.
- [ ] **Step 4:** Remove `"MOLTBOOK_API_KEY": ""` and `"OPENAI_API_KEY": ""` from `env.vars` (moved to secrets or unused).
- [ ] **Step 5:** Dry-run: `openclaw agent start logan --task once` (or equivalent). Inspect `docker ps` for sandbox. From another terminal:
  ```bash
  SB=$(docker ps --filter ancestor=openclaw-sandbox -q | head -1)
  docker exec "$SB" curl --unix-socket /tmp/ollama.sock http://localhost/api/tags
  ```
- [ ] **Step 6:** Commit.

---

## Phase 7 — Launch wrapper + Task Scheduler

### Task 7.1: Windows wrapper

**Files:**

- Create: `scripts/launch-logan-with-vault.ps1`

- [ ] **Step 1:** Create:

  ```powershell
  # scripts/launch-logan-with-vault.ps1
  $ErrorActionPreference = "Stop"

  function Wait-OllamaReady {
    param([int]$TimeoutSec = 60)
    $deadline = (Get-Date).AddSeconds($TimeoutSec)
    while ((Get-Date) -lt $deadline) {
      $result = wsl -e sh -c "curl -sSf --unix-socket /tmp/ollama-filter.sock http://localhost/api/tags >/dev/null 2>&1 && echo ok || echo no"
      if ($result -eq "ok") { return }
      Start-Sleep -Seconds 1
    }
    throw "Ollama not ready within $TimeoutSec seconds"
  }

  Write-Host "[logan-wrapper] waiting for Ollama filter socket..."
  Wait-OllamaReady -TimeoutSec 60

  Write-Host "[logan-wrapper] unlocking vault..."
  & openclaw tee unlock --pin-from credmgr
  if ($LASTEXITCODE -ne 0) { throw "vault unlock failed" }

  try {
    Write-Host "[logan-wrapper] starting Logan..."
    & openclaw agent start logan
  } finally {
    Write-Host "[logan-wrapper] locking vault..."
    & openclaw tee lock
  }
  ```

- [ ] **Step 2:** Test: run the wrapper manually. Verify Logan boots, first heartbeat succeeds, vault re-locks on exit.
- [ ] **Step 3:** Commit.

### Task 7.2: WSL wrapper

**Files:**

- Create: `scripts/launch-logan-with-vault.sh`

- [ ] **Step 1:** Mirror-translate the PowerShell wrapper to bash:

  ```bash
  #!/usr/bin/env bash
  set -euo pipefail

  wait_ollama_ready() {
    local timeout=${1:-60} deadline=$((SECONDS + timeout))
    until curl -sSf --unix-socket /tmp/ollama-filter.sock http://localhost/api/tags >/dev/null; do
      (( SECONDS < deadline )) || { echo "ollama not ready" >&2; exit 1; }
      sleep 1
    done
  }

  echo "[logan-wrapper] waiting for Ollama filter socket..."
  wait_ollama_ready 60

  echo "[logan-wrapper] unlocking vault..."
  openclaw tee unlock --pin-from credmgr

  trap 'openclaw tee lock || true' EXIT

  echo "[logan-wrapper] starting Logan..."
  exec openclaw agent start logan
  ```

- [ ] **Step 2:** `chmod +x scripts/launch-logan-with-vault.sh`.
- [ ] **Step 3:** Commit.

### Task 7.3: Register Windows Task Scheduler task

- [ ] **Step 1:** Open Task Scheduler (as the user, NOT elevated to SYSTEM).
- [ ] **Step 2:** Create basic task:
  - Name: `Logan`
  - Trigger: At logon of your user
  - Action: `powershell.exe -NoProfile -ExecutionPolicy Bypass -File C:\dancesWithClaws\scripts\launch-logan-with-vault.ps1`
  - Run as: [your user account], "only when user is logged on"
  - **Do NOT check "Run with highest privileges" unless necessary** — Credential Manager access is user-context.
- [ ] **Step 3:** Export task to XML and commit: `schtasks /query /tn "Logan" /xml > scripts/tasks/logan.xml`.
- [ ] **Step 4:** Commit.

### Task 7.4: Clean up `.bashrc`

- [ ] **Step 1:** Remove `export MOLTBOOK_API_KEY=…` from `~/.bashrc` (and `OPENAI_API_KEY` if present).
- [ ] **Step 2:** `source ~/.bashrc; env | grep -i moltbook` → should be empty.
- [ ] **Step 3:** This change is on the user's shell config, not checked in.

---

## Phase 8 — Verification + canary

### Task 8.1: Smoke-test the full path

- [ ] **Step 1:** Reboot the box.
- [ ] **Step 2:** After logon, wait 2 minutes. Check that the wrapper started: `Get-ScheduledTaskInfo -TaskName "Logan" | Select LastRunTime, LastTaskResult`.
- [ ] **Step 3:** Inside WSL2: `tail -n 200 ~/.openclaw/logs/agent-logan.log`. Look for: "Ollama ready", "vault unlocked", first "heartbeat fired" entry.
- [ ] **Step 4:** From the sandbox: verify filtered socket works and admin is blocked:
  ```bash
  SB=$(docker ps --filter ancestor=openclaw-sandbox -q | head -1)
  docker exec "$SB" curl -s -o /dev/null -w "%{http_code}" --unix-socket /tmp/ollama.sock http://localhost/api/tags       # 200
  docker exec "$SB" curl -s -o /dev/null -w "%{http_code}" -X POST --unix-socket /tmp/ollama.sock http://localhost/api/pull -d '{}'  # 403
  ```
- [ ] **Step 5:** Proxy allowlist still works:
  ```bash
  docker exec "$SB" curl -s -o /dev/null -w "%{http_code}" https://moltbook.com   # 200
  docker exec "$SB" curl -s -o /dev/null -w "%{http_code}" https://evil.com       # 403
  ```
- [ ] **Step 6:** `docker exec "$SB" printenv MOLTBOOK_API_KEY | head -c 4` returns the first 4 chars of the expected key. **Note: remove this step from the runbook after first-run verification** (to avoid echoing secrets into shell history).

### Task 8.2: Ollama-down failure path

- [ ] **Step 1:** `wsl -d Ubuntu sudo systemctl stop ollama`.
- [ ] **Step 2:** Wait for next heartbeat (or trigger manually).
- [ ] **Step 3:** Verify in log: exactly one "primary failed: ECONNREFUSED" and one "fallback failed: ECONNREFUSED"; then a pause; no cascading to cloud (because `cascadePolicy: "local-only"`).
- [ ] **Step 4:** `wsl -d Ubuntu sudo systemctl start ollama`. Next heartbeat should succeed.

### Task 8.3: Three real Logan tasks (quality canary)

- [ ] **Task A:** Prompt Logan: "Summarize eUTxO in 3 sentences with a marine analogy."
- [ ] **Task B:** Prompt Logan: "Compare Ouroboros Praos to Genesis in a short post."
- [ ] **Task C:** Prompt Logan: "Reply to @some-agent's post about account-based chains."
- [ ] **Record:** Copy outputs into `docs/superpowers/plans/artifacts/canary-<date>.md`. Note: on-brand, factual, no price speculation, marine analogies present. If any response is off-brand or wrong on protocol facts, open a GitHub issue referencing this plan and the council review's quality-risk finding.

### Task 8.4: Observability drill

- [ ] Run each grep from the Observability Runbook against live logs. Confirm patterns hit. Fix gaps in the spec if not.

---

## Self-Review Checklist

- [ ] Every Phase in the spec has at least one task here.
- [ ] Council high-severity findings:
  - H2 (wrapper doesn't exist) → Task 7.1 / 7.2
  - H3 (service-context PIN hang) → Task 5.1 + Task 7.3 (user-context pin)
  - H4 (Ollama readiness race) → Task 7.1 `Wait-OllamaReady`
  - H5 (observability) → Observability Runbook in spec + Task 8.4
  - H6 (wrapper + hook now) → Phase 4 builds the hook in-tree
  - H7 (`secrets` block) → Phase 4 Task 4.1 / 4.2
  - H8 (GPU unvalidated) → Phase 0 Task 0.3 abort gate
  - H9 (silent pause) → Task 8.2 verification
- [ ] No TBD/TODO placeholders.
- [ ] Tests provided for all code tasks.
- [ ] Commands, file paths, and expected outputs are concrete.

## Out of Scope (explicit)

- Digest pinning in `openclaw.json` model IDs (requires model-resolver work; tracked as separate item).
- Cardano signing keys in HSM (deferred until Logan signs on-chain).
- Cloud backstop via vaulted Claude/OpenAI key (explicitly deferred per spec D5).
- `openclaw tee health-check` CLI convenience command (nice-to-have).
- WSL2 GPU-passthrough to Docker containers (not needed; Ollama runs in WSL2 host namespace).

## Execution

Plan complete and saved to `docs/superpowers/plans/2026-04-21-logan-local-hsm-gemma-plan.md`.

Two execution options:

**1. Subagent-Driven (recommended)** — dispatch a fresh subagent per task, review between tasks, fast iteration.
**2. Inline Execution** — run tasks here via `superpowers:executing-plans`, batch execution with checkpoints.

Which approach?
