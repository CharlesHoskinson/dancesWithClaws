/**
 * CRUD operations on vault entries.
 *
 * Each entry is encrypted with its own EEK derived from:
 *   EEK = HKDF-SHA256(VMK, entry_id || version)
 *
 * EEK is zeroed from memory immediately after use.
 */

import { randomUUID } from "node:crypto";
import type { VaultEntry, VaultEnvelope, EntryType } from "../types.js";
import {
  deriveEntryKey,
  aesGcmEncrypt,
  aesGcmDecrypt,
  zeroBuffer,
} from "../crypto/key-hierarchy.js";
import { touchEnvelope } from "./vault-store.js";

export interface StoreEntryParams {
  label: string;
  type: EntryType;
  tags?: string[];
  value: Buffer;
  hsmResident?: boolean;
  hsmObjectId?: number;
}

export interface EntryMetadata {
  id: string;
  label: string;
  type: EntryType;
  tags: string[];
  createdAt: string;
  modifiedAt: string;
  version: number;
  hsmResident: boolean;
}

/** Add a new entry to the vault. */
export async function addEntry(
  envelope: VaultEnvelope,
  vmk: Buffer,
  params: StoreEntryParams,
): Promise<{ envelope: VaultEnvelope; entry: VaultEntry }> {
  // Check for duplicate labels
  if (envelope.entries.some((e) => e.label === params.label)) {
    throw new Error(`Entry with label "${params.label}" already exists`);
  }

  const id = randomUUID();
  const version = 1;
  const now = new Date().toISOString();

  let entry: VaultEntry;

  if (params.hsmResident) {
    // HSM-resident: no ciphertext, just store the object ID
    entry = {
      id,
      label: params.label,
      type: params.type,
      tags: params.tags ?? [],
      createdAt: now,
      modifiedAt: now,
      version,
      hsmResident: true,
      hsmObjectId: params.hsmObjectId,
    };
  } else {
    // Encrypt the value with a derived EEK
    const eek = await deriveEntryKey(vmk, id, version);
    try {
      const { iv, ciphertext, authTag } = aesGcmEncrypt(eek, params.value);
      entry = {
        id,
        label: params.label,
        type: params.type,
        tags: params.tags ?? [],
        createdAt: now,
        modifiedAt: now,
        version,
        hsmResident: false,
        iv: iv.toString("base64"),
        ciphertext: ciphertext.toString("base64"),
        authTag: authTag.toString("base64"),
      };
    } finally {
      zeroBuffer(eek);
    }
  }

  const updatedEnvelope = touchEnvelope(
    {
      ...envelope,
      entries: [...envelope.entries, entry],
    },
    vmk,
  );

  return { envelope: updatedEnvelope, entry };
}

/** Decrypt and retrieve an entry's value. */
export async function retrieveEntry(
  envelope: VaultEnvelope,
  vmk: Buffer,
  label: string,
): Promise<{ entry: VaultEntry; value: Buffer }> {
  const entry = envelope.entries.find((e) => e.label === label);
  if (!entry) {
    throw new Error(`Entry "${label}" not found`);
  }

  if (entry.hsmResident) {
    throw new Error(
      `Entry "${label}" is HSM-resident (object ID: ${entry.hsmObjectId}). ` +
        "Use HSM operations directly for this key.",
    );
  }

  if (!entry.iv || !entry.ciphertext || !entry.authTag) {
    throw new Error(`Entry "${label}" has no encrypted data`);
  }

  const eek = await deriveEntryKey(vmk, entry.id, entry.version);
  try {
    const value = aesGcmDecrypt(
      eek,
      Buffer.from(entry.iv, "base64"),
      Buffer.from(entry.ciphertext, "base64"),
      Buffer.from(entry.authTag, "base64"),
    );
    return { entry, value };
  } finally {
    zeroBuffer(eek);
  }
}

/** List entry metadata (no decryption needed). */
export function listEntries(
  envelope: VaultEnvelope,
  filter?: { type?: EntryType; tag?: string },
): EntryMetadata[] {
  let entries = envelope.entries;
  if (filter?.type) {
    entries = entries.filter((e) => e.type === filter.type);
  }
  if (filter?.tag) {
    entries = entries.filter((e) => e.tags.includes(filter.tag!));
  }
  return entries.map((e) => ({
    id: e.id,
    label: e.label,
    type: e.type,
    tags: e.tags,
    createdAt: e.createdAt,
    modifiedAt: e.modifiedAt,
    version: e.version,
    hsmResident: e.hsmResident,
  }));
}

