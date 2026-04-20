import { CapSet, Capability, domainSetOf } from "@dancesWithClaws/yubihsm";
import { createSimulator, createStore, storeBackedHandler } from "@dancesWithClaws/yubihsm-sim";
import { Command } from "commander";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

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

const { registerHsmCli } = await import("./hsm-cli.js");

const ADMIN_ENC_HEX = "40".repeat(16);
const ADMIN_MAC_HEX = "41".repeat(16);

function createProgram(): Command {
  const program = new Command();
  program.exitOverride();
  registerHsmCli(program);
  return program;
}

function writeBlueprint(): string {
  const dir = mkdtempSync(join(tmpdir(), "hsm-cli-test-"));
  const path = join(dir, "blueprint.yaml");
  writeFileSync(
    path,
    `version: 1
device: { min_firmware: "2.4.0" }
domains: { 1: { label: "core", purpose: "signing" } }
auth_keys:
  - id: 2
    role: admin
    domains: [1]
    capabilities: [sign-ecdsa]
    credential_ref: cred:test
wrap_keys: []
policies:
  audit: { drain_every: "30s", permanent_force_audit: true }
  sessions: { pool_size: 4, idle_timeout: "60s" }
`,
  );
  return path;
}

function seedBootstrap(store: ReturnType<typeof createStore>): void {
  store.putAuthKey({
    id: 1,
    capabilities: CapSet.of(
      Capability.PutAuthenticationKey,
      Capability.GenerateAsymmetricKey,
      Capability.DeleteAuthenticationKey,
    ),
    delegatedCapabilities: CapSet.of(Capability.PutAuthenticationKey, Capability.SignEcdsa),
    domains: domainSetOf(1),
    label: "bootstrap",
    encKey: new Uint8Array(16).fill(0x40),
    macKey: new Uint8Array(16).fill(0x41),
  });
}

describe("openclaw hsm CLI", () => {
  beforeEach(() => {
    mocks.logs.length = 0;
    mocks.runtime.log.mockClear();
    mocks.runtime.writeJson.mockClear();
    mocks.runtime.exit.mockClear();
  });

  it("plan reports a create step for the admin auth key", async () => {
    const store = createStore();
    seedBootstrap(store);
    const sim = createSimulator(storeBackedHandler(store));
    const port = await sim.start();
    try {
      const blueprintPath = writeBlueprint();
      const program = createProgram();
      await program.parseAsync([
        "node",
        "test",
        "hsm",
        "plan",
        "--blueprint",
        blueprintPath,
        "--connector",
        `http://127.0.0.1:${port}`,
        "--admin-id",
        "1",
        "--admin-enc",
        ADMIN_ENC_HEX,
        "--admin-mac",
        ADMIN_MAC_HEX,
      ]);
      expect(mocks.runtime.writeJson).toHaveBeenCalledTimes(1);
      const arg = mocks.runtime.writeJson.mock.calls[0][0] as ReturnType<typeof JSON.parse>;
      expect(arg.create).toHaveLength(1);
      expect(arg.create[0].id).toBe(2);
      expect(store.getAuthKey(2)).toBeUndefined();
    } finally {
      await sim.stop();
    }
  });

  it("apply mutates the device, then diff returns empty", async () => {
    const store = createStore();
    seedBootstrap(store);
    const sim = createSimulator(storeBackedHandler(store));
    const port = await sim.start();
    try {
      const blueprintPath = writeBlueprint();
      const args = [
        "node",
        "test",
        "hsm",
        "apply",
        "--blueprint",
        blueprintPath,
        "--connector",
        `http://127.0.0.1:${port}`,
        "--admin-id",
        "1",
        "--admin-enc",
        ADMIN_ENC_HEX,
        "--admin-mac",
        ADMIN_MAC_HEX,
      ];
      await createProgram().parseAsync(args);
      expect(store.getAuthKey(2)).toBeDefined();

      mocks.runtime.writeJson.mockClear();
      const diffArgs = [...args];
      diffArgs[3] = "diff";
      await createProgram().parseAsync(diffArgs);
      const diffReport = mocks.runtime.writeJson.mock.calls[0][0] as ReturnType<typeof JSON.parse>;
      expect(diffReport.create).toHaveLength(0);
      expect(diffReport.delete).toHaveLength(0);
      expect(mocks.runtime.exit).not.toHaveBeenCalled();
    } finally {
      await sim.stop();
    }
  });

  it("diff exits 1 when drift is present", async () => {
    const store = createStore();
    seedBootstrap(store);
    store.putAuthKey({
      id: 99,
      capabilities: CapSet.empty(),
      delegatedCapabilities: CapSet.empty(),
      domains: domainSetOf(1),
      label: "drift",
      encKey: new Uint8Array(16).fill(0xee),
      macKey: new Uint8Array(16).fill(0xef),
    });
    const sim = createSimulator(storeBackedHandler(store));
    const port = await sim.start();
    try {
      const blueprintPath = writeBlueprint();
      const args = [
        "node",
        "test",
        "hsm",
        "diff",
        "--blueprint",
        blueprintPath,
        "--connector",
        `http://127.0.0.1:${port}`,
        "--admin-id",
        "1",
        "--admin-enc",
        ADMIN_ENC_HEX,
        "--admin-mac",
        ADMIN_MAC_HEX,
      ];
      await expect(createProgram().parseAsync(args)).rejects.toThrow(/__exit__:1/);
    } finally {
      await sim.stop();
    }
  });
});
