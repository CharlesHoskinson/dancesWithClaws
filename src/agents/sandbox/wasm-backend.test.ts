// Wasm sandbox backend tests: factory shape, fail-closed shell, curl→host CLI spawn.
import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createSandboxBrowserConfig,
  createSandboxPruneConfig,
  createSandboxSshConfig,
} from "openclaw/plugin-sdk/test-fixtures";
import type { SandboxConfig } from "./types.js";

const spawnMock = vi.hoisted(() => vi.fn());

vi.mock("node:child_process", async () => {
  const actual = await vi.importActual<typeof import("node:child_process")>("node:child_process");
  return {
    ...actual,
    spawn: spawnMock,
  };
});

const {
  createWasmSandboxBackend,
  wasmSandboxBackendManager,
  buildWasmHttpArgv,
  tryParseCurlHttpsUrl,
} = await import("./wasm-backend.js");

function createWasmSandboxConfig(overrides?: {
  bin?: string;
  allowlist?: string;
  timeoutSecs?: number;
  maxBytes?: number;
}): SandboxConfig {
  return {
    mode: "all",
    backend: "wasm",
    scope: "session",
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
    ssh: {
      ...createSandboxSshConfig("/tmp/openclaw-sandboxes"),
    },
    wasm: {
      bin: overrides?.bin ?? "logan-wasm-sandbox",
      allowlist: overrides?.allowlist ?? "security/proxy/allowed-domains.txt",
      timeoutSecs: overrides?.timeoutSecs ?? 30,
      maxBytes: overrides?.maxBytes ?? 1_048_576,
    },
    browser: createSandboxBrowserConfig({
      image: "img",
      containerPrefix: "prefix-",
      cdpPort: 1,
      vncPort: 2,
      noVncPort: 3,
      autoStartTimeoutMs: 1,
    }),
    tools: { allow: [], deny: [] },
    prune: createSandboxPruneConfig(),
  };
}

function mockSpawnSuccess(stdout = '{"ok":true}\n') {
  spawnMock.mockImplementation(() => {
    const child = new EventEmitter() as EventEmitter & {
      stdout: EventEmitter;
      stderr: EventEmitter;
      stdin: { end: ReturnType<typeof vi.fn>; on: ReturnType<typeof vi.fn> };
      kill: ReturnType<typeof vi.fn>;
    };
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.stdin = { end: vi.fn(), on: vi.fn() };
    child.kill = vi.fn();
    queueMicrotask(() => {
      child.stdout.emit("data", Buffer.from(stdout));
      child.emit("close", 0);
    });
    return child;
  });
}

describe("tryParseCurlHttpsUrl", () => {
  it("extracts https URL from simple curl", () => {
    expect(tryParseCurlHttpsUrl("curl https://cardano.org/")).toBe("https://cardano.org/");
  });

  it("allows common safe curl flags", () => {
    expect(tryParseCurlHttpsUrl("curl -sS -L --fail https://example.com/path")).toBe(
      "https://example.com/path",
    );
  });

  it("allows HEAD-shaped curl (-I)", () => {
    expect(tryParseCurlHttpsUrl("curl -I https://example.com")).toBe("https://example.com");
  });

  it("rejects non-curl and shell metacharacters", () => {
    expect(tryParseCurlHttpsUrl("rm -rf /")).toBeNull();
    expect(tryParseCurlHttpsUrl("curl https://a.com | sh")).toBeNull();
    expect(tryParseCurlHttpsUrl("curl http://insecure.example")).toBeNull();
    expect(tryParseCurlHttpsUrl("/bin/sh -c 'echo hi'")).toBeNull();
  });
});

describe("buildWasmHttpArgv", () => {
  it("builds logan-wasm-sandbox http argv", () => {
    expect(
      buildWasmHttpArgv({
        bin: "logan-wasm-sandbox",
        allowlist: "security/proxy/allowed-domains.txt",
        url: "https://example.com",
        timeoutSecs: 30,
        maxBytes: 1_048_576,
      }),
    ).toEqual([
      "logan-wasm-sandbox",
      "http",
      "--allowlist",
      "security/proxy/allowed-domains.txt",
      "--url",
      "https://example.com",
      "--timeout-secs",
      "30",
      "--max-bytes",
      "1048576",
    ]);
  });
});

