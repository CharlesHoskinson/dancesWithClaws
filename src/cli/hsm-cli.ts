import type { Command } from "commander";
import {
  apply,
  CapSet,
  Capability,
  type CapSetT,
  composeResolvers,
  createHttpTransport,
  credentialManagerResolver,
  deleteObject,
  derivePasswordKeys,
  diff,
  domainSetOf,
  getDeviceInfo,
  hexFlagResolver,
  jsonFileResolver,
  nullResolver,
  ObjectType,
  openSession,
  parseBlueprint,
  plan,
  type Plan,
  putAuthenticationKey,
  type ResolvedCredential,
  type Scp03Session,
} from "@dancesWithClaws/yubihsm";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve as resolvePath } from "node:path";
import { defaultRuntime } from "../runtime.js";

interface HsmSharedOptions {
  blueprint?: string;
  connector?: string;
  adminId?: string;
  adminEnc?: string;
  adminMac?: string;
  credsFile?: string;
}

interface HsmBootstrapOptions extends HsmSharedOptions {
  factoryPassword?: string;
}

const DEFAULT_BLUEPRINT = "hsm-blueprint.yaml";
const DEFAULT_CONNECTOR = "http://localhost:12345";
const DEFAULT_FACTORY_PASSWORD = "password";
const ADMIN_ROLE = "admin";

/** Thrown when a bootstrap run enters a state it can't safely continue from. */
export class BootstrapAbortedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BootstrapAbortedError";
  }
}

/**
 * Thrown when `apply()` leaves drift behind (diff does not return empty).
 * The device state is still consistent — the admin rotation completed — but
 * the blueprint and device disagree, so the operator must investigate.
 */
export class BootstrapConvergenceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BootstrapConvergenceError";
  }
}

function createResolvers(args: {
  readonly encHex: string | undefined;
  readonly macHex: string | undefined;
  readonly credsFile: string | undefined;
}) {
  return [
    hexFlagResolver({ encHex: args.encHex, macHex: args.macHex, roleBinding: ADMIN_ROLE }),
    args.credsFile ? jsonFileResolver(args.credsFile) : nullResolver,
    credentialManagerResolver(),
  ];
}

function buildResolverChain(opts: HsmSharedOptions): {
  readonly encHex: string | undefined;
  readonly macHex: string | undefined;
  readonly credsFile: string | undefined;
  readonly resolvers: ReturnType<typeof createResolvers>;
} {
  const encHex = opts.adminEnc ?? process.env["HSM_ADMIN_ENC_HEX"];
  const macHex = opts.adminMac ?? process.env["HSM_ADMIN_MAC_HEX"];
  const credsFile = opts.credsFile ?? process.env["HSM_CREDS_FILE"];
  return {
    encHex,
    macHex,
    credsFile,
    resolvers: createResolvers({ encHex, macHex, credsFile }),
  };
}

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

  const { resolvers } = buildResolverChain(opts);
  const chain = composeResolvers(resolvers);
  const resolved = await chain.resolve(ADMIN_ROLE, authKeyId);
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

/** Every YubiHSM2 capability, as a CapSet bitmask. */
function allCaps(): CapSetT {
  return CapSet.of(...(Object.values(Capability) as Capability[]));
}

function compareFirmware(a: { major: number; minor: number; patch: number }, b: string): number {
  const parts = b.split(".").map((p) => Number.parseInt(p, 10));
  const [mj, mi, pa] = [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0];
  if (a.major !== mj) {
    return a.major - mj;
  }
  if (a.minor !== mi) {
    return a.minor - mi;
  }
  return a.patch - pa;
}

function halfAppliedMarkerPath(serial: number): string {
  const dir = join(homedir(), ".openclaw");
  return join(dir, `hsm-bootstrap.${serial}.json`);
}

function writeHalfAppliedMarker(path: string, payload: Record<string, unknown>): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(payload, null, 2), "utf-8");
}

function clearHalfAppliedMarker(path: string): void {
  if (existsSync(path)) {
    rmSync(path);
  }
}

