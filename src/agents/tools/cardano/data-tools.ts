/**
 * Cardano blockchain data query tools.
 */

import { Type } from "@sinclair/typebox";
import type { OpenClawConfig } from "../../../config/types.js";
import type { AnyAgentTool } from "../common.js";
import { jsonResult, readStringParam } from "../common.js";
import { createCardanoClient, type CardanoClientConfig } from "./client.js";

function getCardanoConfig(cfg?: OpenClawConfig): CardanoClientConfig {
  const tools = cfg?.tools as Record<string, unknown> | undefined;
  const cardano = tools?.cardano as Record<string, unknown> | undefined;
  return {
    network: (cardano?.network as "mainnet" | "preprod" | "preview") ?? "mainnet",
    blockfrostApiKey: (cardano?.blockfrostApiKey as string) || process.env.BLOCKFROST_API_KEY,
    koiosApiKey: (cardano?.koiosApiKey as string) || process.env.KOIOS_API_KEY,
  };
}

export function createCardanoAddressTool(cfg?: OpenClawConfig): AnyAgentTool {
  const client = createCardanoClient(getCardanoConfig(cfg));
  return {
    label: "Cardano Address",
    name: "cardano_address_info",
    description: "Query Cardano address balance, stake address, and UTxO count.",
    parameters: Type.Object({
      address: Type.String({ description: "Cardano address (bech32)" }),
    }),
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const address = readStringParam(params, "address", { required: true });
      if (!address) return jsonResult({ error: "Address required" });

      const result = await client.getAddressInfo(address);
      if (!result.ok) return jsonResult({ error: result.error });

      const info = result.data;
      return jsonResult({
        address: info.address,
        balance_lovelace: info.balance,
        balance_ada: (parseInt(info.balance) / 1_000_000).toFixed(6),
        stake_address: info.stake_address,
        utxo_count: info.utxo_set?.length ?? 0,
        network: client.network,
      });
    },
  };
}

export function createCardanoTxTool(cfg?: OpenClawConfig): AnyAgentTool {
  const client = createCardanoClient(getCardanoConfig(cfg));
  return {
    label: "Cardano Transaction",
    name: "cardano_tx_info",
    description: "Query Cardano transaction details including inputs, outputs, and fees.",
    parameters: Type.Object({
      tx_hash: Type.String({ description: "Transaction hash (64 char hex)" }),
    }),
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const txHash = readStringParam(params, "tx_hash", { required: true });
      if (!txHash) return jsonResult({ error: "Transaction hash required" });

      const result = await client.getTxInfo(txHash);
      if (!result.ok) return jsonResult({ error: result.error });

      const tx = result.data;
      return jsonResult({
        tx_hash: tx.tx_hash,
        block_height: tx.block_height,
        epoch: tx.epoch_no,
        fee_ada: (parseInt(tx.fee) / 1_000_000).toFixed(6),
        total_output_ada: (parseInt(tx.total_output) / 1_000_000).toFixed(6),
        input_count: tx.inputs.length,
        output_count: tx.outputs.length,
      });
    },
  };
}

export function createCardanoPoolTool(cfg?: OpenClawConfig): AnyAgentTool {
  const client = createCardanoClient(getCardanoConfig(cfg));
  return {
    label: "Cardano Pool",
    name: "cardano_pool_info",
    description: "Query stake pool information including margin, pledge, and delegators.",
    parameters: Type.Object({
      pool_id: Type.String({ description: "Pool ID (bech32 pool1... or hex)" }),
    }),
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const poolId = readStringParam(params, "pool_id", { required: true });
      if (!poolId) return jsonResult({ error: "Pool ID required" });

      const result = await client.getPoolInfo(poolId);
      if (!result.ok) return jsonResult({ error: result.error });

      const pool = result.data;
      return jsonResult({
        pool_id: pool.pool_id_bech32,
        ticker: pool.meta_json?.ticker,
        name: pool.meta_json?.name,
        margin_percent: (pool.margin * 100).toFixed(2),
        fixed_cost_ada: (parseInt(pool.fixed_cost) / 1_000_000).toFixed(0),
        pledge_ada: (parseInt(pool.pledge) / 1_000_000).toFixed(0),
        live_delegators: pool.live_delegators,
        saturation_percent: pool.live_saturation ? (pool.live_saturation * 100).toFixed(2) : null,
        status: pool.pool_status,
      });
    },
  };
}

export function createCardanoTipTool(cfg?: OpenClawConfig): AnyAgentTool {
  const client = createCardanoClient(getCardanoConfig(cfg));
  return {
    label: "Cardano Tip",
    name: "cardano_tip",
    description: "Get current blockchain tip (latest block) information.",
    parameters: Type.Object({}),
    execute: async () => {
      const [tipResult, epochResult] = await Promise.all([client.getTip(), client.getEpochInfo()]);
      if (!tipResult.ok) return jsonResult({ error: tipResult.error });

      const tip = tipResult.data;
      const epoch = epochResult.ok ? epochResult.data : null;

      return jsonResult({
        network: client.network,
        block_number: tip.block_no,
        epoch: tip.epoch_no,
        slot: tip.abs_slot,
        epoch_tx_count: epoch?.tx_count,
      });
    },
  };
}

export function createCardanoDataTools(cfg?: OpenClawConfig): AnyAgentTool[] {
  return [
    createCardanoAddressTool(cfg),
    createCardanoTxTool(cfg),
    createCardanoPoolTool(cfg),
    createCardanoTipTool(cfg),
  ];
}
