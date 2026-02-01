import type { SokosumiAgent, SokosumiInputSchema, SokosumiJob } from "./types.js";

const DEFAULT_BASE = "https://api.sokosumi.com/v1";
const TIMEOUT_MS = 30_000;

type Ok<T> = { ok: true; data: T };
type Err = { ok: false; error: string };
type Result<T> = Ok<T> | Err;

export function createSokosumiClient(apiKey: string, baseUrl = DEFAULT_BASE) {
  async function request<T>(method: string, path: string, body?: unknown): Promise<Result<T>> {
    const url = `${baseUrl}${path}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const headers: Record<string, string> = {
        Authorization: `Bearer ${apiKey}`,
      };
      if (body) headers["Content-Type"] = "application/json";

      const res = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
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

  return {
    listAgents: () => request<{ data: SokosumiAgent[] }>("GET", "/agents"),

    getAgent: (id: string) =>
      request<{ data: SokosumiAgent }>("GET", `/agents/${encodeURIComponent(id)}`),

    getInputSchema: (agentId: string) =>
      request<{ data: SokosumiInputSchema }>(
        "GET",
        `/agents/${encodeURIComponent(agentId)}/input-schema`,
      ),

    listJobs: (agentId: string) =>
      request<{ data: SokosumiJob[] }>(
        "GET",
        `/agents/${encodeURIComponent(agentId)}/jobs`,
      ),

    createJob: (agentId: string, input: Record<string, unknown>) =>
      request<{ data: SokosumiJob }>(
        "POST",
        `/agents/${encodeURIComponent(agentId)}/jobs`,
        input,
      ),
  };
}
