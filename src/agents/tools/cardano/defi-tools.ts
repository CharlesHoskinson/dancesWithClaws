/**
 * Cardano DeFi tools.
 */

import { Type } from "@sinclair/typebox";
import type { OpenClawConfig } from "../../../config/types.js";
import type { AnyAgentTool } from "../common.js";
import { jsonResult, readStringParam, readNumberParam } from "../common.js";

const LIQWID_API = "https://api.liqwid.finance/v1";
const SURGE_API = "https://api.surgecardano.com/v1";
const TIMEOUT_MS = 30_000;

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

async function fetchJson<T>(url: string): Promise<Result<T>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { ok: false, error: `${res.status}: ${text || res.statusText}` };
    }
    return { ok: true, data: (await res.json()) as T };
  } catch (e) {
    clearTimeout(timer);
    return { ok: false, error: e instanceof Error ? e.message : "Unknown error" };
  }
}

interface LiqwidMarket {
  symbol: string;
  supply_apy: number;
  borrow_apy: number;
}
interface LiqwidPosition {
  supplied: Array<{ asset: string; amount: string; apy: number }>;
  borrowed: Array<{ asset: string; amount: string; apy: number }>;
  health_factor: number;
}
interface SurgePool {
  pool_id: string;
  token_a: { symbol: string };
  token_b: { symbol: string };
  tvl_ada: string;
  apy_24h: number;
}
interface SurgeQuote {
  input: { token: string; amount: string };
  output: { token: string; amount: string };
  price_impact_percent: number;
  fee_amount: string;
  route: string[];
}

export function createLiqwidMarketsTool(cfg?: OpenClawConfig): AnyAgentTool {
  return {
    label: "Liqwid Markets",
    name: "liqwid_get_markets",
    description: "Get all Liqwid Finance lending markets with current APY rates.",
    parameters: Type.Object({}),
    execute: async () => {
      const result = await fetchJson<{ markets: LiqwidMarket[] }>(`${LIQWID_API}/markets`);
      if (!result.ok) return jsonResult({ error: `Liqwid API: ${result.error}` });
      const markets = result.data.markets.map((m) => ({
        asset: m.symbol,
        supply_apy: (m.supply_apy * 100).toFixed(2),
        borrow_apy: (m.borrow_apy * 100).toFixed(2),
      }));
      return jsonResult({ markets, count: markets.length });
    },
  };
}

export function createLiqwidPositionTool(cfg?: OpenClawConfig): AnyAgentTool {
  return {
    label: "Liqwid Position",
    name: "liqwid_get_position",
    description: "Get a users Liqwid Finance position.",
    parameters: Type.Object({ address: Type.String({ description: "Cardano address" }) }),
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const address = readStringParam(params, "address", { required: true });
      if (!address) return jsonResult({ error: "Address is required" });
      const result = await fetchJson<LiqwidPosition>(
        `${LIQWID_API}/positions/${encodeURIComponent(address)}`,
      );
      if (!result.ok) return jsonResult({ error: `Liqwid API: ${result.error}` });
      return jsonResult({
        address,
        supplied: result.data.supplied,
        borrowed: result.data.borrowed,
        health_factor: result.data.health_factor.toFixed(2),
      });
    },
  };
}

export function createLiqwidEstimateTool(cfg?: OpenClawConfig): AnyAgentTool {
  return {
    label: "Liqwid Estimate",
    name: "liqwid_estimate",
    description: "Estimate returns for supplying or borrowing on Liqwid.",
    parameters: Type.Object({
      action: Type.Union([Type.Literal("supply"), Type.Literal("borrow")], {
        description: "Action type",
      }),
      asset: Type.String({ description: "Asset symbol" }),
      amount: Type.Number({ description: "Amount" }),
    }),
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const action = readStringParam(params, "action", { required: true });
      const asset = readStringParam(params, "asset", { required: true });
      const amount = readNumberParam(params, "amount") ?? 0;
      if (!action || !asset || amount <= 0)
        return jsonResult({ error: "action, asset, and positive amount required" });
      const result = await fetchJson<{ markets: LiqwidMarket[] }>(`${LIQWID_API}/markets`);
      if (!result.ok) return jsonResult({ error: `Liqwid API: ${result.error}` });
      const market = result.data.markets.find(
        (m) => m.symbol.toLowerCase() === asset.toLowerCase(),
      );
      if (!market) return jsonResult({ error: `Asset ${asset} not found` });
      const apy = action === "supply" ? market.supply_apy : market.borrow_apy;
      return jsonResult({
        action,
        asset: market.symbol,
        amount,
        apy_percent: (apy * 100).toFixed(2),
        estimated_return: (amount * apy).toFixed(6),
      });
    },
  };
}

