/**
 * Cardano ecosystem tools for OpenClaw.
 */

export * from "./types.js";
export * from "./client.js";
export * from "./data-tools.js";

import type { OpenClawConfig } from "../../../config/types.js";
import type { AnyAgentTool } from "../common.js";
import { createCardanoDataTools } from "./data-tools.js";

/**
 * Create all Cardano ecosystem tools.
 */
export function createCardanoTools(cfg?: OpenClawConfig): AnyAgentTool[] {
  const tools = cfg?.tools as Record<string, unknown> | undefined;
  const cardanoConfig = tools?.cardano as Record<string, unknown> | undefined;

  const enabled = cardanoConfig?.enabled !== false;
  if (!enabled) return [];

  return [...createCardanoDataTools(cfg)];
}
