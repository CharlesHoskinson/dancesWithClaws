/**
 * Wasm sandbox backend implementation.
 *
 * Capability-narrow runtime: allowlisted HTTPS via logan-wasm-sandbox host CLI,
 * host workspace as workdir, no general shell, no browser container.
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createAbortError } from "../../infra/abort-signal.js";
import type {
  SandboxBackendCommandParams,
  SandboxBackendCommandResult,
  SandboxBackendExecSpec,
} from "./backend-handle.types.js";
import type {
  CreateSandboxBackendParams,
  SandboxBackendHandle,
  SandboxBackendManager,
} from "./backend.types.js";
import {
  DEFAULT_WASM_SANDBOX_ALLOWLIST,
  DEFAULT_WASM_SANDBOX_BIN,
  DEFAULT_WASM_SANDBOX_MAX_BYTES,
  DEFAULT_WASM_SANDBOX_TIMEOUT_SECS,
} from "./constants.js";
import { createSandboxFsBridge } from "./fs-bridge.js";
import type { SandboxWasmConfig } from "./types.js";

export {
  DEFAULT_WASM_SANDBOX_ALLOWLIST,
  DEFAULT_WASM_SANDBOX_BIN,
  DEFAULT_WASM_SANDBOX_MAX_BYTES,
  DEFAULT_WASM_SANDBOX_TIMEOUT_SECS,
};

/** Flags that do not take a following argument and are safe to ignore for GET/HEAD curl. */
const CURL_SAFE_FLAGS = new Set([
  "-s",
  "--silent",
  "-S",
  "--show-error",
  "-f",
  "--fail",
  "-L",
  "--location",
  "-I",
  "--head",
  "-i",
  "--include",
  "-v",
  "--verbose",
  "-k",
  "--insecure",
  "-g",
  "--globoff",
  "-4",
  "-6",
  "--compressed",
  "-N",
  "--no-buffer",
]);

/** Flags that consume the next token; values are discarded for policy-narrow curl. */
const CURL_SAFE_FLAGS_WITH_ARG = new Set([
  "-o",
  "--output",
  "-w",
  "--write-out",
  "-A",
  "--user-agent",
  "-H",
  "--header",
  "-m",
  "--max-time",
  "--connect-timeout",
  "--retry",
  "--retry-delay",
  "-X",
  "--request",
]);

