import { deleteObject } from "../commands/delete-object.js";
import { listObjects } from "../commands/list-objects.js";
import { putAuthenticationKey } from "../commands/put-authentication-key.js";
import type { Scp03Session } from "../session.js";
import { CapSet, type CapSetT } from "../types/capability.js";
import { domainSetOf } from "../types/domain.js";
import { ObjectType } from "../types/object.js";
import { capabilityFromName, type ParsedAuthKey, type ParsedBlueprint } from "./schema.js";

export interface PlanStep {
  readonly kind: "create-auth-key" | "delete-auth-key";
  readonly id: number;
  readonly authKey?: ParsedAuthKey;
}

export interface Plan {
  readonly create: readonly PlanStep[];
  readonly update: readonly PlanStep[];
  readonly delete: readonly PlanStep[];
}

export interface ReconcileOptions {
  readonly preserveAuthKeyIds?: readonly number[];
  readonly resolveCredential?: (ref: string) => {
    readonly encKey: Uint8Array;
    readonly macKey: Uint8Array;
  };
}

function defaultCredential(): { encKey: Uint8Array; macKey: Uint8Array } {
  return {
    encKey: new Uint8Array(16).fill(0xaa),
    macKey: new Uint8Array(16).fill(0xbb),
  };
}

function capsFromNames(names: readonly string[]): CapSetT {
  return CapSet.of(...names.map(capabilityFromName));
}

export async function plan(
  session: Scp03Session,
  bp: ParsedBlueprint,
  opts: ReconcileOptions = {},
): Promise<Plan> {
  const preserve = new Set(opts.preserveAuthKeyIds ?? []);
  const existing = await listObjects(session, { type: ObjectType.AuthenticationKey });
  const existingIds = new Set(existing.map((o) => o.id));
  const desiredIds = new Set(bp.authKeys.map((k) => k.id));

  const create: PlanStep[] = [];
  const del: PlanStep[] = [];
  for (const k of bp.authKeys) {
    if (!existingIds.has(k.id)) {
      create.push({ kind: "create-auth-key", authKey: k, id: k.id });
    }
  }
  for (const id of existingIds) {
    if (!desiredIds.has(id) && !preserve.has(id)) {
      del.push({ kind: "delete-auth-key", id });
    }
  }
  return { create, update: [], delete: del };
}

export async function apply(
  session: Scp03Session,
  p: Plan,
  opts: ReconcileOptions = {},
): Promise<void> {
  const resolve = opts.resolveCredential ?? ((_ref: string) => defaultCredential());
  for (const step of p.create) {
    if (step.kind !== "create-auth-key" || !step.authKey) {
      continue;
    }
    const ak = step.authKey;
    const cred = resolve(ak.credentialRef);
    await putAuthenticationKey(session, {
      keyId: ak.id,
      label: ak.role,
      domains: domainSetOf(...ak.domains),
      capabilities: capsFromNames(ak.capabilities),
      delegatedCapabilities: capsFromNames(ak.delegatedCapabilities),
      encKey: cred.encKey,
      macKey: cred.macKey,
    });
  }
  for (const step of p.delete) {
    await deleteObject(session, step.id, ObjectType.AuthenticationKey);
  }
}

export async function diff(
  session: Scp03Session,
  bp: ParsedBlueprint,
  opts: ReconcileOptions = {},
): Promise<Plan> {
  return plan(session, bp, opts);
}
