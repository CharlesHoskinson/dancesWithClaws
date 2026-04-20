import type { Command } from "commander";
import {
  apply,
  composeResolvers,
  createHttpTransport,
  credentialManagerResolver,
  diff,
  hexFlagResolver,
  jsonFileResolver,
  nullResolver,
  openSession,
  parseBlueprint,
  plan,
  type Plan,
  type Scp03Session,
} from "@dancesWithClaws/yubihsm";
import { readFileSync } from "node:fs";
import { resolve as resolvePath } from "node:path";
import { defaultRuntime } from "../runtime.js";

interface HsmSharedOptions {
  blueprint?: string;
  connector?: string;
  adminId?: string;
  adminEnc?: string;
  adminMac?: string;
  credsFile?: string;
}

const DEFAULT_BLUEPRINT = "hsm-blueprint.yaml";
const DEFAULT_CONNECTOR = "http://localhost:12345";

async function resolveAdminCreds(opts: HsmSharedOptions): Promise<{
  authKeyId: number;
  authEnc: Uint8Array;
  authMac: Uint8Array;
  preserveAuthKeyIds: number[];
}> {
  const idStr = opts.adminId ?? process.env["HSM_ADMIN_ID"];
  if (!idStr) {
    throw new Error("missing admin id: supply --admin-id or HSM_ADMIN_ID env var");
  }
  const authKeyId = Number.parseInt(idStr, 10);
  if (!Number.isInteger(authKeyId) || authKeyId < 1 || authKeyId > 0xfffe) {
    throw new Error(`admin id out of range: ${idStr}`);
  }

  const encHex = opts.adminEnc ?? process.env["HSM_ADMIN_ENC_HEX"];
  const macHex = opts.adminMac ?? process.env["HSM_ADMIN_MAC_HEX"];
  const credsFile = opts.credsFile ?? process.env["HSM_CREDS_FILE"];

  const chain = composeResolvers([
    hexFlagResolver({ encHex, macHex, roleBinding: "admin" }),
    credsFile ? jsonFileResolver(credsFile) : nullResolver,
    credentialManagerResolver(),
  ]);
  const resolved = await chain.resolve("admin", authKeyId);
  if (!resolved) {
    // composeResolvers throws on all-null; this branch is defensive.
    throw new Error("admin credential resolver returned no keys");
  }

  return {
    authKeyId,
    authEnc: resolved.encKey,
    authMac: resolved.macKey,
    preserveAuthKeyIds: [authKeyId],
  };
}

async function withSession<T>(
  opts: HsmSharedOptions,
  fn: (session: Scp03Session, preserveAuthKeyIds: number[]) => Promise<T>,
): Promise<T> {
  const url = opts.connector ?? process.env["HSM_CONNECTOR_URL"] ?? DEFAULT_CONNECTOR;
  const creds = await resolveAdminCreds(opts);
  const transport = createHttpTransport({ url });
  try {
    const session = await openSession({
      transport,
      authKeyId: creds.authKeyId,
      authEnc: creds.authEnc,
      authMac: creds.authMac,
    });
    try {
      return await fn(session, creds.preserveAuthKeyIds);
    } finally {
      await session.close();
    }
  } finally {
    await transport.close();
  }
}

function loadBlueprint(opts: HsmSharedOptions): ReturnType<typeof parseBlueprint> {
  const path = resolvePath(opts.blueprint ?? DEFAULT_BLUEPRINT);
  return parseBlueprint(readFileSync(path, "utf-8"));
}

function summarizePlan(p: Plan): Record<string, unknown> {
  return {
    create: p.create.map((s) => ({ id: s.id, kind: s.kind, role: s.authKey?.role ?? null })),
    update: p.update.map((s) => ({ id: s.id, kind: s.kind })),
    delete: p.delete.map((s) => ({ id: s.id, kind: s.kind })),
  };
}

export function registerHsmCli(program: Command): void {
  const hsm = program
    .command("hsm")
    .description("YubiHSM2 declarative provisioning (plan / apply / diff)");

  const addSharedOptions = (c: Command): Command =>
    c
      .option("--blueprint <path>", "Blueprint YAML path", DEFAULT_BLUEPRINT)
      .option("--connector <url>", "yubihsm-connector URL", DEFAULT_CONNECTOR)
      .option("--admin-id <id>", "Admin auth key id (u16)")
      .option("--admin-enc <hex>", "Admin SCP03 enc key (32 hex chars)")
      .option("--admin-mac <hex>", "Admin SCP03 mac key (32 hex chars)")
      .option(
        "--creds-file <path>",
        "JSON credential file (maps Credential Manager target names to { enc, mac } hex pairs)",
      );

  addSharedOptions(hsm.command("plan"))
    .description("Show reconcile plan without mutating the device")
    .action(async (opts: HsmSharedOptions) => {
      const bp = loadBlueprint(opts);
      const result = await withSession(opts, (session, preserveAuthKeyIds) =>
        plan(session, bp, { preserveAuthKeyIds }),
      );
      defaultRuntime.writeJson(summarizePlan(result));
    });

  addSharedOptions(hsm.command("apply"))
    .description("Reconcile the device to match the blueprint")
    .action(async (opts: HsmSharedOptions) => {
      const bp = loadBlueprint(opts);
      const result = await withSession(opts, async (session, preserveAuthKeyIds) => {
        const p = await plan(session, bp, { preserveAuthKeyIds });
        await apply(session, p, { preserveAuthKeyIds });
        return p;
      });
      defaultRuntime.writeJson({ applied: summarizePlan(result) });
    });

  addSharedOptions(hsm.command("diff"))
    .description("Report drift; exits 1 if device differs from blueprint")
    .action(async (opts: HsmSharedOptions) => {
      const bp = loadBlueprint(opts);
      const result = await withSession(opts, (session, preserveAuthKeyIds) =>
        diff(session, bp, { preserveAuthKeyIds }),
      );
      const summary = summarizePlan(result);
      defaultRuntime.writeJson(summary);
      const total = result.create.length + result.update.length + result.delete.length;
      if (total > 0) {
        defaultRuntime.exit(1);
      }
    });
}