/** Delete an entry from the vault. */
export function deleteEntry(envelope: VaultEnvelope, vmk: Buffer, label: string): VaultEnvelope {
  const idx = envelope.entries.findIndex((e) => e.label === label);
  if (idx === -1) {
    throw new Error(`Entry "${label}" not found`);
  }
  const entries = [...envelope.entries];
  entries.splice(idx, 1);
  return touchEnvelope({ ...envelope, entries }, vmk);
}

/** Re-encrypt an entry with a new EEK (increments version). */
export async function rotateEntry(
  envelope: VaultEnvelope,
  vmk: Buffer,
  label: string,
): Promise<VaultEnvelope> {
  const idx = envelope.entries.findIndex((e) => e.label === label);
  if (idx === -1) {
    throw new Error(`Entry "${label}" not found`);
  }

  const entry = envelope.entries[idx];
  if (entry.hsmResident) {
    throw new Error(`Cannot rotate HSM-resident entry "${label}"`);
  }

  // Decrypt with old EEK
  const oldEek = await deriveEntryKey(vmk, entry.id, entry.version);
  let plaintext: Buffer;
  try {
    plaintext = aesGcmDecrypt(
      oldEek,
      Buffer.from(entry.iv!, "base64"),
      Buffer.from(entry.ciphertext!, "base64"),
      Buffer.from(entry.authTag!, "base64"),
    );
  } finally {
    zeroBuffer(oldEek);
  }

  // Re-encrypt with new version
  const newVersion = entry.version + 1;
  const newEek = await deriveEntryKey(vmk, entry.id, newVersion);
  try {
    const { iv, ciphertext, authTag } = aesGcmEncrypt(newEek, plaintext);
    const updatedEntry: VaultEntry = {
      ...entry,
      version: newVersion,
      modifiedAt: new Date().toISOString(),
      iv: iv.toString("base64"),
      ciphertext: ciphertext.toString("base64"),
      authTag: authTag.toString("base64"),
    };
    const entries = [...envelope.entries];
    entries[idx] = updatedEntry;
    return touchEnvelope({ ...envelope, entries }, vmk);
  } finally {
    zeroBuffer(newEek);
    zeroBuffer(plaintext);
  }
}

/** Re-encrypt ALL entries with a new VMK. */
export async function rotateAllEntries(
  envelope: VaultEnvelope,
  oldVmk: Buffer,
  newVmk: Buffer,
): Promise<VaultEnvelope> {
  const newEntries: VaultEntry[] = [];

  for (const entry of envelope.entries) {
    if (entry.hsmResident) {
      newEntries.push(entry);
      continue;
    }

    // Decrypt with old VMK
    const oldEek = await deriveEntryKey(oldVmk, entry.id, entry.version);
    let plaintext: Buffer;
    try {
      plaintext = aesGcmDecrypt(
        oldEek,
        Buffer.from(entry.iv!, "base64"),
        Buffer.from(entry.ciphertext!, "base64"),
        Buffer.from(entry.authTag!, "base64"),
      );
    } finally {
      zeroBuffer(oldEek);
    }

    // Re-encrypt with new VMK (reset version to 1)
    const newEek = await deriveEntryKey(newVmk, entry.id, 1);
    try {
      const { iv, ciphertext, authTag } = aesGcmEncrypt(newEek, plaintext);
      newEntries.push({
        ...entry,
        version: 1,
        modifiedAt: new Date().toISOString(),
        iv: iv.toString("base64"),
        ciphertext: ciphertext.toString("base64"),
        authTag: authTag.toString("base64"),
      });
    } finally {
      zeroBuffer(newEek);
      zeroBuffer(plaintext);
    }
  }

  return touchEnvelope(
    {
      ...envelope,
      entries: newEntries,
      metadata: {
        ...envelope.metadata,
        vmkVersion: envelope.metadata.vmkVersion + 1,
      },
    },
    newVmk,
  );
}
