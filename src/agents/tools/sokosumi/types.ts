export interface SokosumiAgent {
  id: string;
  name: string;
  description: string;
  apiBaseUrl: string;
  SmartContractAddress?: string;
  Tags?: string[];
  ExampleOutput?: string[];
  Capability?: {
    name: string;
    version: string;
  };
  AgentPricing?: Array<{
    unit: string;
    amount: string;
  }>;
  createdAt?: string;
  updatedAt?: string;
}

export type JobStatus =
  | "started"
  | "completed"
  | "processing"
  | "input_required"
  | "result_pending"
  | "failed"
  | "payment_pending"
  | "payment_failed"
  | "refund_pending"
  | "refund_resolved"
  | "dispute_pending"
  | "dispute_resolved";

export type JobType = "FREE" | "PAID" | "DEMO";

export interface SokosumiJob {
  id: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  agentId: string;
  userId: string;
  organizationId?: string;
  name?: string;
  jobType: JobType;
  status: JobStatus;
  credits?: number;
  result?: unknown;
  resultHash?: string;
}

export interface SokosumiInputSchema {
  type: string;
  properties: Record<string, unknown>;
  required?: string[];
}