/** True when shell composition/redirection operators appear *outside* quotes. */
function shellMetacharactersPresentOutsideQuotes(command: string): boolean {
  // Fail closed on unquoted composition / redirection / substitution.
  // Characters inside '…' or "…" (e.g. query-string `&`) are not composition risks
  // for our curl-shaped policy — tokenizeSimple strips the quotes next.
  let quote: '"' | "'" | null = null;
  for (let i = 0; i < command.length; i += 1) {
    const ch = command[i]!;
    if (quote) {
      if (ch === quote) {
        quote = null;
      }
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (/[|;&`$()<>\n\r]/.test(ch)) {
      return true;
    }
  }
  return false;
}

function tokenizeSimple(command: string): string[] | null {
  const tokens: string[] = [];
  let current = "";
  let quote: '"' | "'" | null = null;
  for (let i = 0; i < command.length; i += 1) {
    const ch = command[i]!;
    if (quote) {
      if (ch === quote) {
        quote = null;
      } else {
        current += ch;
      }
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (/\s/.test(ch)) {
      if (current) {
        tokens.push(current);
        current = "";
      }
      continue;
    }
    current += ch;
  }
  if (quote) {
    return null;
  }
  if (current) {
    tokens.push(current);
  }
  return tokens;
}

function basenameCommand(token: string): string {
  const base = path.basename(token.replaceAll("\\", "/"));
  return base.replace(/\.exe$/i, "").toLowerCase();
}

/**
 * Parse a curl-shaped command and return the single https URL, or null if not allowed.
 * Only GET/HEAD-equivalent shapes are accepted (no body methods, no shell composition).
 */
export function tryParseCurlHttpsUrl(command: string): string | null {
  const trimmed = command.trim();
  if (!trimmed || shellMetacharactersPresentOutsideQuotes(trimmed)) {
    return null;
  }
  const tokens = tokenizeSimple(trimmed);
  if (!tokens || tokens.length < 2) {
    return null;
  }
  if (basenameCommand(tokens[0]!) !== "curl") {
    return null;
  }

  let url: string | undefined;
  for (let i = 1; i < tokens.length; i += 1) {
    const token = tokens[i]!;
    if (CURL_SAFE_FLAGS.has(token)) {
      continue;
    }
    if (CURL_SAFE_FLAGS_WITH_ARG.has(token)) {
      const arg = tokens[i + 1];
      if (arg === undefined) {
        return null;
      }
      if (token === "-X" || token === "--request") {
        const method = arg.toUpperCase();
        if (method !== "GET" && method !== "HEAD") {
          return null;
        }
      }
      i += 1;
      continue;
    }
    // Expand clustered short flags: -sS, -sSL, -sSfL, etc.
    if (/^-[a-zA-Z]{2,}$/.test(token) && !token.startsWith("--")) {
      const letters = token.slice(1);
      for (const letter of letters) {
        const short = `-${letter}`;
        if (CURL_SAFE_FLAGS_WITH_ARG.has(short)) {
          // Clustered form cannot attach the required argument reliably → deny.
          return null;
        }
        if (!CURL_SAFE_FLAGS.has(short)) {
          return null;
        }
      }
      continue;
    }
    // Unknown flag (including long options we did not allow) → fail closed.
    if (token.startsWith("-")) {
      return null;
    }
    if (/^https:\/\//i.test(token)) {
      if (url) {
        return null;
      }
      url = token;
      continue;
    }
    if (/^http:\/\//i.test(token)) {
      return null;
    }
    return null;
  }
  return url ?? null;
}

/** Build argv for `logan-wasm-sandbox http ...` (argv[0] is the binary path/name). */
export function buildWasmHttpArgv(params: {
  bin: string;
  allowlist: string;
  url: string;
  timeoutSecs: number;
  maxBytes: number;
}): string[] {
  return [
    params.bin,
    "http",
    "--allowlist",
    params.allowlist,
    "--url",
    params.url,
    "--timeout-secs",
    String(params.timeoutSecs),
    "--max-bytes",
    String(params.maxBytes),
  ];
}

function denyGeneralShell(detail: string): never {
  throw new Error(
    `Wasm sandbox does not allow general shell execution (${detail}). ` +
      "Only curl-shaped HTTPS GET/HEAD commands are mediated via logan-wasm-sandbox. " +
      "Use docker or ssh backend for full shell.",
  );
}

/** Walk up from this module toward repo roots; return absolute path when candidate exists. */
function resolveRepoRelativePath(...segments: string[]): string | null {
  let dir = path.dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 8; i += 1) {
    const candidate = path.join(dir, ...segments);
    if (fs.existsSync(candidate)) {
      return candidate;
    }
    const parent = path.dirname(dir);
    if (parent === dir) {
      break;
    }
    dir = parent;
  }
  return null;
}

function resolveRepoRelativeWasmBin(): string | null {
  const exeName = process.platform === "win32" ? "logan-wasm-sandbox.exe" : "logan-wasm-sandbox";
  return resolveRepoRelativePath("tools", "logan-wasm-sandbox", "target", "release", exeName);
}

function resolveRepoRelativeAllowlist(): string | null {
  return resolveRepoRelativePath("security", "proxy", "allowed-domains.txt");
}

/**
 * Resolve binary path.
 * - Explicit absolute/relative path (not the bare default name) is used as-is.
 * - Bare default / empty → prefer repo tools release build, else PATH name.
 */
export function resolveWasmSandboxBin(configured?: string): string {
  const trimmed = configured?.trim();
  if (trimmed && trimmed !== DEFAULT_WASM_SANDBOX_BIN) {
    return trimmed;
  }
  return resolveRepoRelativeWasmBin() ?? DEFAULT_WASM_SANDBOX_BIN;
}

/**
 * Resolve allowlist path for CLI argv.
 * - Absolute configured path is used as-is.
 * - Default relative path (`security/proxy/allowed-domains.txt`) is resolved to an absolute
 *   path via the same repo-root walk used for the release binary (when the file exists).
 * - Other relative configured paths are used as-is.
 */
export function resolveWasmSandboxAllowlist(configured?: string): string {
  const trimmed = configured?.trim();
  if (trimmed && path.isAbsolute(trimmed)) {
    return trimmed;
  }
  const isDefault =
    !trimmed ||
    trimmed === DEFAULT_WASM_SANDBOX_ALLOWLIST ||
    trimmed.replaceAll("\\", "/") === DEFAULT_WASM_SANDBOX_ALLOWLIST;
  if (isDefault) {
    return resolveRepoRelativeAllowlist() ?? DEFAULT_WASM_SANDBOX_ALLOWLIST;
  }
  return trimmed;
}

/** Apply defaults for wasm sandbox settings (Task 1 config + Task 2 runtime). */
export function resolveWasmSandboxRuntimeConfig(
  wasm?: Partial<SandboxWasmConfig> | null,
): SandboxWasmConfig {
  return {
    bin: resolveWasmSandboxBin(wasm?.bin),
    allowlist: resolveWasmSandboxAllowlist(wasm?.allowlist),
    timeoutSecs: wasm?.timeoutSecs ?? DEFAULT_WASM_SANDBOX_TIMEOUT_SECS,
    maxBytes: wasm?.maxBytes ?? DEFAULT_WASM_SANDBOX_MAX_BYTES,
  };
}

function resolveRuntimeId(scopeKey: string): string {
  const safe = scopeKey.replace(/[^\w.:@-]+/g, "_");
  return `wasm-${safe}`;
}

function buildHttpExecSpec(params: {
  wasm: SandboxWasmConfig;
  url: string;
  env: NodeJS.ProcessEnv;
}): SandboxBackendExecSpec {
  return {
    argv: buildWasmHttpArgv({
      bin: params.wasm.bin,
      allowlist: params.wasm.allowlist,
      url: params.url,
      timeoutSecs: params.wasm.timeoutSecs,
      maxBytes: params.wasm.maxBytes,
    }),
    env: params.env,
    stdinMode: "pipe-closed",
  };
}

function spawnWasmHostCommand(params: {
  argv: string[];
  env: NodeJS.ProcessEnv;
  stdin?: Buffer | string;
  allowFailure?: boolean;
  signal?: AbortSignal;
}): Promise<SandboxBackendCommandResult> {
  const [command, ...args] = params.argv;
  if (!command) {
    return Promise.reject(new Error("Wasm sandbox spawn requires a non-empty argv."));
  }
  return new Promise<SandboxBackendCommandResult>((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ["pipe", "pipe", "pipe"],
      env: params.env,
      windowsHide: true,
    });
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    let aborted = false;
    let outputStreamError: Error | undefined;

    const handleAbort = () => {
      if (aborted) {
        return;
      }
      aborted = true;
      child.kill("SIGTERM");
    };
    if (params.signal) {
      if (params.signal.aborted) {
        handleAbort();
      } else {
        params.signal.addEventListener("abort", handleAbort, { once: true });
      }
    }

    const handleStreamError = (error: Error) => {
      if (outputStreamError) {
        return;
      }
      outputStreamError = error;
      child.kill("SIGTERM");
    };
    child.stdout?.on("error", handleStreamError);
    child.stdout?.on("data", (chunk) => {
      stdoutChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    child.stderr?.on("error", handleStreamError);
    child.stderr?.on("data", (chunk) => {
      stderrChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });

    child.on("error", (error) => {
      if (params.signal) {
        params.signal.removeEventListener("abort", handleAbort);
      }
      if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        (error as NodeJS.ErrnoException).code === "ENOENT"
      ) {
        reject(
          Object.assign(
            new Error(
              `Wasm sandbox requires logan-wasm-sandbox, but "${command}" was not found. ` +
                "Build tools/logan-wasm-sandbox or set agents.defaults.sandbox.wasm.bin.",
            ),
            { code: "INVALID_CONFIG", cause: error },
          ),
        );
        return;
      }
      reject(error);
    });

    child.on("close", (code) => {
      if (params.signal) {
        params.signal.removeEventListener("abort", handleAbort);
      }
      const stdout = Buffer.concat(stdoutChunks);
      const stderr = Buffer.concat(stderrChunks);
      if (aborted || params.signal?.aborted) {
        reject(createAbortError("Aborted"));
        return;
      }
      if (outputStreamError) {
        reject(outputStreamError);
        return;
      }
      const exitCode = code ?? 0;
      if (exitCode !== 0 && !params.allowFailure) {
        const message = stderr.length > 0 ? stderr.toString("utf8").trim() : "";
        reject(
          Object.assign(new Error(message || `logan-wasm-sandbox failed (exit ${exitCode})`), {
            code: exitCode,
            stdout,
            stderr,
          }),
        );
        return;
      }
      resolve({ stdout, stderr, code: exitCode });
    });

    const stdin = child.stdin;
    if (stdin) {
      stdin.on("error", handleStreamError);
      if (params.stdin !== undefined) {
        stdin.end(params.stdin);
      } else {
        stdin.end();
      }
    }
  });
}

/** Lightweight manager: no containers to prune or inspect via Docker. */
export const wasmSandboxBackendManager: SandboxBackendManager = {
  async describeRuntime({ entry }) {
    return {
      running: true,
      actualConfigLabel: entry.image || "wasm",
      configLabelMatch: true,
    };
  },
  async removeRuntime() {
    // Host-process backend: nothing durable to remove.
  },
};

/** Create a wasm sandbox backend handle for one session scope. */
export async function createWasmSandboxBackend(
  params: CreateSandboxBackendParams,
): Promise<SandboxBackendHandle> {
  const wasm = resolveWasmSandboxRuntimeConfig(params.cfg.wasm);
  const workdir = params.workspaceDir;
  const runtimeId = resolveRuntimeId(params.scopeKey);

  return {
    id: "wasm",
    runtimeId,
    runtimeLabel: runtimeId,
    workdir,
    // Wasm handle is host-process mediated; do not inherit docker env policy.
    env: {},
    configLabel: wasm.bin,
    configLabelKind: "Wasm",
    workdirValidation: "host",
    capabilities: {
      browser: false,
    },
    async buildExecSpec({ command, env }) {
      const url = tryParseCurlHttpsUrl(command);
      if (!url) {
        denyGeneralShell(command.length > 120 ? `${command.slice(0, 120)}…` : command);
      }
      return buildHttpExecSpec({
        wasm,
        url,
        env: { ...process.env, ...env },
      });
    },
    async runShellCommand(command: SandboxBackendCommandParams): Promise<SandboxBackendCommandResult> {
      // Fs-bridge and probes pass shell scripts; only curl-shaped scripts are allowed.
      const url = tryParseCurlHttpsUrl(command.script);
      if (!url) {
        denyGeneralShell(
          command.script.length > 120 ? `${command.script.slice(0, 120)}…` : command.script,
        );
      }
      const argv = buildWasmHttpArgv({
        bin: wasm.bin,
        allowlist: wasm.allowlist,
        url,
        timeoutSecs: wasm.timeoutSecs,
        maxBytes: wasm.maxBytes,
      });
      return await spawnWasmHostCommand({
        argv,
        env: process.env,
        stdin: command.stdin,
        allowFailure: command.allowFailure,
        signal: command.signal,
      });
    },
    createFsBridge: ({ sandbox }) =>
      // Host workspace mapping: container workdir == host workdir for path guards.
      // Mutation plans still call runShellCommand and fail closed (no general shell).
      // Reads use host fd open via path safety. Full host-fs mutations are a later task.
      createSandboxFsBridge({
        sandbox: {
          ...sandbox,
          containerWorkdir: workdir,
        },
      }),
  };
}
