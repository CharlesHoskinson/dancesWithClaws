import type { Scp03Session } from "../session.js";
import { deleteObject } from "../commands/delete-object.js";
import { getObjectInfo } from "../commands/get-object-info.js";
import { listObjects } from "../commands/list-objects.js";
import { putAuthenticationKey } from "../commands/put-authentication-key.js";
import { CapSet, type CapSetT } from "../types/capability.js";
import { domainSetOf } from "../types/domain.js";
import { ObjectType } from "../types/object.js";
import { capabilityFromName, type ParsedAuthKey, type ParsedBlueprint } from "./schema.js";

export interface PlanStep {
  readonly kind: "create-auth-key" | "update-auth-key" | "delete-auth-key";
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
  const desiredById = new Map(bp.authKeys.map((k) => [k.id, k]));

  const create: PlanStep[] = [];
  const update: PlanStep[] = [];
  const del: PlanStep[] = [];
  for (const k of bp.authKeys) {
    if (!existingIds.has(k.id)) {
      create.push({ kind: "create-auth-key", authKey: k, id: k.id });
    }
  }
  // Drift detection: for every id present on the device AND in the blueprint,
  // fetch the object info and compare caps / domains / delegated-caps. Any
  // divergence produces an update step (delete-then-put in apply).
  for (const id of existingIds) {
    const desired = desiredById.get(id);
    if (!desired) {
      continue;
    }
    const info = await getObjectInfo(session, id, ObjectType.AuthenticationKey);
    const wantCaps = capsFromNames(desired.capabilities);
    const wantDelegated = capsFromNames(desired.delegatedCapabilities);
    const wantDomains = domainSetOf(...desired.domains);
    if (
      info.capabilities !== wantCaps ||
      info.delegatedCapabilities !== wantDelegated ||
      info.domains !== wantDomains
    ) {
      update.push({ kind: "update-auth-key", id, authKey: desired });
    }
  }
  for (const id of existingIds) {
    if (!desiredById.has(id) && !preserve.has(id)) {
      del.push({ kind: "delete-auth-key", id });
    }
  }
  return { create, update, delete: del };
}

export async function apply(
  session: Scp03Session,
  p: Plan,
  opts: ReconcileOptions = {},
): Promise<void> {
  const resolve = opts.resolveCredential ?? ((_ref: string) => defaultCredential());
  // Execution order: creates → updates → deletes. Updates run after creates so
  // a freshly-put key isn't rewritten by a stale drift path; deletes run last
  // so we don't drop an admin key the session still depends on mid-apply.
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
  for (const step of p.update) {
    if (step.kind !== "update-auth-key" || !step.authKey) {
      continue;
    }
    const ak = step.authKey;
    const cred = resolve(ak.credentialRef);
    // YubiHSM2 has no in-place "update auth key" primitive — delete-then-put
    // is the canonical rotation. The new keys come from the credential
    // resolver so drift repair can also rotate the SCP03 material.
    await deleteObject(session, step.id, ObjectType.AuthenticationKey);
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
