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

/**
 * Thrown when `apply()` encounters a plan step that needs new SCP03 key
 * material (currently: `update-auth-key`) but the caller did not supply a
 * `resolveCredential` function. This is a hard failure — silently falling
 * back to a stub credential would brick the operator's access to the device
 * by delete-then-put-ting the auth key with unknown material.
 *
 * Create-auth-key steps do NOT trigger this: bootstrap provisioning uses a
 * stub default for the initial factory-rotation path where the resolver
 * chain is not yet populated with the operator's keys.
 */
export class ReconcileCredentialMissing extends Error {
  readonly credentialRef: string;
  readonly authKeyId: number;
  constructor(credentialRef: string, authKeyId: number) {
    super(
      `apply() received an update-auth-key step for id=${authKeyId} (credential_ref=` +
        `${credentialRef}) but no resolveCredential was supplied; rotating an auth key ` +
        "without real key material would brick operator access",
    );
    this.name = "ReconcileCredentialMissing";
    this.credentialRef = credentialRef;
    this.authKeyId = authKeyId;
  }
}

function defaultCreateCredential(): { encKey: Uint8Array; macKey: Uint8Array } {
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
  // Pre-flight: if any update-auth-key step exists, a resolver is mandatory.
  // Bail BEFORE running any deletes so the device stays intact on the error
  // path — a caller that forgot `resolveCredential` must not get a half-
  // applied plan that leaves the auth key rotated with stub material.
  if (!opts.resolveCredential) {
    for (const step of p.update) {
      if (step.kind === "update-auth-key" && step.authKey) {
        throw new ReconcileCredentialMissing(step.authKey.credentialRef, step.id);
      }
    }
  }
  // Creates still fall back to a stub default: this is the bootstrap flow
  // where the resolver chain is not yet populated with the operator's keys
  // (see `openclaw hsm bootstrap`, which rotates the admin separately and
  // then re-plan/applies the blueprint for peripheral auth keys).
  const resolveCreate = opts.resolveCredential ?? ((_ref: string) => defaultCreateCredential());
  const resolveUpdate = opts.resolveCredential;
  // Execution order: creates → updates → deletes. Updates run after creates so
  // a freshly-put key isn't rewritten by a stale drift path; deletes run last
  // so we don't drop an admin key the session still depends on mid-apply.
  for (const step of p.create) {
    if (step.kind !== "create-auth-key" || !step.authKey) {
      continue;
    }
    const ak = step.authKey;
    const cred = resolveCreate(ak.credentialRef);
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
    // The pre-flight check above guarantees resolveUpdate is defined here.
    if (!resolveUpdate) {
      throw new ReconcileCredentialMissing(ak.credentialRef, step.id);
    }
    const cred = resolveUpdate(ak.credentialRef);
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
