import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

import { createSokosumiClient } from "./client.js";

function mockResponse(ok: boolean, data: unknown, status = 200) {
  fetchMock.mockResolvedValueOnce({
    ok,
    status,
    statusText: ok ? "OK" : "Error",
    json: async () => data,
    text: async () => (typeof data === "string" ? data : JSON.stringify(data)),
  });
}

describe("createSokosumiClient", () => {
  beforeEach(() => {
    fetchMock.mockReset();
  });

  it("uses default base URL", async () => {
    mockResponse(true, { data: [] });
    const client = createSokosumiClient("key-1");
    await client.listAgents();
    const url = fetchMock.mock.calls[0]?.[0] as string;
    expect(url).toBe("https://api.sokosumi.com/v1/agents");
  });

  it("uses custom base URL", async () => {
    mockResponse(true, { data: [] });
    const client = createSokosumiClient("key-1", "https://custom.api.com/v2");
    await client.listAgents();
    const url = fetchMock.mock.calls[0]?.[0] as string;
    expect(url).toBe("https://custom.api.com/v2/agents");
  });

  it("sends Bearer authorization header", async () => {
    mockResponse(true, { data: [] });
    const client = createSokosumiClient("secret-key");
    await client.listAgents();
    const headers = fetchMock.mock.calls[0]?.[1]?.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer secret-key");
  });

  describe("listAgents", () => {
    it("returns agents on success", async () => {
      const agents = [{ id: "a1", name: "Bot" }];
      mockResponse(true, { data: agents });
      const client = createSokosumiClient("key");
      const result = await client.listAgents();
      expect(result).toEqual({ ok: true, data: { data: agents } });
    });
  });

  describe("getAgent", () => {
    it("URL-encodes the agent ID", async () => {
      mockResponse(true, { data: {} });
      const client = createSokosumiClient("key");
      await client.getAgent("agent/special chars");
      const url = fetchMock.mock.calls[0]?.[0] as string;
      expect(url).toContain("/agents/agent%2Fspecial%20chars");
    });
  });

  describe("getInputSchema", () => {
    it("calls correct endpoint", async () => {
      mockResponse(true, { data: { type: "object", properties: {} } });
      const client = createSokosumiClient("key");
      await client.getInputSchema("agent-1");
      const url = fetchMock.mock.calls[0]?.[0] as string;
      expect(url).toContain("/agents/agent-1/input-schema");
    });
  });

  describe("listJobs", () => {
    it("calls correct endpoint", async () => {
      mockResponse(true, { data: [] });
      const client = createSokosumiClient("key");
      await client.listJobs("agent-1");
      const url = fetchMock.mock.calls[0]?.[0] as string;
      expect(url).toContain("/agents/agent-1/jobs");
      const opts = fetchMock.mock.calls[0]?.[1] as { method?: string };
      expect(opts.method).toBe("GET");
    });
  });

  describe("createJob", () => {
    it("sends POST with JSON body", async () => {
      mockResponse(true, { data: { id: "job-1", status: "started" } });
      const client = createSokosumiClient("key");
      await client.createJob("agent-1", { query: "hello" });
      const opts = fetchMock.mock.calls[0]?.[1] as {
        method?: string;
        headers?: Record<string, string>;
        body?: string;
      };
      expect(opts.method).toBe("POST");
      expect(opts.headers?.["Content-Type"]).toBe("application/json");
      expect(JSON.parse(opts.body!)).toEqual({ query: "hello" });
    });
  });

  describe("error handling", () => {
    it("returns error on non-ok response", async () => {
      mockResponse(false, "Forbidden", 403);
      const client = createSokosumiClient("bad-key");
      const result = await client.listAgents();
      expect(result).toEqual({ ok: false, error: "403: Forbidden" });
    });

    it("returns error on network failure", async () => {
      fetchMock.mockRejectedValueOnce(new Error("ECONNREFUSED"));
      const client = createSokosumiClient("key");
      const result = await client.listAgents();
      expect(result).toEqual({ ok: false, error: "ECONNREFUSED" });
    });

    it("handles non-Error throws gracefully", async () => {
      fetchMock.mockRejectedValueOnce("string error");
      const client = createSokosumiClient("key");
      const result = await client.listAgents();
      expect(result).toEqual({ ok: false, error: "Unknown error" });
    });

    it("clears timeout on successful response", async () => {
      const clearTimeoutSpy = vi.spyOn(globalThis, "clearTimeout");
      mockResponse(true, { data: [] });
      const client = createSokosumiClient("key");
      await client.listAgents();
      expect(clearTimeoutSpy).toHaveBeenCalled();
      clearTimeoutSpy.mockRestore();
    });
  });

  describe("abort signal", () => {
    it("passes AbortSignal to fetch", async () => {
      mockResponse(true, { data: [] });
      const client = createSokosumiClient("key");
      await client.listAgents();
      const opts = fetchMock.mock.calls[0]?.[1] as { signal?: AbortSignal };
      expect(opts.signal).toBeInstanceOf(AbortSignal);
    });
  });
});
