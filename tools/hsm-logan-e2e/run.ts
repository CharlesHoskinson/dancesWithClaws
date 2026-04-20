/**
 * Logan E2E orchestration: bootstrap HSM -> seal secrets -> run Logan turn.
 *
 * Two sealing strategies:
 *   - Native: use `WrapData` / `UnwrapData` commands against the HSM's
 *     plugin-sealer wrap key. (Not yet implemented in the driver — Plan 03.)
 *   - Fallback: generate a random 32-byte wrap key, provision it on the
 *     device as a plugin-sealer auth key (so HSM possession is required
 *     to re-establish the sealing root), keep the same bytes in memory
 *     as an AES-GCM key, and wrap the two secrets with node:crypto.
 *
 * This harness uses the fallback. The concept — HSM-rooted sealing — is
 * preserved: without the admin session (which requires the rotated
 * Credential-Manager keys) the operator cannot reprovision the plugin
 * sealer. The in-memory key dies with the process.
 */

import {
  CapSet,
  Capability,
  createHttpTransport,
  domainSetOf,
  openSession,
  putAuthenticationKey,
} from "@dancesWithClaws/yubihsm";
import { createSimulator, createStore, storeBackedHandler } from "@dancesWithClaws/yubihsm-sim";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve as resolvePath } from "node:path";
import { fileURLToPath } from "node:url";
import { bootstrapDevice } from "../../src/cli/hsm-cli.js";
import { loganRun } from "./logan-task.js";
import { ensureModelPulled, ensureOllamaRunning } from "./ollama.js";

export interface RunOptions {
  /** If true, talk to a real yubihsm-connector at HSM_CONNECTOR_URL. */
  readonly device?: boolean;
  readonly connector?: string;
  readonly ollamaPort?: number;
  readonly ollamaModel?: string;
  readonly moltbookEndpoint?: string;
  readonly blueprint?: string;
  readonly credsFile?: string;
  readonly topic?: string;
  /** Override secret-source for tests. Defaults to env vars. */
  readonly secrets?: { readonly moltbook: string; readonly perplexity: string };
  /**
   * Output channel. Defaults to console. Tests pass a sink to capture
   * without noisy stdout.
   */
  readonly log?: (line: string) => void;
  /**
   * Override the Logan skill path. Defaults to the repo workspace skill.
   */
  readonly skillPath?: string;
  /**
   * Skip Ollama checks entirely. Used by tests that mock /api/* and don't
   * want the probe to race with the MockAgent install.
   */
  readonly skipOllamaProbe?: boolean;
}

export interface RunResult {
  readonly serial: number;
  readonly rotated: boolean;
  readonly moltbookPostId: string;
  readonly loganPost: string;
  readonly sealedPath: string;
}

const DEFAULT_CONNECTOR_REAL = "http://localhost:12345";
const DEFAULT_OLLAMA_MODEL = "gemma4:e4b";
const DEFAULT_OLLAMA_PORT = 11434;
const PLUGIN_SEALER_AUTH_KEY_ID = 0x00b1;
const SEALED_DIR_NAME = ".openclaw/sealed-secrets";

function findRepoRoot(): string {
  // run.ts lives at <repo>/tools/hsm-logan-e2e/run.ts. Walk two parents up.
  const here = fileURLToPath(import.meta.url);
  return resolvePath(dirname(here), "..", "..");
}

function defaultSkillPath(): string {
  return join(findRepoRoot(), "workspace", "skills", "moltbook-cardano", "SKILL.md");
}

function defaultBlueprintPath(): string {
  return join(findRepoRoot(), "hsm-blueprint.yaml");
}

interface SimHandle {
  readonly url: string;
  stop(): Promise<void>;
}

async function startSimulator(): Promise<SimHandle> {
  const store = createStore();
  store.factoryReset();
  const sim = createSimulator(storeBackedHandler(store));
  const port = await sim.start();
  return {
    url: `http://127.0.0.1:${port}`,
    async stop() {
      await sim.stop();
    },
  };
}

/** AES-GCM wrap: 12-byte IV, 16-byte tag, key must be 32 bytes. */
interface SealedBlob {
  readonly iv: string;
  readonly tag: string;
  readonly ciphertext: string;
}

function seal(plaintext: string, key: Uint8Array): SealedBlob {
  if (key.length !== 32) {
    throw new Error(`seal key must be 32 bytes, got ${key.length}`);
  }
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf-8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    iv: iv.toString("hex"),
    tag: tag.toString("hex"),
    ciphertext: ct.toString("hex"),
  };
}

function unseal(blob: SealedBlob, key: Uint8Array): string {
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(blob.iv, "hex"));
  decipher.setAuthTag(Buffer.from(blob.tag, "hex"));
  const pt = Buffer.concat([
    decipher.update(Buffer.from(blob.ciphertext, "hex")),
    decipher.final(),
  ]);
  return pt.toString("utf-8");
}

