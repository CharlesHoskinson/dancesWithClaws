import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

import type { OpenClawConfig } from "../../config/config.js";
import { createSokosumiTools } from "./sokosumi-tools.js";

function makeConfig(overrides?: { apiKey?: string; apiEndpoint?: string }): OpenClawConfig {
  return {
    tools: {
      sokosumi: {
        apiKey: overrides?.apiKey ?? "test-key-123",
        ...(overrides?.apiEndpoint ? { apiEndpoint: overrides.apiEndpoint } : {}),
      },
    },
  } as OpenClawConfig;
}

function mockFetchOk(data: unknown) {
  fetchMock.mockResolvedValueOnce({
    ok: true,
    json: async () => ({ data }),
    text: async () => JSON.stringify({ data }),
  });
}

function mockFetchError(status: number, text: string) {
  fetchMock.mockResolvedValueOnce({
    ok: false,
    status,
    statusText: "Error",
    text: async () => text,
  });
}

describe("sokosumi tools", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    delete process.env.SOKOSUMI_API_KEY;
  });

  it("creates 5 tools", () => {
    const tools = createSokosumiTools(makeConfig());
    expect(tools).toHaveLength(5);
    const names = tools.map((t) => t.name);
    expect(names).toEqual([
      "sokosumi_list_agents",
      "sokosumi_get_agent",
      "sokosumi_get_input_schema",
      "sokosumi_list_jobs",
      "sokosumi_create_job",
    ]);
  });

  it("all tools have descriptions", () => {
    const tools = createSokosumiTools(makeConfig());
    for (const tool of tools) {
      expect(tool.description).toBeTruthy();
    }
  });

  describe("API key resolution", () => {
    it("returns error when no API key is configured", async () => {
      const tools = createSokosumiTools({} as OpenClawConfig);
      const result = await tools[0]!.execute("call1", {});
      expect(result.details).toMatchObject({
        error: "SOKOSUMI_API_KEY not set.",
      });
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("reads API key from config", async () => {
      mockFetchOk([]);
      const tools = createSokosumiTools(makeConfig({ apiKey: "cfg-key" }));
      await tools[0]!.execute("call1", {});
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const headers = fetchMock.mock.calls[0]?.[1]?.headers as Record<string, string>;
      expect(headers.Authorization).toBe("Bearer cfg-key");
    });

    it("falls back to SOKOSUMI_API_KEY env var", async () => {
      process.env.SOKOSUMI_API_KEY = "env-key";
      mockFetchOk([]);
      const tools = createSokosumiTools({} as OpenClawConfig);
      await tools[0]!.execute("call1", {});
      const headers = fetchMock.mock.calls[0]?.[1]?.headers as Record<string, string>;
      expect(headers.Authorization).toBe("Bearer env-key");
    });

    it("trims whitespace from API key", async () => {
      mockFetchOk([]);
      const tools = createSokosumiTools(makeConfig({ apiKey: "  trimmed-key  " }));
      await tools[0]!.execute("call1", {});
      const headers = fetchMock.mock.calls[0]?.[1]?.headers as Record<string, string>;
      expect(headers.Authorization).toBe("Bearer trimmed-key");
    });
  });

  describe("custom API endpoint", () => {
    it("uses default endpoint when not configured", async () => {
      mockFetchOk([]);
      const tools = createSokosumiTools(makeConfig());
      await tools[0]!.execute("call1", {});
      const url = fetchMock.mock.calls[0]?.[0] as string;
      expect(url).toBe("https://api.sokosumi.com/v1/agents");
    });

    it("uses custom endpoint from config", async () => {
      mockFetchOk([]);
      const tools = createSokosumiTools(
        makeConfig({ apiEndpoint: "https://custom.example.com/v2" }),
      );
      await tools[0]!.execute("call1", {});
      const url = fetchMock.mock.calls[0]?.[0] as string;
      expect(url).toBe("https://custom.example.com/v2/agents");
    });
  });

  describe("sokosumi_list_agents", () => {
    it("returns agent list on success", async () => {
      const agents = [{ id: "a1", name: "Agent One" }];
      mockFetchOk(agents);
      const tools = createSokosumiTools(makeConfig());
      const result = await tools[0]!.execute("call1", {});
      expect(result.details).toEqual(agents);
    });

    it("returns error on API failure", async () => {
      mockFetchError(500, "Internal Server Error");
      const tools = createSokosumiTools(makeConfig());
      const result = await tools[0]!.execute("call1", {});
      expect(result.details).toMatchObject({
        error: "500: Internal Server Error",
      });
    });
  });

  describe("sokosumi_get_agent", () => {
    it("fetches agent by ID", async () => {
      const agent = { id: "agent-42", name: "Research Bot" };
      mockFetchOk(agent);
      const tools = createSokosumiTools(makeConfig());
      const result = await tools[1]!.execute("call1", { agentId: "agent-42" });
      expect(result.details).toEqual(agent);
      const url = fetchMock.mock.calls[0]?.[0] as string;
      expect(url).toContain("/agents/agent-42");
    });

    it("URL-encodes agent IDs", async () => {
      mockFetchOk({});
      const tools = createSokosumiTools(makeConfig());
      await tools[1]!.execute("call1", { agentId: "id with spaces/slashes" });
      const url = fetchMock.mock.calls[0]?.[0] as string;
      expect(url).toContain("/agents/id%20with%20spaces%2Fslashes");
    });
  });

  describe("sokosumi_get_input_schema", () => {
    it("returns input schema for agent", async () => {
      const schema = {
        type: "object",
        properties: { query: { type: "string" } },
      };
      mockFetchOk(schema);
      const tools = createSokosumiTools(makeConfig());
      const result = await tools[2]!.execute("call1", { agentId: "agent-1" });
      expect(result.details).toEqual(schema);
      const url = fetchMock.mock.calls[0]?.[0] as string;
      expect(url).toContain("/agents/agent-1/input-schema");
    });
  });

  describe("sokosumi_list_jobs", () => {
    it("lists jobs for an agent", async () => {
      const jobs = [{ id: "job-1", status: "completed" }];
      mockFetchOk(jobs);
      const tools = createSokosumiTools(makeConfig());
      const result = await tools[3]!.execute("call1", { agentId: "agent-1" });
      expect(result.details).toEqual(jobs);
      const url = fetchMock.mock.calls[0]?.[0] as string;
      expect(url).toContain("/agents/agent-1/jobs");
    });
  });

  describe("sokosumi_create_job", () => {
    it("creates a job with valid JSON input", async () => {
      const job = { id: "job-new", status: "started" };
      mockFetchOk(job);
      const tools = createSokosumiTools(makeConfig());
      const result = await tools[4]!.execute("call1", {
        agentId: "agent-1",
        input: '{"query": "hello"}',
      });
      expect(result.details).toEqual(job);
      const url = fetchMock.mock.calls[0]?.[0] as string;
      expect(url).toContain("/agents/agent-1/jobs");
      const opts = fetchMock.mock.calls[0]?.[1] as {
        method?: string;
        body?: string;
      };
      expect(opts.method).toBe("POST");
      expect(JSON.parse(opts.body!)).toEqual({ query: "hello" });
    });

    it("returns error for invalid JSON input", async () => {
      const tools = createSokosumiTools(makeConfig());
      const result = await tools[4]!.execute("call1", {
        agentId: "agent-1",
        input: "not valid json",
      });
      expect(result.details).toMatchObject({
        error: "input must be valid JSON",
      });
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("sends Authorization header and Content-Type", async () => {
      mockFetchOk({});
      const tools = createSokosumiTools(makeConfig({ apiKey: "my-key" }));
      await tools[4]!.execute("call1", {
        agentId: "agent-1",
        input: '{"data": true}',
      });
      const headers = fetchMock.mock.calls[0]?.[1]?.headers as Record<string, string>;
      expect(headers.Authorization).toBe("Bearer my-key");
      expect(headers["Content-Type"]).toBe("application/json");
    });
  });

  describe("network error handling", () => {
    it("returns error on fetch failure", async () => {
      fetchMock.mockRejectedValueOnce(new Error("Network unreachable"));
      const tools = createSokosumiTools(makeConfig());
      const result = await tools[0]!.execute("call1", {});
      expect(result.details).toMatchObject({ error: "Network unreachable" });
    });
  });
});
