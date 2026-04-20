import {
  CapSet,
  Capability,
  createHttpTransport,
  derivePasswordKeys,
  domainSetOf,
  openSession,
  parseBlueprint,
  plan,
} from "@dancesWithClaws/yubihsm";
import { createSimulator, createStore, storeBackedHandler } from "@dancesWithClaws/yubihsm-sim";
import { Command } from "commander";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const logs: string[] = [];
  const runtime = {
    log: vi.fn((...args: unknown[]) => {
      logs.push(args.map(String).join(" "));
    }),
    error: vi.fn(),
    writeStdout: vi.fn((value: string) => {
      runtime.log(value.endsWith("\n") ? value.slice(0, -1) : value);
    }),
    writeJson: vi.fn((value: unknown, space = 2) => {
      runtime.log(JSON.stringify(value, null, space > 0 ? space : undefined));
    }),
    exit: vi.fn((code: number) => {
      throw new Error(`__exit__:${code}`);
    }),
  };
  return { runtime, logs };
});

vi.mock("../runtime.js", () => ({
  defaultRuntime: mocks.runtime,
}));

const { registerHsmCli, bootstrapDevice, BootstrapAbortedError } = await import("./hsm-cli.js");

function createProgram(): Command {
  const program = new Command();
  program.exitOverride();
  registerHsmCli(program);
  return program;
}

const TEST_BLUEPRINT_YAML = `version: 1
device:
  min_firmware: "2.4.0"
domains:
  1: { label: "core", purpose: "signing" }
  2: { label: "plugins", purpose: "wrap" }
auth_keys:
  - id: 2
    role: admin
    domains: [1, 2]
    capabilities:
      [generate-asymmetric-key, put-authentication-key, delete-asymmetric-key]
    delegated_capabilities: [sign-ecdsa, wrap-data, unwrap-data]
    credential_ref: cred:TeeVault-YubiHSM-Admin
  - id: 10
    role: gateway-signer
    domains: [1]
    capabilities: [sign-ecdsa]
    credential_ref: cred:TeeVault-YubiHSM-SSHSigner
wrap_keys: []
policies:
  audit: { drain_every: "30s", permanent_force_audit: true }
  sessions: { pool_size: 4, idle_timeout: "60s" }
`;

function writeBlueprint(dir: string): string {
  const path = join(dir, "blueprint.yaml");
  writeFileSync(path, TEST_BLUEPRINT_YAML);
  return path;
}

function freshFactoryStore(): ReturnType<typeof createStore> {
  const store = createStore();
  // factoryReset seeds id=1 with PBKDF2-derived "password" keys and full
  // capabilities — the same state a freshly manufactured device ships in.
  store.factoryReset();
  return store;
}

interface Harness {
  readonly store: ReturnType<typeof createStore>;
  readonly sim: ReturnType<typeof createSimulator>;
  readonly port: number;
  readonly url: string;
  stop(): Promise<void>;
}

async function startHarness(store: ReturnType<typeof createStore>): Promise<Harness> {
  const sim = createSimulator(storeBackedHandler(store));
  const port = await sim.start();
  return {
    store,
    sim,
    port,
    url: `http://127.0.0.1:${port}`,
    async stop() {
      await sim.stop();
    },
  };
}

