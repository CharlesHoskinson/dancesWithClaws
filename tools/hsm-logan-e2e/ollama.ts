/**
 * Ollama bring-up helper for the Logan E2E harness.
 *
 * We don't spawn `ollama serve` ourselves — the operator's install lives in
 * scoop and is already running as a service. We only probe, and if it's
 * down we throw with a clear message so the operator knows to start it.
 */

import { request } from "undici";

export class OllamaNotRunning extends Error {
  constructor(port: number, cause?: unknown) {
    super(
      `Ollama is not reachable on http://127.0.0.1:${port}. ` +
        `Start it with 'ollama serve' (or the scoop service) and retry.`,
    );
    this.name = "OllamaNotRunning";
    if (cause !== undefined) {
      (this as { cause?: unknown }).cause = cause;
    }
  }
}

export class OllamaModelPullFailed extends Error {
  constructor(model: string, detail: string) {
    super(`failed to pull Ollama model '${model}': ${detail}`);
    this.name = "OllamaModelPullFailed";
  }
}

export interface EnsureOllamaRunningOptions {
  readonly port?: number;
}

function baseUrl(port: number): string {
  return `http://127.0.0.1:${port}`;
}

/**
 * HEAD-check `/api/tags`. Ollama returns 200 with a JSON list when alive.
 * Any connect error / non-2xx throws OllamaNotRunning.
 */
export async function ensureOllamaRunning(opts: EnsureOllamaRunningOptions = {}): Promise<void> {
  const port = opts.port ?? 11434;
  try {
    const r = await request(`${baseUrl(port)}/api/tags`, {
      method: "GET",
      headersTimeout: 2_000,
      bodyTimeout: 2_000,
    });
    // Drain the body so the socket can be pooled.
    await r.body.text();
    if (r.statusCode < 200 || r.statusCode >= 300) {
      throw new OllamaNotRunning(port, `status=${r.statusCode}`);
    }
  } catch (e) {
    if (e instanceof OllamaNotRunning) {
      throw e;
    }
    throw new OllamaNotRunning(port, e);
  }
}

export interface EnsureModelPulledOptions {
  readonly port?: number;
  /** Emit progress lines during a pull. Defaults to no-op. */
  readonly onProgress?: (line: string) => void;
}

/**
 * GET /api/show?name=<model> — Ollama returns 200 when the model exists, 404
 * when it doesn't. On 404 we POST /api/pull and stream the NDJSON progress.
 */
export async function ensureModelPulled(
  model: string,
  opts: EnsureModelPulledOptions = {},
): Promise<void> {
  const port = opts.port ?? 11434;
  const showUrl = `${baseUrl(port)}/api/show`;
  const show = await request(showUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: model }),
    headersTimeout: 10_000,
    bodyTimeout: 10_000,
  });
  // Drain so we can reuse the connection.
  await show.body.text();
  if (show.statusCode >= 200 && show.statusCode < 300) {
    return;
  }
  if (show.statusCode !== 404) {
    throw new OllamaModelPullFailed(model, `/api/show status=${show.statusCode}`);
  }

  const pull = await request(`${baseUrl(port)}/api/pull`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: model, stream: true }),
    headersTimeout: 10_000,
    // Pulls can take a while; disable body timeout.
    bodyTimeout: 0,
  });
  if (pull.statusCode < 200 || pull.statusCode >= 300) {
    const detail = await pull.body.text();
    throw new OllamaModelPullFailed(model, `/api/pull status=${pull.statusCode} body=${detail}`);
  }
  // Stream NDJSON lines through the progress callback. Ollama emits one JSON
  // object per line with `{status, completed, total, ...}` fields.
  let buffer = "";
  for await (const chunk of pull.body) {
    buffer += typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf-8");
    let idx = buffer.indexOf("\n");
    while (idx !== -1) {
      const line = buffer.slice(0, idx).trim();
      buffer = buffer.slice(idx + 1);
      if (line.length > 0 && opts.onProgress) {
        opts.onProgress(line);
      }
      idx = buffer.indexOf("\n");
    }
  }
  if (buffer.trim().length > 0 && opts.onProgress) {
    opts.onProgress(buffer.trim());
  }
}

export interface GenerateOptions {
  readonly port?: number;
  readonly system?: string;
  readonly temperature?: number;
  readonly maxTokens?: number;
}

export interface OllamaGenerateResponse {
  readonly response: string;
}

/**
 * Single-shot text generation. `stream:false` keeps the plumbing simple; the
 * E2E harness only needs one response per turn.
 */
export async function generate(
  prompt: string,
  model: string,
  opts: GenerateOptions = {},
): Promise<string> {
  const port = opts.port ?? 11434;
  const body: Record<string, unknown> = {
    model,
    prompt,
    stream: false,
  };
  if (opts.system !== undefined) {
    body["system"] = opts.system;
  }
  const optionsBlock: Record<string, unknown> = {};
  if (opts.temperature !== undefined) {
    optionsBlock["temperature"] = opts.temperature;
  }
  if (opts.maxTokens !== undefined) {
    // Ollama calls this `num_predict`.
    optionsBlock["num_predict"] = opts.maxTokens;
  }
  if (Object.keys(optionsBlock).length > 0) {
    body["options"] = optionsBlock;
  }
  const r = await request(`${baseUrl(port)}/api/generate`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    // On CPU with a 4B+ model, a cold prompt-ingestion can exceed 60s; the
    // body itself can take minutes. Both timeouts generously sized.
    headersTimeout: 600_000,
    bodyTimeout: 600_000,
  });
  const text = await r.body.text();
  if (r.statusCode < 200 || r.statusCode >= 300) {
    throw new Error(`Ollama /api/generate failed: status=${r.statusCode} body=${text}`);
  }
  const parsed = JSON.parse(text) as OllamaGenerateResponse;
  return parsed.response ?? "";
}
