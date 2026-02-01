// Sokosumi marketplace tools for OpenClaw agents

import { Type } from "@sinclair/typebox";

import type { OpenClawConfig } from "../../config/config.js";
import type { AnyAgentTool } from "./common.js";
import { jsonResult, readNumberParam, readStringParam } from "./common.js";
import { createMasumiPaymentClient, type MasumiPaymentState } from "./sokosumi/payments.js";
import { createSokosumiClient } from "./sokosumi/client.js";
import type { SokosumiConfig } from "./sokosumi/types.js";

const SokosumiListAgentsSchema = Type.Object({});

const SokosumiHireAgentSchema = Type.Object({
  agentId: Type.String({ description: "Agent ID from Sokosumi marketplace" }),
  inputData: Type.String({ description: "JSON string containing input data for the agent" }),
  maxAcceptedCredits: Type.Number({
    description: "Maximum credits willing to pay for this job",
    minimum: 0,
  }),
  jobName: Type.Optional(Type.String({ description: "Optional name for the job" })),
  sharePublic: Type.Optional(
    Type.Boolean({ description: "Share job publicly on Sokosumi (default: false)" }),
  ),
  shareOrganization: Type.Optional(
    Type.Boolean({ description: "Share job with organization (default: false)" }),
  ),
});

const SokosumiCheckJobSchema = Type.Object({
  jobId: Type.String({ description: "Job ID from Sokosumi" }),
});

const SokosumiGetResultSchema = Type.Object({
  jobId: Type.String({ description: "Job ID from Sokosumi" }),
});

function resolveSokosumiConfig(cfg?: OpenClawConfig): SokosumiConfig | undefined {
  const sokosumi = cfg?.tools?.sokosumi;
  if (!sokosumi || typeof sokosumi !== "object") {
    return undefined;
  }
  return sokosumi as SokosumiConfig;
}

function isSokosumiEnabled(config?: SokosumiConfig): boolean {
  if (typeof config?.enabled === "boolean") {
    return config.enabled;
  }
  return false; // Disabled by default
}

function validateSokosumiConfig(
  config?: SokosumiConfig,
): { valid: true; config: Required<Pick<SokosumiConfig, "apiKey" | "apiEndpoint">> } | { valid: false; error: string } {
  const apiKeyFromConfig = config?.apiKey?.trim();
  const apiKeyFromEnv = (process.env.SOKOSUMI_API_KEY ?? "").trim();
  const apiKey = apiKeyFromConfig || apiKeyFromEnv;

  if (!apiKey) {
    return {
      valid: false,
      error:
        "Sokosumi API key is missing. Set tools.sokosumi.apiKey in your config or SOKOSUMI_API_KEY env var.",
    };
  }

  const apiEndpoint = config?.apiEndpoint || "https://sokosumi.com/api/v1";

  return {
    valid: true,
    config: {
      apiKey,
      apiEndpoint,
    },
  };
}

function validateMasumiConfig(
  config?: SokosumiConfig,
):
  | { valid: true; config: { serviceUrl: string; adminApiKey: string; network: "Preprod" | "Mainnet" } }
  | { valid: false; error: string } {
  if (!config?.payment) {
    return {
      valid: false,
      error:
        "Masumi payment service is not configured. Set tools.sokosumi.payment in your config.",
    };
  }

  if (!config.payment.serviceUrl) {
    return {
      valid: false,
      error:
        "Masumi payment service URL is missing. Set tools.sokosumi.payment.serviceUrl in your config.",
    };
  }

  if (!config.payment.adminApiKey) {
    return {
      valid: false,
      error:
        "Masumi admin API key is missing. Set tools.sokosumi.payment.adminApiKey in your config.",
    };
  }

  const network = config.payment.network || "Preprod";

  return {
    valid: true,
    config: {
      serviceUrl: config.payment.serviceUrl,
      adminApiKey: config.payment.adminApiKey,
      network,
    },
  };
}

/**
 * Tool: List available agents on Sokosumi marketplace
 */
