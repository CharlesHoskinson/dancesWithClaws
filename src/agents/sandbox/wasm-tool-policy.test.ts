/**
 * Task 5: tool policy + exec routing for wasm sandbox.
 *
 * Proves sandboxed curl goes through backend buildExecSpec (host HTTPS argv),
 * browser spawn stays denied, and create_job-class tools stay off-wasm.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { OpenClawConfig } from "../../config/config.js";
import { captureEnv, deleteTestEnvValue, setTestEnvValue } from "../../test-utils/env.js";
import { createExecTool } from "../bash-tools.exec.js";
import { resetProcessRegistryForTests } from "../bash-process-registry.js";
import {
  createSandboxBrowserConfig,
  createSandboxPruneConfig,
  createSandboxSshConfig,
} from "openclaw/plugin-sdk/test-fixtures";
import {
  applyWasmSandboxToolPolicyConstraints,
  isToolAllowed,
  resolveSandboxBackendIdForAgent,
  resolveSandboxToolPolicyForAgent,
  WASM_SANDBOX_FORCED_TOOL_DENY,
} from "./tool-policy.js";
import type { SandboxConfig } from "./types.js";
import { createWasmSandboxBackend, tryParseCurlHttpsUrl } from "./wasm-backend.js";

function createWasmCfg(params?: {
  agentId?: string;
  sandboxTools?: { allow?: string[]; alsoAllow?: string[]; deny?: string[] };
  agentToolsDeny?: string[];
}): OpenClawConfig {
  const agentId = params?.agentId ?? "logan";
  return {
    agents: {
      defaults: {
        sandbox: { mode: "all", scope: "agent", backend: "wasm" },
      },
      list: [
        {
          id: agentId,
          sandbox: {
            mode: "all",
            backend: "wasm",
            wasm: { allowlist: "security/proxy/allowed-domains.txt" },
          },
          tools: {
            deny: params?.agentToolsDeny,
            sandbox: params?.sandboxTools
              ? {
                  tools: params.sandboxTools,
                }
              : undefined,
          },
        },
      ],
    },
  };
}

function createWasmSandboxConfigFixture(): SandboxConfig {
  return {
    mode: "all",
    backend: "wasm",
    scope: "agent",
    workspaceAccess: "rw",
    workspaceRoot: "~/.openclaw/sandboxes",
    docker: {
      image: "img",
      containerPrefix: "prefix-",
      workdir: "/workspace",
      readOnlyRoot: true,
      tmpfs: ["/tmp"],
      network: "none",
      capDrop: ["ALL"],
      env: {},
    },
    ssh: createSandboxSshConfig("/tmp/openclaw-sandboxes"),
    wasm: {
      bin: "C:/tools/logan-wasm-sandbox.exe",
      allowlist: "C:/allowlist.txt",
      timeoutSecs: 30,
      maxBytes: 1_048_576,
    },
    browser: createSandboxBrowserConfig({
      image: "img",
      containerPrefix: "prefix-",
      cdpPort: 1,
      vncPort: 2,
      noVncPort: 3,
      autoStartTimeoutMs: 1,
      enabled: false,
    }),
    tools: { allow: [], deny: [] },
    prune: createSandboxPruneConfig(),
  };
}

describe("wasm sandbox tool policy mapping", () => {
  it("resolves backend id from agent override", () => {
    expect(resolveSandboxBackendIdForAgent(createWasmCfg(), "logan")).toBe("wasm");
    expect(
      resolveSandboxBackendIdForAgent(
        {
          agents: {
            defaults: { sandbox: { backend: "docker" } },
            list: [{ id: "main" }],
          },
        },
        "main",
      ),
    ).toBe("docker");
  });

  it("force-denies browser and create_job under wasm even when re-allowed", () => {
    const cfg = createWasmCfg({
      sandboxTools: {
        allow: ["exec", "browser", "sokosumi_create_job", "read"],
      },
    });
    const resolved = resolveSandboxToolPolicyForAgent(cfg, "logan");

    expect(resolved.deny).toEqual(
      expect.arrayContaining([...WASM_SANDBOX_FORCED_TOOL_DENY]),
    );
    expect(resolved.allow).toContain("exec");
    expect(resolved.allow).not.toContain("browser");
    expect(resolved.allow).not.toContain("sokosumi_create_job");

    const policy = { allow: resolved.allow, deny: resolved.deny };
    expect(isToolAllowed(policy, "exec")).toBe(true);
    expect(isToolAllowed(policy, "browser")).toBe(false);
    expect(isToolAllowed(policy, "sokosumi_create_job")).toBe(false);
  });

  it("force-denies browser under wasm allow-all (allow: [])", () => {
    const cfg = createWasmCfg({
      sandboxTools: {
        allow: [],
        alsoAllow: ["browser", "sokosumi_create_job"],
      },
    });
    const resolved = resolveSandboxToolPolicyForAgent(cfg, "logan");
    expect(resolved.allow).toStrictEqual([]);
    expect(isToolAllowed({ allow: resolved.allow, deny: resolved.deny }, "browser")).toBe(false);
    expect(
      isToolAllowed({ allow: resolved.allow, deny: resolved.deny }, "sokosumi_create_job"),
    ).toBe(false);
    expect(isToolAllowed({ allow: resolved.allow, deny: resolved.deny }, "exec")).toBe(true);
  });

  it("does not force wasm denies on docker backend", () => {
    const cfg: OpenClawConfig = {
      agents: {
        defaults: { sandbox: { mode: "all", backend: "docker" } },
      },
      tools: {
        sandbox: {
          tools: {
            allow: ["browser", "exec"],
          },
        },
      },
    };
    const resolved = resolveSandboxToolPolicyForAgent(cfg, "main");
    expect(isToolAllowed({ allow: resolved.allow, deny: resolved.deny }, "browser")).toBe(true);
  });

  it("applyWasmSandboxToolPolicyConstraints is idempotent on forced deny", () => {
    const once = applyWasmSandboxToolPolicyConstraints({
      allow: ["exec", "browser"],
      deny: [],
    });
    const twice = applyWasmSandboxToolPolicyConstraints(once);
    expect(twice.allow).toEqual(once.allow);
    expect(new Set(twice.deny)).toEqual(new Set(once.deny));
    expect(twice.allow).not.toContain("browser");
  });
});

describe("wasm sandboxed exec routing (safeBins curl → host HTTPS)", () => {
  let envSnapshot: ReturnType<typeof captureEnv>;
  let tempRoot: string | undefined;

  beforeEach(() => {
    envSnapshot = captureEnv([
      "HOME",
      "USERPROFILE",
      "HOMEDRIVE",
      "HOMEPATH",
      "OPENCLAW_HOME",
      "OPENCLAW_STATE_DIR",
      "SHELL",
    ]);
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "openclaw-wasm-tool-policy-"));
    setTestEnvValue("HOME", tempRoot);
    setTestEnvValue("USERPROFILE", tempRoot);
    setTestEnvValue("OPENCLAW_HOME", tempRoot);
    setTestEnvValue("OPENCLAW_STATE_DIR", path.join(tempRoot, "state"));
    if (process.platform === "win32") {
      const parsed = path.parse(tempRoot);
      setTestEnvValue("HOMEDRIVE", parsed.root.slice(0, 2));
      setTestEnvValue("HOMEPATH", tempRoot.slice(2) || "\\");
    } else {
      deleteTestEnvValue("HOMEDRIVE");
      deleteTestEnvValue("HOMEPATH");
    }
    resetProcessRegistryForTests();
  });

  afterEach(() => {
    resetProcessRegistryForTests();
    envSnapshot.restore();
    if (tempRoot) {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it("createExecTool host=sandbox routes curl through backend buildExecSpec (not docker)", async () => {
    const workspace = tempRoot!;
    const buildExecSpec = vi.fn(async (params: { command: string }) => {
      const url = tryParseCurlHttpsUrl(params.command);
      expect(url).toBe("https://example.com/");
      // Local no-network stand-in for host CLI success (proves routing, not HTTP).
      return {
        argv:
          process.platform === "win32"
            ? [process.execPath, "-e", "process.stdout.write('mediated-http-ok')"]
            : ["/bin/echo", "mediated-http-ok"],
        env: process.env,
        stdinMode: "pipe-closed" as const,
      };
    });

    const tool = createExecTool({
      host: "sandbox",
      security: "allowlist",
      ask: "off",
      safeBins: ["curl"],
      sandbox: {
        containerName: "wasm-agent-logan",
        workspaceDir: workspace,
        containerWorkdir: workspace,
        buildExecSpec,
      },
    });

    const result = await tool.execute("call-wasm-curl", {
      command: "curl -sS https://example.com/",
    });

    expect(buildExecSpec).toHaveBeenCalledOnce();
    expect(buildExecSpec.mock.calls[0]?.[0]?.command).toContain("curl");
    const text = (result.content[0] as { text?: string }).text ?? "";
    expect(text).toContain("mediated-http-ok");
    // Ensure we did not fall back to docker exec argv construction in the mock.
    const argv = await buildExecSpec.mock.results[0]?.value;
    expect(argv?.argv?.[0]).not.toBe("docker");
  });

  it("createExecTool + real wasm handle denies unrestricted shell", async () => {
    const workspace = tempRoot!;
    const handle = await createWasmSandboxBackend({
      sessionKey: "agent:logan:main",
      scopeKey: "agent:logan",
      workspaceDir: workspace,
      agentWorkspaceDir: workspace,
      cfg: createWasmSandboxConfigFixture(),
    });

    const tool = createExecTool({
      host: "sandbox",
      security: "allowlist",
      ask: "off",
      safeBins: ["curl"],
      sandbox: {
        containerName: handle.runtimeId,
        workspaceDir: workspace,
        containerWorkdir: handle.workdir,
        buildExecSpec: handle.buildExecSpec.bind(handle),
      },
    });

    await expect(
      tool.execute("call-wasm-shell", {
        command: "echo pwned",
      }),
    ).rejects.toThrow(/wasm sandbox does not allow general shell/i);
  });

  it("createExecTool + real wasm handle maps curl to host HTTPS argv before spawn", async () => {
    const workspace = tempRoot!;
    const handle = await createWasmSandboxBackend({
      sessionKey: "agent:logan:main",
      scopeKey: "agent:logan",
      workspaceDir: workspace,
      agentWorkspaceDir: workspace,
      cfg: createWasmSandboxConfigFixture(),
    });

    const spec = await handle.buildExecSpec({
      command: "curl -sS https://cardano.org/",
      env: {},
      usePty: false,
    });

    expect(spec.argv[0]).toBe("C:/tools/logan-wasm-sandbox.exe");
    expect(spec.argv).toContain("http");
    expect(spec.argv).toContain("--url");
    expect(spec.argv[spec.argv.indexOf("--url") + 1]).toBe("https://cardano.org/");
    expect(spec.argv).not.toContain("docker");
    expect(spec.argv).not.toContain("curl");
  });
});

describe("wasm browser spawn deny", () => {
  it("refuses browser sandboxes when backend capabilities.browser is false", async () => {
    // Mirror resolveSandboxContext gate without spinning full docker/browser stacks.
    const handle = await createWasmSandboxBackend({
      sessionKey: "agent:logan:main",
      scopeKey: "agent:logan",
      workspaceDir: "/tmp/ws",
      agentWorkspaceDir: "/tmp/ws",
      cfg: createWasmSandboxConfigFixture(),
    });
    expect(handle.capabilities?.browser).toBe(false);

    const browserEnabled = true;
    const rejectBrowser =
      browserEnabled && handle.capabilities?.browser !== true
        ? new Error(
            `Sandbox backend "${handle.id}" does not support browser sandboxes yet.`,
          )
        : null;
    expect(rejectBrowser?.message).toMatch(/does not support browser sandboxes/i);
  });
});