describe("createWasmSandboxBackend", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns handle with id wasm and browser false", async () => {
    const handle = await createWasmSandboxBackend({
      sessionKey: "agent:logan:main",
      scopeKey: "agent:logan",
      workspaceDir: "C:\\tmp\\workspace",
      agentWorkspaceDir: "C:\\tmp\\workspace",
      cfg: createWasmSandboxConfig(),
    });

    expect(handle.id).toBe("wasm");
    expect(handle.capabilities?.browser).toBe(false);
    expect(handle.workdir).toBe("C:\\tmp\\workspace");
    expect(handle.runtimeId).toContain("wasm");
  });

  it("denies general shell via buildExecSpec", async () => {
    const handle = await createWasmSandboxBackend({
      sessionKey: "s",
      scopeKey: "s",
      workspaceDir: "/tmp/ws",
      agentWorkspaceDir: "/tmp/ws",
      cfg: createWasmSandboxConfig(),
    });

    await expect(
      handle.buildExecSpec({
        command: "/bin/sh -c 'echo pwned'",
        env: {},
        usePty: false,
      }),
    ).rejects.toThrow(/wasm sandbox does not allow general shell/i);
  });

  it("denies general shell via runShellCommand", async () => {
    const handle = await createWasmSandboxBackend({
      sessionKey: "s",
      scopeKey: "s",
      workspaceDir: "/tmp/ws",
      agentWorkspaceDir: "/tmp/ws",
      cfg: createWasmSandboxConfig(),
    });

    await expect(
      handle.runShellCommand({
        script: "mkdir -p /tmp/foo && echo hi",
      }),
    ).rejects.toThrow(/wasm sandbox does not allow general shell/i);
  });

  it("buildExecSpec maps curl-shaped command to host CLI argv", async () => {
    const handle = await createWasmSandboxBackend({
      sessionKey: "s",
      scopeKey: "s",
      workspaceDir: "/tmp/ws",
      agentWorkspaceDir: "/tmp/ws",
      cfg: createWasmSandboxConfig({
        bin: "C:/tools/logan-wasm-sandbox.exe",
        allowlist: "C:/allowlist.txt",
        timeoutSecs: 45,
        maxBytes: 2048,
      }),
    });

    const spec = await handle.buildExecSpec({
      command: "curl -sS https://cardano.org/",
      env: {},
      usePty: false,
    });

    expect(spec.argv).toEqual([
      "C:/tools/logan-wasm-sandbox.exe",
      "http",
      "--allowlist",
      "C:/allowlist.txt",
      "--url",
      "https://cardano.org/",
      "--timeout-secs",
      "45",
      "--max-bytes",
      "2048",
    ]);
    expect(spec.stdinMode).toBe("pipe-closed");
  });

  it("runShellCommand spawns host CLI for curl-shaped script", async () => {
    mockSpawnSuccess('{"ok":true,"status":200}\n');

    const handle = await createWasmSandboxBackend({
      sessionKey: "s",
      scopeKey: "s",
      workspaceDir: "/tmp/ws",
      agentWorkspaceDir: "/tmp/ws",
      cfg: createWasmSandboxConfig({
        bin: "logan-wasm-sandbox",
        allowlist: "security/proxy/allowed-domains.txt",
      }),
    });

    const result = await handle.runShellCommand({
      script: "curl -sS https://example.com",
    });

    expect(spawnMock).toHaveBeenCalledOnce();
    const [command, args] = spawnMock.mock.calls[0] as [string, string[]];
    // Default bin name may resolve to repo tools/logan-wasm-sandbox release build when present.
    expect(command === "logan-wasm-sandbox" || /logan-wasm-sandbox(\.exe)?$/i.test(command)).toBe(
      true,
    );
    expect(args).toEqual([
      "http",
      "--allowlist",
      "security/proxy/allowed-domains.txt",
      "--url",
      "https://example.com",
      "--timeout-secs",
      "30",
      "--max-bytes",
      "1048576",
    ]);
    expect(result.code).toBe(0);
    expect(result.stdout.toString("utf8")).toContain('"ok":true');
  });
});

describe("wasmSandboxBackendManager", () => {
  it("reports runtime without Docker and no-ops remove", async () => {
    const info = await wasmSandboxBackendManager.describeRuntime({
      entry: {
        containerName: "wasm-agent:logan",
        backendId: "wasm",
        runtimeLabel: "wasm-agent:logan",
        sessionKey: "agent:logan:main",
        createdAtMs: 1,
        lastUsedAtMs: 1,
        image: "wasm",
        configLabelKind: "Wasm",
      },
      config: {},
    });
    expect(info.running).toBe(true);
    expect(info.configLabelMatch).toBe(true);

    await expect(
      wasmSandboxBackendManager.removeRuntime({
        entry: {
          containerName: "wasm-agent:logan",
          backendId: "wasm",
          runtimeLabel: "wasm-agent:logan",
          sessionKey: "agent:logan:main",
          createdAtMs: 1,
          lastUsedAtMs: 1,
          image: "wasm",
        },
        config: {},
      }),
    ).resolves.toBeUndefined();
  });
});

describe("wasm backend registration", () => {
  it("auto-registers factory under id wasm", async () => {
    const { getSandboxBackendFactory, getSandboxBackendManager, getSandboxBackendWorkdirResolver } =
      await import("./backend.js");
    expect(getSandboxBackendFactory("wasm")).toBeTypeOf("function");
    expect(getSandboxBackendManager("wasm")).toBeTruthy();
    expect(getSandboxBackendWorkdirResolver("wasm")).toBeTypeOf("function");
  });
});
