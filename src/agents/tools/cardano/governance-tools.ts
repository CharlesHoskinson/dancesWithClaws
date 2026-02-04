/**
 * Cardano governance tools for Clarity Protocol.
 */

import { Type } from "@sinclair/typebox";
import type { OpenClawConfig } from "../../../config/types.js";
import type { AnyAgentTool } from "../common.js";
import { jsonResult, readStringParam, readNumberParam } from "../common.js";

const CLARITY_API = "https://api.clarity.vote/v1";
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

    const data = (await res.json()) as T;
    return { ok: true, data };
  } catch (e) {
    clearTimeout(timer);
    return { ok: false, error: e instanceof Error ? e.message : "Unknown error" };
  }
}

interface ClarityProposal {
  proposal_id: string;
  title: string;
  summary: string;
  category: string;
  status: "active" | "passed" | "rejected" | "expired";
  votes_yes: string;
  votes_no: string;
  votes_abstain: string;
  total_voting_power: string;
  start_epoch: number;
  end_epoch: number;
  url?: string;
}

interface DRepInfo {
  drep_id: string;
  view: string;
  anchor_url?: string;
  anchor_hash?: string;
  deposit: string;
  active: boolean;
  voting_power?: string;
  delegators_count?: number;
}

export function createClarityProposalsTool(cfg?: OpenClawConfig): AnyAgentTool {
  return {
    label: "Clarity Proposals",
    name: "clarity_get_proposals",
    description: "Get active and recent Cardano governance proposals from Clarity Protocol.",
    parameters: Type.Object({
      status: Type.Optional(
        Type.Union(
          [
            Type.Literal("active"),
            Type.Literal("passed"),
            Type.Literal("rejected"),
            Type.Literal("all"),
          ],
          { description: "Filter by proposal status (default: active)" },
        ),
      ),
      limit: Type.Optional(Type.Number({ description: "Max proposals to return (default: 20)" })),
    }),
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const status = readStringParam(params, "status") ?? "active";
      const limit = readNumberParam(params, "limit") ?? 20;

      const url =
        status === "all"
          ? `${CLARITY_API}/proposals?limit=${limit}`
          : `${CLARITY_API}/proposals?status=${status}&limit=${limit}`;

      const result = await fetchJson<{ proposals: ClarityProposal[] }>(url);

      if (!result.ok) {
        return jsonResult({ error: `Clarity API: ${result.error}` });
      }

      const proposals = result.data.proposals.map((p) => ({
        id: p.proposal_id,
        title: p.title,
        summary: p.summary.slice(0, 200) + (p.summary.length > 200 ? "..." : ""),
        category: p.category,
        status: p.status,
        votes: { yes: p.votes_yes, no: p.votes_no, abstain: p.votes_abstain },
        epochs: { start: p.start_epoch, end: p.end_epoch },
        url: p.url,
      }));

      return jsonResult({ proposals, count: proposals.length, filter: status });
    },
  };
}

export function createDRepInfoTool(cfg?: OpenClawConfig): AnyAgentTool {
  return {
    label: "DRep Info",
    name: "cardano_drep_info",
    description: "Get information about a Delegated Representative (DRep).",
    parameters: Type.Object({
      drep_id: Type.String({ description: "DRep ID (bech32 format drep1... or hex)" }),
    }),
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const drepId = readStringParam(params, "drep_id", { required: true });

      if (!drepId) {
        return jsonResult({ error: "DRep ID is required" });
      }

      const result = await fetchJson<DRepInfo>(
        `${CLARITY_API}/dreps/${encodeURIComponent(drepId)}`,
      );

      if (!result.ok) {
        return jsonResult({ error: `Clarity API: ${result.error}` });
      }

      const drep = result.data;
      return jsonResult({
        drep_id: drep.drep_id,
        view: drep.view,
        active: drep.active,
        deposit_ada: (parseInt(drep.deposit) / 1_000_000).toFixed(0),
        voting_power_ada: drep.voting_power
          ? (parseInt(drep.voting_power) / 1_000_000).toFixed(0)
          : null,
        delegators_count: drep.delegators_count,
        anchor: drep.anchor_url ? { url: drep.anchor_url, hash: drep.anchor_hash } : null,
      });
    },
  };
}

export function createGovernanceTools(cfg?: OpenClawConfig): AnyAgentTool[] {
  return [createClarityProposalsTool(cfg), createDRepInfoTool(cfg)];
}