export function createSokosumiListAgentsTool(cfg?: OpenClawConfig): AnyAgentTool {
  const sokosumiConfig = resolveSokosumiConfig(cfg);

  return {
    name: "sokosumi_list_agents",
    description: "List available AI agents on the Sokosumi marketplace that can be hired to perform tasks",
    schema: SokosumiListAgentsSchema,
    handler: async (_params) => {
      if (!isSokosumiEnabled(sokosumiConfig)) {
        return jsonResult({
          error: "sokosumi_disabled",
          message: "Sokosumi integration is disabled. Enable it in your config with tools.sokosumi.enabled: true",
        });
      }

      const configValidation = validateSokosumiConfig(sokosumiConfig);
      if (!configValidation.valid) {
        return jsonResult({
          error: "configuration_error",
          message: configValidation.error,
        });
      }

      const client = createSokosumiClient(configValidation.config);
      const result = await client.listAgents();

      if (!result.ok) {
        return jsonResult({
          error: result.error.type,
          message: result.error.message,
        });
      }

      // Format agents for display
      const formattedAgents = result.data.map((agent) => ({
        id: agent.id,
        name: agent.name,
        description: agent.description,
        capabilities: agent.capabilities || [],
        pricing: agent.pricing
          ? {
              type: agent.pricing.type,
              credits: agent.pricing.credits || 0,
            }
          : { type: "unknown", credits: 0 },
        author: agent.author?.name || "Unknown",
      }));

      return jsonResult({
        success: true,
        agents: formattedAgents,
        count: formattedAgents.length,
      });
    },
  };
}

/**
 * Tool: Hire a sub-agent from Sokosumi and create a job
 */
export function createSokosumiHireAgentTool(cfg?: OpenClawConfig): AnyAgentTool {
  const sokosumiConfig = resolveSokosumiConfig(cfg);

  return {
    name: "sokosumi_hire_agent",
    description:
      "Hire a sub-agent from Sokosumi marketplace to perform a task. Creates a job and handles payment via Masumi.",
    schema: SokosumiHireAgentSchema,
    handler: async (params: Record<string, unknown>) => {
      if (!isSokosumiEnabled(sokosumiConfig)) {
        return jsonResult({
          error: "sokosumi_disabled",
          message: "Sokosumi integration is disabled",
        });
      }

      const configValidation = validateSokosumiConfig(sokosumiConfig);
      if (!configValidation.valid) {
        return jsonResult({
          error: "configuration_error",
          message: configValidation.error,
        });
      }

      const masumiValidation = validateMasumiConfig(sokosumiConfig);
      if (!masumiValidation.valid) {
        return jsonResult({
          error: "payment_configuration_error",
          message: masumiValidation.error,
        });
      }

      // Parse parameters
      const agentId = readStringParam(params, "agentId", { required: true });
      const inputDataStr = readStringParam(params, "inputData", { required: true });
      const maxAcceptedCredits = readNumberParam(params, "maxAcceptedCredits", { required: true });
      const jobName = readStringParam(params, "jobName");
      const sharePublic = typeof params.sharePublic === "boolean" ? params.sharePublic : false;
      const shareOrganization =
        typeof params.shareOrganization === "boolean" ? params.shareOrganization : false;

      // Parse input data
      let inputData: Record<string, unknown>;
      try {
        inputData = JSON.parse(inputDataStr) as Record<string, unknown>;
      } catch {
        return jsonResult({
          error: "invalid_input",
          message: "inputData must be valid JSON",
        });
      }

      // Create Sokosumi client
      const sokosumiClient = createSokosumiClient(configValidation.config);

      // Create job on Sokosumi
      const jobResult = await sokosumiClient.createJob(agentId, {
        inputData,
        maxAcceptedCredits,
        name: jobName,
        sharePublic,
        shareOrganization,
      });

      if (!jobResult.ok) {
        return jsonResult({
          error: jobResult.error.type,
          message: jobResult.error.message,
        });
      }

      const job = jobResult.data;

      // If job requires payment, handle Masumi payment flow
      if (job.masumiJobId) {
        const masumiClient = createMasumiPaymentClient(masumiValidation.config);

        // Wait for payment to be locked
        const paymentResult = await masumiClient.waitForPaymentLocked(job.masumiJobId, {
          maxWaitMs: 300_000, // 5 minutes
          pollIntervalMs: 5_000, // 5 seconds
          onUpdate: (state: MasumiPaymentState) => {
            console.log(`Payment state: ${state}`);
          },
        });

        if (!paymentResult.ok) {
          return jsonResult({
            error: "payment_error",
            message:
              paymentResult.error.type === "timeout"
                ? "Payment not completed within 5 minutes"
                : paymentResult.error.message,
            jobId: job.id,
            status: "payment_pending",
          });
        }

        return jsonResult({
          success: true,
          jobId: job.id,
          agentId: job.agentId,
          status: "in_progress",
          paymentStatus: "locked",
          message: "Job created and payment locked. Agent is now working on your request.",
        });
      }

      // Free job (no payment required)
      return jsonResult({
        success: true,
        jobId: job.id,
        agentId: job.agentId,
        status: job.status,
        message: "Job created successfully (no payment required).",
      });
    },
  };
}

