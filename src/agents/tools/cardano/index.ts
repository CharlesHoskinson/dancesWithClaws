/**
 * Cardano ecosystem tools for OpenClaw.
 *
 * Includes:
 * - Blockchain data queries (addresses, transactions, pools, assets)
 * - DeFi integrations (Liqwid Finance, Surge DEX)
 * - Governance tools (Clarity Protocol, DReps)
 * - Proof-of-Inference (Flux Point Studios)
 * - Immutable storage (BEACN Ledger-Scrolls)
 */

export * from "./types.js";
export * from "./client.js";
export * from "./data-tools.js";
export * from "./defi-tools.js";
export * from "./governance-tools.js";
export * from "./poi-tools.js";
export * from "./scrolls-tools.js";

import type { OpenClawConfig } from "../../../config/types.js";
import type { AnyAgentTool } from "../common.js";
import { createCardanoDataTools } from "./data-tools.js";
import { createDefiTools } from "./defi-tools.js";
import { createGovernanceTools } from "./governance-tools.js";
import { createPoiTools } from "./poi-tools.js";
import { createScrollsTools } from "./scrolls-tools.js";

/**
 * Create all Cardano ecosystem tools.
 */
export function createCardanoTools(cfg?: OpenClawConfig): AnyAgentTool[] {
  const tools = cfg?.tools as Record<string, unknown> | undefined;
  const cardanoConfig = tools?.cardano as Record<string, unknown> | undefined;

  // Check if Cardano tools are enabled (default: true)
  const enabled = cardanoConfig?.enabled !== false;

  if (!enabled) {
    return [];
  }

  return [
    ...createCardanoDataTools(cfg),
    ...createDefiTools(cfg),
    ...createGovernanceTools(cfg),
    ...createPoiTools(cfg),
    ...createScrollsTools(cfg),
  ];
}