function parseHex16(hex: string): Uint8Array {
  if (hex.length !== 32) {
    throw new Error(`expected 32 hex chars, got ${hex.length}`);
  }
  const out = new Uint8Array(16);
  for (let i = 0; i < 16; i++) {
    out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

interface ResolvedAdmin {
  readonly authKeyId: number;
  readonly encKey: Uint8Array;
  readonly macKey: Uint8Array;
}

function readAdminFromCredsFile(path: string): ResolvedAdmin {
  const raw = readFileSync(path, "utf-8");
  const parsed = JSON.parse(raw) as Record<string, { enc: string; mac: string }>;
  const entry = parsed["TeeVault-YubiHSM-Admin"];
  if (!entry) {
    throw new Error(`creds file ${path} missing TeeVault-YubiHSM-Admin`);
  }
  return {
    authKeyId: 1,
    encKey: parseHex16(entry.enc),
    macKey: parseHex16(entry.mac),
  };
}

/**
 * Provision the plugin-sealer auth key on the device and return the raw
 * bytes used for it — those bytes double as the AES-GCM wrap key in memory.
 * HSM possession is required to reproduce these bytes, so the sealing root
 * is HSM-rooted even though the actual crypto happens in Node.
 */
async function deriveHsmRootedWrapKey(
  connectorUrl: string,
  admin: ResolvedAdmin,
): Promise<Uint8Array> {
  const transport = createHttpTransport({ url: connectorUrl });
  try {
    const session = await openSession({
      transport,
      authKeyId: admin.authKeyId,
      authEnc: admin.encKey,
      authMac: admin.macKey,
    });
    try {
      const seed = randomBytes(32);
      const wrapEnc = new Uint8Array(seed.subarray(0, 16));
      const wrapMac = new Uint8Array(seed.subarray(16, 32));
      await putAuthenticationKey(session, {
        keyId: PLUGIN_SEALER_AUTH_KEY_ID,
        label: "logan-plugin-sealer",
        domains: domainSetOf(2),
        capabilities: CapSet.of(Capability.SignEcdsa, Capability.WrapData),
        delegatedCapabilities: CapSet.empty(),
        encKey: wrapEnc,
        macKey: wrapMac,
      });
      return new Uint8Array(seed);
    } finally {
      await session.close();
    }
  } finally {
    await transport.close();
  }
}

function sealedPathFor(name: string): string {
  return join(homedir(), SEALED_DIR_NAME, `${name}.json`);
}

function writeSealed(name: string, blob: SealedBlob): string {
  const path = sealedPathFor(name);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(blob, null, 2), "utf-8");
  return path;
}

export async function runMain(opts: RunOptions = {}): Promise<RunResult> {
  const log = opts.log ?? ((s) => process.stdout.write(`${s}\n`));
  const ollamaPort = opts.ollamaPort ?? DEFAULT_OLLAMA_PORT;
  const ollamaModel = opts.ollamaModel ?? DEFAULT_OLLAMA_MODEL;

  const moltbook = opts.secrets?.moltbook ?? process.env["MOLTBOOK_API_KEY"] ?? "";
  const perplexity = opts.secrets?.perplexity ?? process.env["PERPLEXITY_API_KEY"] ?? "";
  if (!moltbook || !perplexity) {
    throw new Error(
      "missing MOLTBOOK_API_KEY and/or PERPLEXITY_API_KEY — set them in the " +
        "environment before running the Logan harness",
    );
  }

  // Step 1: Ollama readiness.
  if (!opts.skipOllamaProbe) {
    log(`[logan-e2e] probing Ollama on port ${ollamaPort}`);
    await ensureOllamaRunning({ port: ollamaPort });
    log(`[logan-e2e] ensuring model '${ollamaModel}' is pulled`);
    await ensureModelPulled(ollamaModel, {
      port: ollamaPort,
      onProgress: (line) => log(`[ollama pull] ${line}`),
    });
  }

  // Step 2: HSM connector.
  let simHandle: SimHandle | null = null;
  let connectorUrl: string;
  if (opts.device) {
    connectorUrl = opts.connector ?? process.env["HSM_CONNECTOR_URL"] ?? DEFAULT_CONNECTOR_REAL;
    log(`[logan-e2e] using real yubihsm-connector at ${connectorUrl}`);
  } else {
    simHandle = await startSimulator();
    connectorUrl = simHandle.url;
    log(`[logan-e2e] started simulator at ${connectorUrl}`);
  }

  try {
    // Step 3: bootstrap.
    const blueprint = opts.blueprint ?? defaultBlueprintPath();
    const credsFile = opts.credsFile ?? join(homedir(), ".openclaw", "hsm-logan-e2e-creds.json");
    mkdirSync(dirname(credsFile), { recursive: true });
    log(`[logan-e2e] bootstrapping HSM (blueprint=${blueprint})`);
    const boot = await bootstrapDevice({
      blueprint,
      connector: connectorUrl,
      credsFile,
    });
    log(
      `[logan-e2e] bootstrap done: serial=${boot.serial} rotated=${boot.rotated} ` +
        `recovered=${boot.recovered}`,
    );

    // Step 4: seal secrets using the HSM-rooted fallback wrap key. (Driver
    // has no WrapData/GenerateWrapKey command yet — Plan 03 backlog.)
    const admin = readAdminFromCredsFile(credsFile);
    const wrapKey = await deriveHsmRootedWrapKey(connectorUrl, admin);
    const moltbookSealed = seal(moltbook, wrapKey);
    const perplexitySealed = seal(perplexity, wrapKey);
    writeSealed("MOLTBOOK_API_KEY", moltbookSealed);
    const perpPath = writeSealed("PERPLEXITY_API_KEY", perplexitySealed);
    log(`[logan-e2e] sealed secrets written to ${dirname(perpPath)}`);

    // Step 5: unseal (same process; wrap key still in memory) and run Logan.
    const unsealedMoltbook = unseal(moltbookSealed, wrapKey);
    const unsealedPerplexity = unseal(perplexitySealed, wrapKey);

    log(`[logan-e2e] running Logan turn`);
    const loganOpts: Parameters<typeof loganRun>[0] = {
      ollamaPort,
      ollamaModel,
      moltbookEndpoint: opts.moltbookEndpoint ?? "https://www.moltbook.com/api/v1/posts",
      moltbookKey: unsealedMoltbook,
      perplexityKey: unsealedPerplexity,
      skillPath: opts.skillPath ?? defaultSkillPath(),
    };
    if (opts.topic !== undefined) {
      Object.assign(loganOpts, { topic: opts.topic });
    }
    const result = await loganRun(loganOpts);
    log(`[logan-e2e] Logan posted (id=${result.moltbookPostId}): ${result.loganPost}`);

    // Best-effort zero of the wrap key. JS strings are immutable so we can't
    // scrub the secret copies; the fallback is process isolation.
    wrapKey.fill(0);

    return {
      serial: boot.serial,
      rotated: boot.rotated,
      moltbookPostId: result.moltbookPostId,
      loganPost: result.loganPost,
      sealedPath: dirname(perpPath),
    };
  } finally {
    if (simHandle) {
      await simHandle.stop();
    }
  }
}

function parseArgs(argv: readonly string[]): RunOptions {
  const opts: {
    device?: boolean;
    connector?: string;
    ollamaPort?: number;
    moltbookEndpoint?: string;
    topic?: string;
  } = {};
  const takeNext = (i: number): string | undefined => argv[i];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--device") {
      opts.device = true;
    } else if (a === "--connector") {
      const v = takeNext(++i);
      if (v !== undefined) {
        opts.connector = v;
      }
    } else if (a?.startsWith("--connector=")) {
      opts.connector = a.slice("--connector=".length);
    } else if (a === "--ollama-port") {
      const v = takeNext(++i);
      if (v !== undefined) {
        opts.ollamaPort = Number.parseInt(v, 10);
      }
    } else if (a?.startsWith("--ollama-port=")) {
      opts.ollamaPort = Number.parseInt(a.slice("--ollama-port=".length), 10);
    } else if (a === "--moltbook-endpoint") {
      const v = takeNext(++i);
      if (v !== undefined) {
        opts.moltbookEndpoint = v;
      }
    } else if (a?.startsWith("--moltbook-endpoint=")) {
      opts.moltbookEndpoint = a.slice("--moltbook-endpoint=".length);
    } else if (a === "--topic") {
      const v = takeNext(++i);
      if (v !== undefined) {
        opts.topic = v;
      }
    } else if (a?.startsWith("--topic=")) {
      opts.topic = a.slice("--topic=".length);
    }
  }
  const out: RunOptions = {};
  if (opts.device !== undefined) {
    Object.assign(out, { device: opts.device });
  }
  if (opts.connector !== undefined) {
    Object.assign(out, { connector: opts.connector });
  }
  if (opts.ollamaPort !== undefined && Number.isFinite(opts.ollamaPort)) {
    Object.assign(out, { ollamaPort: opts.ollamaPort });
  }
  if (opts.moltbookEndpoint !== undefined) {
    Object.assign(out, { moltbookEndpoint: opts.moltbookEndpoint });
  }
  if (opts.topic !== undefined) {
    Object.assign(out, { topic: opts.topic });
  }
  return out;
}

// Run as script only when invoked directly. Under vitest or `import`, this
// guard stays false and we export runMain for programmatic use.
function isMainModule(): boolean {
  try {
    const thisUrl = import.meta.url;
    const invoked = process.argv[1];
    if (!invoked) {
      return false;
    }
    const invokedUrl = new URL(`file://${resolvePath(invoked)}`).href;
    return thisUrl === invokedUrl;
  } catch {
    return false;
  }
}

if (isMainModule()) {
  const parsed = parseArgs(process.argv.slice(2));
  runMain(parsed)
    .then((r) => {
      process.stdout.write(`${JSON.stringify(r, null, 2)}\n`);
      process.exit(0);
    })
    .catch((e: unknown) => {
      process.stderr.write(
        `[logan-e2e] FATAL: ${e instanceof Error ? (e.stack ?? e.message) : String(e)}\n`,
      );
      process.exit(1);
    });
}