function readHalfAppliedMarker(path: string): Record<string, unknown> | null {
  if (!existsSync(path)) {
    return null;
  }
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function isAuthFailError(err: unknown): boolean {
  if (!(err instanceof Error)) {
    return false;
  }
  // openSession surfaces two shapes when the factory password mismatches:
  // a local "AUTH_FAIL: card cryptogram mismatch" (when the card's challenge
  // response doesn't validate) or a wire-level "AUTHENTICATE_SESSION failed: 4"
  // (ERR_AUTH_FAIL from the device). Both are "try the resolver chain instead."
  return (
    err.message.includes("AUTH_FAIL") ||
    err.message.includes("AUTHENTICATE_SESSION failed: 4") ||
    err.message.includes("CREATE_SESSION failed: 4")
  );
}

interface BootstrapResult {
  readonly serial: number;
  readonly rotated: boolean;
  readonly applied: Plan;
  readonly recovered: boolean;
}

/**
 * Provisions a factory-fresh YubiHSM2 to the given blueprint.
 *
 * Idempotent: re-running on an already-bootstrapped device converges to a
 * no-op plan. See the §5.2 bootstrap flow in
 * `docs/superpowers/plans/2026-04-20-plan-02-hsm-loose-ends-design.md`.
 */
export async function bootstrapDevice(opts: HsmBootstrapOptions): Promise<BootstrapResult> {
  const url = opts.connector ?? process.env["HSM_CONNECTOR_URL"] ?? DEFAULT_CONNECTOR;
  const factoryPassword = opts.factoryPassword ?? DEFAULT_FACTORY_PASSWORD;
  const bp = loadBlueprint(opts);

  const transport = createHttpTransport({ url });
  let rotated = false;
  let recovered = false;
  let appliedPlan: Plan;
  let serial = 0;
  try {
    // 1. Probe device firmware unwrapped. Fails fast if the connector isn't
    // listening or the hardware is too old for the blueprint.
    const info = await getDeviceInfo(transport);
    serial = info.serial;
    if (compareFirmware(info.firmware, bp.device.min_firmware) < 0) {
      throw new BootstrapAbortedError(
        `device firmware ${info.firmware.major}.${info.firmware.minor}.${info.firmware.patch} ` +
          `is below blueprint minimum ${bp.device.min_firmware}`,
      );
    }

    const markerPath = halfAppliedMarkerPath(serial);
    const marker = readHalfAppliedMarker(markerPath);
    const { resolvers } = buildResolverChain(opts);
    const chain = composeResolvers(resolvers);

    if (marker !== null) {
      // A previous run crashed between admin rotation and final convergence.
      // The new admin (if any) should already be in the resolver's backing
      // store; skip the factory-password path and try to open with the
      // resolver directly. If it fails, the operator has to factory-reset
      // the device and start over.
      defaultRuntime.log(
        `[hsm bootstrap] HALF_APPLIED marker present at ${markerPath}; ` +
          "attempting recovery via resolver chain",
      );
      recovered = true;
    } else {
      // 2. Try factory password. Success → still in factory state, rotate.
      // Failure (AUTH_FAIL) → already bootstrapped, skip to apply.
      const { encKey: factoryEnc, macKey: factoryMac } = derivePasswordKeys(factoryPassword);
      let factorySession: Scp03Session | null = null;
      try {
        factorySession = await openSession({
          transport,
          authKeyId: 1,
          authEnc: factoryEnc,
          authMac: factoryMac,
        });
      } catch (err) {
        if (!isAuthFailError(err)) {
          throw err;
        }
        factorySession = null;
      }

      if (factorySession) {
        // 3. Generate fresh random admin and persist it BEFORE touching the
        // device. If the persist fails, the factory password still works —
        // nothing is lost. If the persist succeeds and the device write
        // fails we still have the keys on disk; the marker path will cover
        // the weirder in-between-two-puts case.
        const rnd = randomBytes(32);
        const newEnc = new Uint8Array(rnd.subarray(0, 16));
        const newMac = new Uint8Array(rnd.subarray(16, 32));
        const cred: ResolvedCredential = { encKey: newEnc, macKey: newMac };

        // Pick the first resolver that has a real write method. Hex-flag's
        // write is a no-op only present when the operator already supplied
        // hex values (in that case they control the keys themselves).
        const writable = resolvers.find((r) => typeof r.write === "function");
        if (!writable || !writable.write) {
          throw new BootstrapAbortedError(
            "no writable credential resolver available; supply --creds-file or run on " +
              "a host with Credential Manager so the rotated admin can be persisted",
          );
        }
        await writable.write(ADMIN_ROLE, 1, cred);

        // 4. Write HALF_APPLIED marker before touching the device so an
        // abort after delete-but-before-put still leaves a breadcrumb for
        // the next run to pick up from.
        writeHalfAppliedMarker(markerPath, {
          serial,
          startedAt: new Date().toISOString(),
          stage: "rotating-admin",
          resolver: writable.describe(),
        });

        try {
          // YubiHSM2 rotation is delete-then-put; the live session stays
          // usable because its keys are already derived.
          await deleteObject(factorySession, 1, ObjectType.AuthenticationKey);
          await putAuthenticationKey(factorySession, {
            keyId: 1,
            label: ADMIN_ROLE,
            domains: domainSetOf(1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16),
            capabilities: allCaps(),
            delegatedCapabilities: allCaps(),
            encKey: newEnc,
            macKey: newMac,
          });
          rotated = true;
        } catch (err) {
          // Re-surface every rotation-phase failure as a typed
          // BootstrapAbortedError so callers can distinguish it from a
          // garden-variety IO error. The HALF_APPLIED marker stays put —
          // bootstrap intentionally leaves it so a subsequent run can
          // recover via the resolver chain (the new admin keys are
          // already persisted to the backing store by step 3).
          throw new BootstrapAbortedError(
            `admin rotation failed after HALF_APPLIED marker was written: ${
              err instanceof Error ? err.message : String(err)
            }`,
          );
        } finally {
          try {
            await factorySession.close();
          } catch {
            // Session may already be toast from a failed put; swallow.
          }
        }
      }
    }

    // 5. Open a fresh session via the resolver chain. At this point either
    // the admin was just rotated (and the resolver has the new keys) or the
    // device was already bootstrapped (and the resolver has the operator's
    // real keys). A recovery path with no resolver keys is unrecoverable —
    // the device admin exists but nothing local can authenticate against it.
    let resolved: ResolvedCredential;
    try {
      const hit = await chain.resolve(ADMIN_ROLE, 1);
      if (!hit) {
        throw new BootstrapAbortedError("resolver chain returned null admin keys");
      }
      resolved = hit;
    } catch (err: unknown) {
      if (recovered) {
        throw new BootstrapAbortedError(
          `HALF_APPLIED marker present but no resolver has admin keys for id=1: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
      throw err;
    }

    const session = await openSession({
      transport,
      authKeyId: 1,
      authEnc: resolved.encKey,
      authMac: resolved.macKey,
    });
    try {
      // 6. plan/apply the blueprint with id=1 preserved so the admin key
      // we just sealed doesn't land on the delete list.
      const preserve = [1];
      const p = await plan(session, bp, { preserveAuthKeyIds: preserve });
      await apply(session, p, { preserveAuthKeyIds: preserve });
      appliedPlan = p;

      // 7. Final convergence check — diff MUST be empty.
      const post = await diff(session, bp, { preserveAuthKeyIds: preserve });
      const outstanding = post.create.length + post.update.length + post.delete.length;
      if (outstanding !== 0) {
        throw new BootstrapConvergenceError(
          `device did not converge after apply: create=${post.create.length}, ` +
            `update=${post.update.length}, delete=${post.delete.length}`,
        );
      }
    } finally {
      await session.close();
    }

    // Mark clean.
    clearHalfAppliedMarker(halfAppliedMarkerPath(serial));
  } finally {
    await transport.close();
  }

  return { serial, rotated, applied: appliedPlan!, recovered };
}

export function registerHsmCli(program: Command): void {
  const hsm = program
    .command("hsm")
    .description("YubiHSM2 declarative provisioning (plan / apply / diff / bootstrap)");

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
      // Build a credential_ref → {role, id} lookup so the reconcile layer's
      // resolveCredential callback (keyed on credentialRef) can delegate to
      // the CLI's CredentialResolver chain (keyed on role, id). Without
      // this, any drift on an auth key would rewrite it with stub SCP03
      // material from the package default, bricking operator access.
      const refToAuth = new Map<string, { role: string; id: number }>();
      for (const ak of bp.authKeys) {
        refToAuth.set(ak.credentialRef, { role: ak.role, id: ak.id });
      }
      const { resolvers } = buildResolverChain(opts);
      const chain = composeResolvers(resolvers);
      const result = await withSession(opts, async (session, preserveAuthKeyIds) => {
        const p = await plan(session, bp, { preserveAuthKeyIds });
        // Pre-resolve creds for every update step — those MUST have a real
        // resolver hit or the reconcile layer refuses to run (silent
        // stubbing would brick operator access). Fail fast with a clear
        // error before any device mutation.
        const preResolved = new Map<string, ResolvedCredential>();
        for (const step of p.update) {
          const ak = step.authKey;
          if (!ak) {
            continue;
          }
          const entry = refToAuth.get(ak.credentialRef);
          if (!entry) {
            throw new Error(
              `apply: no blueprint auth-key matches credential_ref=${ak.credentialRef}; ` +
                "cannot resolve keys for drift repair",
            );
          }
          let hit: ResolvedCredential | null = null;
          try {
            hit = await chain.resolve(entry.role, entry.id);
          } catch {
            hit = null;
          }
          if (!hit) {
            throw new Error(
              `apply: resolver chain returned no keys for role=${entry.role} ` +
                `id=${entry.id}; supply --creds-file / --admin-enc / --admin-mac`,
            );
          }
          preResolved.set(ak.credentialRef, hit);
        }
        // Pre-resolve creates best-effort: if the chain has keys, use them;
        // otherwise fall back to stub defaults so the bootstrap path (where
        // the operator hasn't provisioned per-role credentials yet) still
        // works. Creates do NOT require a resolver — only updates do.
        for (const step of p.create) {
          const ak = step.authKey;
          if (!ak) {
            continue;
          }
          const entry = refToAuth.get(ak.credentialRef);
          if (!entry) {
            continue;
          }
          try {
            const hit = await chain.resolve(entry.role, entry.id);
            if (hit) {
              preResolved.set(ak.credentialRef, hit);
            }
          } catch {
            // Chain returned nothing → leave unresolved; resolveCredential
            // below falls back to the stub default for creates.
          }
        }
        const STUB_ENC = new Uint8Array(16).fill(0xaa);
        const STUB_MAC = new Uint8Array(16).fill(0xbb);
        const resolveCredential = (ref: string): ResolvedCredential => {
          const hit = preResolved.get(ref);
          if (hit) {
            return hit;
          }
          // This branch is only reached for create steps (updates have
          // already been validated above); stubbing here matches the
          // historical bootstrap behavior.
          return { encKey: STUB_ENC, macKey: STUB_MAC };
        };
        await apply(session, p, { preserveAuthKeyIds, resolveCredential });
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

  addSharedOptions(hsm.command("bootstrap"))
    .description(
      "Provision a factory-fresh YubiHSM2 end-to-end: rotate factory admin, " +
        "persist new keys, apply the blueprint. Idempotent on re-runs.",
    )
    .option(
      "--factory-password <pw>",
      "YubiHSM2 factory password (default: password)",
      DEFAULT_FACTORY_PASSWORD,
    )
    .action(async (opts: HsmBootstrapOptions) => {
      const result = await bootstrapDevice(opts);
      defaultRuntime.writeJson({
        bootstrap: {
          serial: result.serial,
          rotated: result.rotated,
          recovered: result.recovered,
          applied: summarizePlan(result.applied),
        },
      });
    });
}