export function createSurgePoolsTool(cfg?: OpenClawConfig): AnyAgentTool {
  return {
    label: "Surge Pools",
    name: "surge_get_pools",
    description: "Get all Surge DEX liquidity pools with TVL and APY.",
    parameters: Type.Object({ limit: Type.Optional(Type.Number({ description: "Max pools" })) }),
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const limit = readNumberParam(params, "limit") ?? 20;
      const result = await fetchJson<{ pools: SurgePool[] }>(`${SURGE_API}/pools`);
      if (!result.ok) return jsonResult({ error: `Surge API: ${result.error}` });
      const pools = result.data.pools.slice(0, limit);
      return jsonResult({
        pools: pools.map((p) => ({
          pool_id: p.pool_id,
          pair: `${p.token_a.symbol}/${p.token_b.symbol}`,
          tvl_ada: p.tvl_ada,
          apy_percent: (p.apy_24h * 100).toFixed(2),
        })),
        count: pools.length,
      });
    },
  };
}

export function createSurgeQuoteTool(cfg?: OpenClawConfig): AnyAgentTool {
  return {
    label: "Surge Quote",
    name: "surge_get_quote",
    description: "Get a swap quote from Surge DEX.",
    parameters: Type.Object({
      input_token: Type.String({ description: "Input token symbol" }),
      output_token: Type.String({ description: "Output token symbol" }),
      amount: Type.Number({ description: "Input amount" }),
    }),
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const inputToken = readStringParam(params, "input_token", { required: true });
      const outputToken = readStringParam(params, "output_token", { required: true });
      const amount = readNumberParam(params, "amount") ?? 0;
      if (!inputToken || !outputToken || amount <= 0)
        return jsonResult({ error: "input_token, output_token, and positive amount required" });
      const result = await fetchJson<SurgeQuote>(
        `${SURGE_API}/quote?input=${encodeURIComponent(inputToken)}&output=${encodeURIComponent(outputToken)}&amount=${amount}`,
      );
      if (!result.ok) return jsonResult({ error: `Surge API: ${result.error}` });
      const q = result.data;
      return jsonResult({
        input: q.input,
        output: q.output,
        price_impact: q.price_impact_percent.toFixed(4),
        fee: q.fee_amount,
        route: q.route,
      });
    },
  };
}

export function createSurgePriceTool(): AnyAgentTool {
  return {
    label: "Surge Price",
    name: "surge_get_price",
    description: "Get current price of a token on Surge DEX",
    parameters: Type.Object({
      token: Type.String({ description: "Token policy ID or ticker symbol" }),
    }),
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const token = readStringParam(params, "token", { required: true });
      if (!token) return jsonResult({ error: "Token is required" });
      const resp = await fetchJson<{ price: string; change24h: string }>(
        `${SURGE_API}/price/${encodeURIComponent(token)}`,
      );
      if (!resp.ok) return jsonResult(resp);
      return jsonResult({
        ok: true,
        data: {
          token,
          price: resp.data.price,
          change24h: resp.data.change24h,
        },
      });
    },
  };
}

export function createLiqwidTools(): AnyAgentTool[] {
  return [createLiqwidMarketsTool(), createLiqwidPositionTool(), createLiqwidEstimateTool()];
}

export function createSurgeTools(): AnyAgentTool[] {
  return [createSurgePoolsTool(), createSurgeQuoteTool(), createSurgePriceTool()];
}

export function createDefiTools(cfg?: OpenClawConfig): AnyAgentTool[] {
  return [...createLiqwidTools(), ...createSurgeTools()];
}
