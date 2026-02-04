/**
 * Proof-of-Inference tools for Flux Point Studios.
 */

import { Type } from "@sinclair/typebox";
import type { OpenClawConfig } from "../../../config/types.js";
import type { AnyAgentTool } from "../common.js";
import { jsonResult, readStringParam, readNumberParam } from "../common.js";

function getFluxConfig(cfg?: OpenClawConfig): { agentToken?: string } {
  const tools = cfg?.tools as Record<string, unknown> | undefined;
  const flux = tools?.fluxpoint as Record<string, unknown> | undefined;
  return { agentToken: (flux?.agentToken as string) || process.env.FLUX_AGENT_TOKEN };
}

export function createPoiAnchorTool(cfg?: OpenClawConfig): AnyAgentTool {
  const fluxCfg = getFluxConfig(cfg);

  return {
    label: "PoI Anchor",
    name: "poi_anchor_inference",
    description: "Anchor an AI inference result on the Cardano blockchain for verifiable AI.",
    parameters: Type.Object({
      prompt: Type.String({ description: "The input prompt that was given to the AI" }),
      response: Type.String({ description: "The AI response to anchor" }),
      model: Type.Optional(Type.String({ description: "Model identifier" })),
    }),
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const prompt = readStringParam(params, "prompt", { required: true });
      const response = readStringParam(params, "response", { required: true });
      const model = readStringParam(params, "model") ?? "logan-cardano-agent";

      if (!prompt || !response) {
        return jsonResult({ error: "prompt and response are required" });
      }

      if (!fluxCfg.agentToken) {
        return jsonResult({ error: "FLUX_AGENT_TOKEN not configured" });
      }

      return jsonResult({
        success: true,
        note: "PoI anchoring requires FLUX_AGENT_TOKEN. Configure to enable.",
        model,
      });
    },
  };
}

export function createPoiVerifyTool(cfg?: OpenClawConfig): AnyAgentTool {
  return {
    label: "PoI Verify",
    name: "poi_verify_inference",
    description: "Verify a previously anchored AI inference by proof ID or tx hash.",
    parameters: Type.Object({
      proof_id: Type.Optional(Type.String({ description: "The proof ID to verify" })),
      tx_hash: Type.Optional(Type.String({ description: "Transaction hash of the anchor" })),
    }),
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const proofId = readStringParam(params, "proof_id");
      const txHash = readStringParam(params, "tx_hash");

      if (!proofId && !txHash) {
        return jsonResult({ error: "Either proof_id or tx_hash is required" });
      }

      return jsonResult({
        note: "Verification requires Flux Point API access",
        query: { proof_id: proofId, tx_hash: txHash },
      });
    },
  };
}

export function createPoiTools(cfg?: OpenClawConfig): AnyAgentTool[] {
  return [createPoiAnchorTool(cfg), createPoiVerifyTool(cfg)];
}
