/**
 * vault_store and vault_retrieve agent tools.
 */

import { Type } from "@sinclair/typebox";
import type { OpenClawPluginApi } from "../../../../src/plugins/types.js";
import type { EntryType } from "../types.js";
import { appendAuditLog } from "../audit/tee-audit.js";
import * as vaultEntries from "../vault/vault-entries.js";
import * as vaultLock from "../vault/vault-lock.js";
import * as vaultStore from "../vault/vault-store.js";

export function createVaultStoreTool(api: OpenClawPluginApi, stateDir: string) {
  return {
    name: "vault_store",
    description:
      "Store a secret, SSH key, private key, or API token in the encrypted TEE vault. " +
      "The value is encrypted with a per-entry key derived from the vault master key.",
    parameters: Type.Object({
      label: Type.String({ description: "Unique label for the entry" }),
      type: Type.Unsafe<EntryType>({
        type: "string",
        enum: ["secret", "api_token", "ssh_key", "private_key", "certificate"],
        description: "Type of entry",
      }),
      value: Type.String({ description: "The secret value to store" }),
      tags: Type.Optional(
        Type.Array(Type.String(), {
          description: "Optional tags for categorization",
        }),
      ),
    }),
    async execute(_id: string, params: Record<string, unknown>) {
      const label = typeof params.label === "string" ? params.label : "";
      const type = (typeof params.type === "string" ? params.type : "secret") as EntryType;
      const value = typeof params.value === "string" ? params.value : "";
      const tags = Array.isArray(params.tags) ? params.tags.map(String) : [];

      if (!label.trim()) {
        throw new Error("label is required");
      }
      if (!value) {
        throw new Error("value is required");
      }

      if (!vaultLock.isUnlocked()) {
        throw new Error("Vault is locked. Run `openclaw tee unlock` first.");
      }

      const vmk = vaultLock.getVmk();
      let envelope = await vaultStore.readVault(stateDir);
      const { envelope: updated, entry } = await vaultEntries.addEntry(
        envelope,
        vmk,
        {
          label: label.trim(),
          type,
          tags,
          value: Buffer.from(value, "utf8"),
        },
      );
      await vaultStore.writeVault(stateDir, updated);

      await appendAuditLog(stateDir, {
        timestamp: new Date().toISOString(),
        action: "store",
        entryLabel: label,
        entryType: type,
        tool: "vault_store",
        success: true,
      });

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              status: "stored",
              id: entry.id,
              label: entry.label,
              type: entry.type,
              tags: entry.tags,
            }),
          },
        ],
      };
    },
  };
}

export function createVaultRetrieveTool(
  api: OpenClawPluginApi,
  stateDir: string,
) {
  return {
    name: "vault_retrieve",
    description:
      "Retrieve, list, or delete entries from the encrypted TEE vault. " +
      "The 'list' action returns metadata only (no decryption). " +
      "The 'get' action decrypts and returns the value. " +
      "The 'delete' action removes an entry.",
    parameters: Type.Object({
      action: Type.Unsafe<"list" | "get" | "delete">({
        type: "string",
        enum: ["list", "get", "delete"],
        description: "Action to perform",
      }),
      label: Type.Optional(
        Type.String({ description: "Entry label (required for get/delete)" }),
      ),
      type: Type.Optional(
        Type.Unsafe<EntryType>({
          type: "string",
          enum: [
            "secret",
            "api_token",
            "ssh_key",
            "private_key",
            "certificate",
          ],
          description: "Filter by type (for list action)",
        }),
      ),
      tag: Type.Optional(
        Type.String({ description: "Filter by tag (for list action)" }),
      ),
    }),
    async execute(_id: string, params: Record<string, unknown>) {
      const action = typeof params.action === "string" ? params.action : "list";
      const label =
        typeof params.label === "string" ? params.label.trim() : undefined;
      const type =
        typeof params.type === "string"
          ? (params.type as EntryType)
          : undefined;
      const tag = typeof params.tag === "string" ? params.tag : undefined;

      if (!vaultLock.isUnlocked()) {
        throw new Error("Vault is locked. Run `openclaw tee unlock` first.");
      }

      const vmk = vaultLock.getVmk();
      const envelope = await vaultStore.readVault(stateDir);

      if (action === "list") {
        const entries = vaultEntries.listEntries(envelope, { type, tag });
        await appendAuditLog(stateDir, {
          timestamp: new Date().toISOString(),
          action: "list",
          tool: "vault_retrieve",
          success: true,
        });
        return {
          content: [
            { type: "text", text: JSON.stringify({ entries }, null, 2) },
          ],
        };
      }

      if (!label) {
        throw new Error("label is required for get/delete actions");
      }

      if (action === "get") {
        const { value } = await vaultEntries.retrieveEntry(
          envelope,
          vmk,
          label,
        );
        const text = value.toString("utf8");
        await appendAuditLog(stateDir, {
          timestamp: new Date().toISOString(),
          action: "retrieve",
          entryLabel: label,
          tool: "vault_retrieve",
          success: true,
        });
        return {
          content: [
            { type: "text", text: JSON.stringify({ label, value: text }) },
          ],
        };
      }

      if (action === "delete") {
        const updated = vaultEntries.deleteEntry(envelope, vmk, label);
        await vaultStore.writeVault(stateDir, updated);
        await appendAuditLog(stateDir, {
          timestamp: new Date().toISOString(),
          action: "delete",
          entryLabel: label,
          tool: "vault_retrieve",
          success: true,
        });
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ status: "deleted", label }),
            },
          ],
        };
      }

      throw new Error(`Unknown action: ${action}`);
    },
  };
}