describe("openclaw hsm bootstrap", () => {
  let tempHome: string;
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "hsm-bootstrap-"));
    tempHome = mkdtempSync(join(tmpdir(), "hsm-home-"));
    // Upstream's shared test setup enables `unstubEnvs: true` in vitest config,
    // which auto-restores any `vi.stubEnv`-tracked vars between tests. Using
    // stubEnv keeps our per-test home override within that tracked lifecycle
    // and composes cleanly with the shared tempHome from setup.shared.ts.
    vi.stubEnv("HOME", tempHome);
    vi.stubEnv("USERPROFILE", tempHome);
    mocks.logs.length = 0;
    mocks.runtime.log.mockClear();
    mocks.runtime.writeJson.mockClear();
    mocks.runtime.exit.mockClear();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("rotates the factory admin, persists keys, applies blueprint, and diff converges", async () => {
    const h = await startHarness(freshFactoryStore());
    try {
      const blueprintPath = writeBlueprint(tempDir);
      const credsPath = join(tempDir, "creds.json");
      const program = createProgram();
      await program.parseAsync([
        "node",
        "test",
        "hsm",
        "bootstrap",
        "--blueprint",
        blueprintPath,
        "--connector",
        h.url,
        "--creds-file",
        credsPath,
      ]);

      // Factory admin keys must no longer authenticate.
      const factory = derivePasswordKeys("password");
      const rotatedAdmin = h.store.getAuthKey(1);
      expect(rotatedAdmin).toBeDefined();
      expect(Buffer.from(rotatedAdmin!.encKey).equals(Buffer.from(factory.encKey))).toBe(false);
      expect(Buffer.from(rotatedAdmin!.macKey).equals(Buffer.from(factory.macKey))).toBe(false);

      // Blueprint auth keys are on the device.
      expect(h.store.getAuthKey(2)).toBeDefined();
      expect(h.store.getAuthKey(10)).toBeDefined();

      // Creds file contains a 64-char hex admin entry.
      expect(existsSync(credsPath)).toBe(true);
      const creds = JSON.parse(readFileSync(credsPath, "utf-8")) as Record<
        string,
        { enc: string; mac: string }
      >;
      const adminEntry = creds["TeeVault-YubiHSM-Admin"];
      if (!adminEntry) {
        throw new Error("expected creds file to contain a TeeVault-YubiHSM-Admin entry");
      }
      expect(adminEntry.enc).toMatch(/^[0-9a-f]{32}$/);
      expect(adminEntry.mac).toMatch(/^[0-9a-f]{32}$/);
      const combined = adminEntry.enc + adminEntry.mac;
      expect(combined).toHaveLength(64);

      // Fresh session with the new keys works and diff is empty.
      const transport = createHttpTransport({ url: h.url });
      try {
        const parse = (hex: string): Uint8Array => {
          const out = new Uint8Array(16);
          for (let i = 0; i < 16; i++) {
            out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
          }
          return out;
        };
        const session = await openSession({
          transport,
          authKeyId: 1,
          authEnc: parse(adminEntry.enc),
          authMac: parse(adminEntry.mac),
        });
        try {
          const bp = parseBlueprint(TEST_BLUEPRINT_YAML);
          const p = await plan(session, bp, { preserveAuthKeyIds: [1] });
          expect(p.create).toHaveLength(0);
          expect(p.update).toHaveLength(0);
          expect(p.delete).toHaveLength(0);
        } finally {
          await session.close();
        }
      } finally {
        await transport.close();
      }
    } finally {
      await h.stop();
    }
  });

  it("skips rotation when the device is already bootstrapped", async () => {
    // Simulate an already-rotated device: replace the factory admin with
    // pre-known non-factory keys, and seed the creds file with the same keys
    // so the resolver chain can open the post-rotation session.
    const store = createStore();
    const preRotatedEnc = new Uint8Array(16).fill(0x7a);
    const preRotatedMac = new Uint8Array(16).fill(0x7b);
    store.putAuthKey({
      id: 1,
      capabilities: CapSet.of(
        Capability.PutAuthenticationKey,
        Capability.GenerateAsymmetricKey,
        Capability.DeleteAuthenticationKey,
        Capability.DeleteAsymmetricKey,
      ),
      delegatedCapabilities: CapSet.of(
        Capability.SignEcdsa,
        Capability.WrapData,
        Capability.UnwrapData,
      ),
      domains: domainSetOf(1, 2, 3, 4, 5, 6, 7, 8),
      label: "admin",
      encKey: preRotatedEnc,
      macKey: preRotatedMac,
    });
    const h = await startHarness(store);
    try {
      const blueprintPath = writeBlueprint(tempDir);
      const credsPath = join(tempDir, "creds.json");
      const encHex = Buffer.from(preRotatedEnc).toString("hex");
      const macHex = Buffer.from(preRotatedMac).toString("hex");
      writeFileSync(
        credsPath,
        JSON.stringify({
          "TeeVault-YubiHSM-Admin": { enc: encHex, mac: macHex },
        }),
      );

      const result = await bootstrapDevice({
        blueprint: blueprintPath,
        connector: h.url,
        credsFile: credsPath,
      });

      expect(result.rotated).toBe(false);
      // The stored admin keys are unchanged.
      const admin = h.store.getAuthKey(1);
      expect(Buffer.from(admin!.encKey).equals(Buffer.from(preRotatedEnc))).toBe(true);
      expect(Buffer.from(admin!.macKey).equals(Buffer.from(preRotatedMac))).toBe(true);
      // Blueprint is still applied.
      expect(h.store.getAuthKey(2)).toBeDefined();
      expect(h.store.getAuthKey(10)).toBeDefined();
    } finally {
      await h.stop();
    }
  });

  it("is idempotent: a second bootstrap run produces zero changes on diff", async () => {
    const h = await startHarness(freshFactoryStore());
    try {
      const blueprintPath = writeBlueprint(tempDir);
      const credsPath = join(tempDir, "creds.json");

      const first = await bootstrapDevice({
        blueprint: blueprintPath,
        connector: h.url,
        credsFile: credsPath,
      });
      expect(first.rotated).toBe(true);

      // Re-run with the same args. The resolver reads the just-written keys;
      // the factory password no longer works, so rotation is skipped and the
      // blueprint is already satisfied.
      const second = await bootstrapDevice({
        blueprint: blueprintPath,
        connector: h.url,
        credsFile: credsPath,
      });
      expect(second.rotated).toBe(false);
      expect(second.applied.create).toHaveLength(0);
      expect(second.applied.update).toHaveLength(0);
      expect(second.applied.delete).toHaveLength(0);
    } finally {
      await h.stop();
    }
  });

  it("recovers from a HALF_APPLIED marker when resolver has the keys", async () => {
    // Seed: device already has a rotated admin; creds file carries the same
    // keys; a stale HALF_APPLIED marker is left behind from a prior crash.
    const store = createStore();
    const rotatedEnc = new Uint8Array(16).fill(0x5e);
    const rotatedMac = new Uint8Array(16).fill(0x5f);
    store.putAuthKey({
      id: 1,
      capabilities: CapSet.of(
        Capability.PutAuthenticationKey,
        Capability.GenerateAsymmetricKey,
        Capability.DeleteAuthenticationKey,
        Capability.DeleteAsymmetricKey,
      ),
      delegatedCapabilities: CapSet.of(
        Capability.SignEcdsa,
        Capability.WrapData,
        Capability.UnwrapData,
      ),
      domains: domainSetOf(1, 2),
      label: "admin",
      encKey: rotatedEnc,
      macKey: rotatedMac,
    });
    const h = await startHarness(store);
    try {
      const blueprintPath = writeBlueprint(tempDir);
      const credsPath = join(tempDir, "creds.json");
      writeFileSync(
        credsPath,
        JSON.stringify({
          "TeeVault-YubiHSM-Admin": {
            enc: Buffer.from(rotatedEnc).toString("hex"),
            mac: Buffer.from(rotatedMac).toString("hex"),
          },
        }),
      );
      // Drop a HALF_APPLIED marker (simulator's device serial is 0x12345678).
      const markerDir = join(tempHome, ".openclaw");
      mkdirSync(markerDir, { recursive: true });
      writeFileSync(
        join(markerDir, `hsm-bootstrap.${0x12345678}.json`),
        JSON.stringify({ stage: "rotating-admin", startedAt: "2026-04-20T00:00:00Z" }),
      );

      const result = await bootstrapDevice({
        blueprint: blueprintPath,
        connector: h.url,
        credsFile: credsPath,
      });

      expect(result.recovered).toBe(true);
      expect(result.rotated).toBe(false);
      // Blueprint applied cleanly via the recovered session.
      expect(h.store.getAuthKey(2)).toBeDefined();
      expect(h.store.getAuthKey(10)).toBeDefined();
    } finally {
      await h.stop();
    }
  });

  it("leaves HALF_APPLIED marker and throws BootstrapAbortedError when PUT_AUTHENTICATION_KEY fails mid-rotation", async () => {
    // Simulate a storage failure inside the device's PUT_AUTHENTICATION_KEY
    // handler — e.g. storage full, transient firmware error — AFTER the
    // factory admin has been deleted. Bootstrap has already persisted the
    // new admin keys to disk and dropped a HALF_APPLIED marker, so this
    // must surface a BootstrapAbortedError (not a bare Error) and leave
    // the marker in place for the operator to recover from.
    const store = freshFactoryStore();
    const wrapped: typeof store = {
      ...store,
      putAuthKey(spec) {
        // factoryReset() seeds id=1 by mutating the internal map directly,
        // so we never see it here. The first putAuthKey call we intercept
        // is bootstrap's rotation put (id=1 with new random keys). Reject
        // it to mimic a device-side storage fault.
        if (spec.id === 1) {
          throw new Error("STORAGE_FULL");
        }
        return store.putAuthKey(spec);
      },
    };
    const h = await startHarness(wrapped);
    try {
      const blueprintPath = writeBlueprint(tempDir);
      const credsPath = join(tempDir, "creds.json");
      await expect(
        bootstrapDevice({
          blueprint: blueprintPath,
          connector: h.url,
          credsFile: credsPath,
        }),
      ).rejects.toBeInstanceOf(BootstrapAbortedError);

      // The device serial exposed by the simulator is 0x12345678; marker
      // path is ~/.openclaw/hsm-bootstrap.<serial>.json. tempHome above
      // overrides homedir() so the marker lands there.
      const markerPath = join(tempHome, ".openclaw", `hsm-bootstrap.${0x12345678}.json`);
      expect(existsSync(markerPath)).toBe(true);
      const markerBody = JSON.parse(readFileSync(markerPath, "utf-8")) as Record<string, unknown>;
      expect(markerBody["stage"]).toBe("rotating-admin");
      expect(typeof markerBody["startedAt"]).toBe("string");
    } finally {
      await h.stop();
    }
  });

  it("throws BootstrapAbortedError when recovery has no resolver keys", async () => {
    // Device is already rotated; creds file and cred-mgr are empty; a marker
    // is present. Bootstrap can't recover the admin → aborts.
    const store = createStore();
    store.putAuthKey({
      id: 1,
      capabilities: CapSet.of(Capability.PutAuthenticationKey),
      delegatedCapabilities: CapSet.empty(),
      domains: domainSetOf(1),
      label: "admin",
      encKey: new Uint8Array(16).fill(0xab),
      macKey: new Uint8Array(16).fill(0xcd),
    });
    const h = await startHarness(store);
    try {
      const blueprintPath = writeBlueprint(tempDir);
      const credsPath = join(tempDir, "creds.json");
      // Empty creds file — resolver has nothing to offer.
      writeFileSync(credsPath, JSON.stringify({}));
      const markerDir = join(tempHome, ".openclaw");
      mkdirSync(markerDir, { recursive: true });
      writeFileSync(
        join(markerDir, `hsm-bootstrap.${0x12345678}.json`),
        JSON.stringify({ stage: "rotating-admin" }),
      );

      await expect(
        bootstrapDevice({
          blueprint: blueprintPath,
          connector: h.url,
          credsFile: credsPath,
        }),
      ).rejects.toBeInstanceOf(BootstrapAbortedError);
    } finally {
      await h.stop();
    }
  });
});
