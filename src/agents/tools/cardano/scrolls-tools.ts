/**
 * BEACN Ledger-Scrolls tools for immutable audit trail storage.
 */

import { Type } from "@sinclair/typebox";
import type { OpenClawConfig } from "../../../config/types.js";
import type { AnyAgentTool } from "../common.js";
import { jsonResult, readStringParam } from "../common.js";
import { createCardanoClient, type CardanoClientConfig } from "./client.js";

const SCROLLS_METADATA_LABEL = 8888;

function getCardanoConfig(cfg?: OpenClawConfig): CardanoClientConfig {
  const tools = cfg?.tools as Record<string, unknown> | undefined;
  const cardano = tools?.cardano as Record<string, unknown> | undefined;
  return {
    network: (cardano?.network as "mainnet" | "preprod" | "preview") ?? "mainnet",
    primaryProvider: (cardano?.primaryProvider as "koios" | "blockfrost") ?? "koios",
    blockfrostApiKey: (cardano?.blockfrostApiKey as string) || process.env.BLOCKFROST_API_KEY,
    koiosApiKey: (cardano?.koiosApiKey as string) || process.env.KOIOS_API_KEY,
  };
}

export function createScrollsReadTool(cfg?: OpenClawConfig): AnyAgentTool {
  const client = createCardanoClient(getCardanoConfig(cfg));

  return {
    label: "Scrolls Read",
    name: "scrolls_read",
    description: "Read an immutable document from Ledger-Scrolls by transaction hash.",
    parameters: Type.Object({
      tx_hash: Type.String({ description: "Transaction hash containing the scroll data" }),
    }),
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const txHash = readStringParam(params, "tx_hash", { required: true });

      if (!txHash) {
        return jsonResult({ error: "Transaction hash is required" });
      }

      const result = await client.getTxInfo(txHash);
      if (!result.ok) {
        return jsonResult({ error: result.error });
      }

      const tx = result.data;
      const metadata = tx.metadata as Record<string, unknown> | undefined;

      if (!metadata || !metadata[SCROLLS_METADATA_LABEL]) {
        return jsonResult({ error: "No Ledger-Scrolls data found in this transaction" });
      }

      const scrollData = metadata[SCROLLS_METADATA_LABEL] as Record<string, unknown>;

      return jsonResult({
        tx_hash: tx.tx_hash,
        block_height: tx.block_height,
        timestamp: new Date(tx.tx_timestamp * 1000).toISOString(),
        content_type: scrollData.type ?? "unknown",
        content_hash: scrollData.hash,
        data: scrollData.data,
        network: client.network,
      });
    },
  };
}

export function createScrollsPrepareTool(cfg?: OpenClawConfig): AnyAgentTool {
  return {
    label: "Scrolls Prepare",
    name: "scrolls_prepare_write",
    description: "Prepare a Ledger-Scrolls entry for writing.",
    parameters: Type.Object({
      content_type: Type.String({ description: "Type of content (audit_log, decision, report)" }),
      data: Type.Unknown({ description: "The data to store" }),
      tags: Type.Optional(Type.Array(Type.String(), { description: "Tags for categorization" })),
    }),
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const contentType = readStringParam(params, "content_type", { required: true });
      const data = params.data;
      const tags = params.tags as string[] | undefined;

      if (!contentType || !data) {
        return jsonResult({ error: "content_type and data are required" });
      }

      const contentStr = JSON.stringify(data);
      const encoder = new TextEncoder();
      const dataBuffer = encoder.encode(contentStr);
      const hashBuffer = await crypto.subtle.digest("SHA-256", dataBuffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const contentHash = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");

      return jsonResult({
        metadata_label: SCROLLS_METADATA_LABEL,
        metadata: {
          type: contentType,
          hash: contentHash,
          data,
          tags,
          timestamp: Date.now(),
          version: "1.0",
        },
        content_hash: contentHash,
        size_bytes: contentStr.length,
        note: "Include this metadata in a transaction to create an immutable scroll entry",
      });
    },
  };
}

export function createScrollsTools(cfg?: OpenClawConfig): AnyAgentTool[] {
  return [createScrollsReadTool(cfg), createScrollsPrepareTool(cfg)];
}