/**
 * Tool: Check job status on Sokosumi
 */
export function createSokosumiCheckJobTool(cfg?: OpenClawConfig): AnyAgentTool {
  const sokosumiConfig = resolveSokosumiConfig(cfg);

  return {
    name: "sokosumi_check_job",
    description: "Check the status of a job on Sokosumi marketplace",
    schema: SokosumiCheckJobSchema,
    handler: async (params: Record<string, unknown>) => {
      if (!isSokosumiEnabled(sokosumiConfig)) {
        return jsonResult({
          error: "sokosumi_disabled",
          message: "Sokosumi integration is disabled",
        });
      }

      const configValidation = validateSokosumiConfig(sokosumiConfig);
      if (!configValidation.valid) {
        return jsonResult({
          error: "configuration_error",
          message: configValidation.error,
        });
      }

      const jobId = readStringParam(params, "jobId", { required: true });

      const client = createSokosumiClient(configValidation.config);
      const result = await client.getJob(jobId);

      if (!result.ok) {
        return jsonResult({
          error: result.error.type,
          message: result.error.message,
        });
      }

      const job = result.data;

      return jsonResult({
        success: true,
        jobId: job.id,
        agentId: job.agentId,
        status: job.status,
        masumiJobStatus: job.masumiJobStatus,
        hasResult: !!job.result,
        result: job.result,
        createdAt: job.createdAt,
        updatedAt: job.updatedAt,
        completedAt: job.completedAt,
      });
    },
  };
}

/**
 * Tool: Get job result from Sokosumi
 */
export function createSokosumiGetResultTool(cfg?: OpenClawConfig): AnyAgentTool {
  const sokosumiConfig = resolveSokosumiConfig(cfg);

  return {
    name: "sokosumi_get_result",
    description: "Get the result of a completed job from Sokosumi marketplace",
    schema: SokosumiGetResultSchema,
    handler: async (params: Record<string, unknown>) => {
      if (!isSokosumiEnabled(sokosumiConfig)) {
        return jsonResult({
          error: "sokosumi_disabled",
          message: "Sokosumi integration is disabled",
        });
      }

      const configValidation = validateSokosumiConfig(sokosumiConfig);
      if (!configValidation.valid) {
        return jsonResult({
          error: "configuration_error",
          message: configValidation.error,
        });
      }

      const jobId = readStringParam(params, "jobId", { required: true });

      const client = createSokosumiClient(configValidation.config);
      const result = await client.getJob(jobId);

      if (!result.ok) {
        return jsonResult({
          error: result.error.type,
          message: result.error.message,
        });
      }

      const job = result.data;

      if (job.status !== "completed") {
        return jsonResult({
          error: "job_not_completed",
          message: `Job is not completed yet. Current status: ${job.status}`,
          jobId: job.id,
          status: job.status,
        });
      }

      if (!job.result) {
        return jsonResult({
          error: "no_result",
          message: "Job is marked as completed but has no result",
          jobId: job.id,
        });
      }

      return jsonResult({
        success: true,
        jobId: job.id,
        agentId: job.agentId,
        status: job.status,
        result: job.result,
        completedAt: job.completedAt,
      });
    },
  };
}

/**
 * Create all Sokosumi tools
 */
export function createSokosumiTools(cfg?: OpenClawConfig): AnyAgentTool[] {
  const sokosumiConfig = resolveSokosumiConfig(cfg);

  if (!isSokosumiEnabled(sokosumiConfig)) {
    return [];
  }

  return [
    createSokosumiListAgentsTool(cfg),
    createSokosumiHireAgentTool(cfg),
    createSokosumiCheckJobTool(cfg),
    createSokosumiGetResultTool(cfg),
  ];
}
