import { Type } from "@sinclair/typebox";

import type { OpenClawConfig } from "../../config/config.js";
import type { AnyAgentTool } from "./common.js";
import { jsonResult, readStringParam } from "./common.js";
import { createSokosumiClient } from "./sokosumi/client.js";

function resolveApiKey(cfg?: OpenClawConfig): string | undefined {
  const sk = cfg?.tools?.sokosumi;
  if (sk && typeof sk === "object" && "apiKey" in sk) {
    const key = (sk as { apiKey?: string }).apiKey?.trim();
    if (key) return key;
  }
  return (process.env.SOKOSUMI_API_KEY ?? "").trim() || undefined;
}

function resolveBaseUrl(cfg?: OpenClawConfig): string | undefined {
  const sk = cfg?.tools?.sokosumi;
  if (sk && typeof sk === "object" && "apiEndpoint" in sk) {
    return (sk as { apiEndpoint?: string }).apiEndpoint?.trim() || undefined;
  }
  return undefined;
}

function createSokosumiListAgentsTool(cfg?: OpenClawConfig): AnyAgentTool {
  return {
    name: "sokosumi_list_agents",
    description: "List available AI agents on the Sokosumi marketplace.",
    parameters: Type.Object({}),
    execute: async () => {
      const apiKey = resolveApiKey(cfg);
      if (!apiKey) return jsonResult({ error: "SOKOSUMI_API_KEY not set." });
      const client = createSokosumiClient(apiKey, resolveBaseUrl(cfg));
      const res = await client.listAgents();
      if (!res.ok) return jsonResult({ error: res.error });
      return jsonResult(res.data.data);
    },
  };
}

function createSokosumiGetAgentTool(cfg?: OpenClawConfig): AnyAgentTool {
  return {
    name: "sokosumi_get_agent",
    description: "Get details for a specific Sokosumi agent, including pricing and capabilities.",
    parameters: Type.Object({
      agentId: Type.String({ description: "Agent ID" }),
    }),
    execute: async (_id, args) => {
      const apiKey = resolveApiKey(cfg);
      if (!apiKey) return jsonResult({ error: "SOKOSUMI_API_KEY not set." });
      const params = args as Record<string, unknown>;
      const agentId = readStringParam(params, "agentId", { required: true });
      const client = createSokosumiClient(apiKey, resolveBaseUrl(cfg));
      const res = await client.getAgent(agentId);
      if (!res.ok) return jsonResult({ error: res.error });
      return jsonResult(res.data.data);
    },
  };
}

function createSokosumiGetInputSchemaTool(cfg?: OpenClawConfig): AnyAgentTool {
  return {
    name: "sokosumi_get_input_schema",
    description: "Get the input schema for a Sokosumi agent so you know what data to send when creating a job.",
    parameters: Type.Object({
      agentId: Type.String({ description: "Agent ID" }),
    }),
    execute: async (_id, args) => {
      const apiKey = resolveApiKey(cfg);
      if (!apiKey) return jsonResult({ error: "SOKOSUMI_API_KEY not set." });
      const params = args as Record<string, unknown>;
      const agentId = readStringParam(params, "agentId", { required: true });
      const client = createSokosumiClient(apiKey, resolveBaseUrl(cfg));
      const res = await client.getInputSchema(agentId);
      if (!res.ok) return jsonResult({ error: res.error });
      return jsonResult(res.data.data);
    },
  };
}

function createSokosumiListJobsTool(cfg?: OpenClawConfig): AnyAgentTool {
  return {
    name: "sokosumi_list_jobs",
    description: "List jobs for a Sokosumi agent. Use to check on running or completed jobs.",
    parameters: Type.Object({
      agentId: Type.String({ description: "Agent ID" }),
    }),
    execute: async (_id, args) => {
      const apiKey = resolveApiKey(cfg);
      if (!apiKey) return jsonResult({ error: "SOKOSUMI_API_KEY not set." });
      const params = args as Record<string, unknown>;
      const agentId = readStringParam(params, "agentId", { required: true });
      const client = createSokosumiClient(apiKey, resolveBaseUrl(cfg));
      const res = await client.listJobs(agentId);
      if (!res.ok) return jsonResult({ error: res.error });
      return jsonResult(res.data.data);
    },
  };
}

function createSokosumiCreateJobTool(cfg?: OpenClawConfig): AnyAgentTool {
  return {
    name: "sokosumi_create_job",
    description:
      "Create a new job on a Sokosumi agent. First use sokosumi_get_input_schema to learn what input the agent expects, then pass it as JSON here.",
    parameters: Type.Object({
      agentId: Type.String({ description: "Agent ID to run the job on" }),
      input: Type.String({ description: "JSON string of the input data matching the agent's input schema" }),
    }),
    execute: async (_id, args) => {
      const apiKey = resolveApiKey(cfg);
      if (!apiKey) return jsonResult({ error: "SOKOSUMI_API_KEY not set." });
      const params = args as Record<string, unknown>;
      const agentId = readStringParam(params, "agentId", { required: true });
      const inputStr = readStringParam(params, "input", { required: true });

      let input: Record<string, unknown>;
      try {
        input = JSON.parse(inputStr) as Record<string, unknown>;
      } catch {
        return jsonResult({ error: "input must be valid JSON" });
      }

      const client = createSokosumiClient(apiKey, resolveBaseUrl(cfg));
      const res = await client.createJob(agentId, input);
      if (!res.ok) return jsonResult({ error: res.error });
      return jsonResult(res.data.data);
    },
  };
}

export function createSokosumiTools(cfg?: OpenClawConfig): AnyAgentTool[] {
  return [
    createSokosumiListAgentsTool(cfg),
    createSokosumiGetAgentTool(cfg),
    createSokosumiGetInputSchemaTool(cfg),
    createSokosumiListJobsTool(cfg),
    createSokosumiCreateJobTool(cfg),
  ];
}
