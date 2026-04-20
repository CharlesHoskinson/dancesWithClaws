/**
 * Single-turn Logan loop.
 *
 * Step 1: Perplexity `sonar-pro` for research.
 * Step 2: Local Gemma (Ollama) to summarize in Logan's voice.
 * Step 3: POST to Moltbook to publish.
 *
 * Secrets are passed in as plain strings because by the time this function
 * runs they've already been unwrapped from HSM-sealed storage. The caller is
 * responsible for zeroing them after the call returns.
 */

import { readFileSync } from "node:fs";
import { request } from "undici";
import { generate } from "./ollama.js";

export class PerplexityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PerplexityError";
  }
}

export class MoltbookError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MoltbookError";
  }
}

export interface LoganRunOptions {
  readonly ollamaPort?: number;
  readonly ollamaModel?: string;
  readonly moltbookEndpoint?: string;
  readonly moltbookKey: string;
  readonly perplexityKey: string;
  readonly topic?: string;
  /** Path to Logan's SKILL.md — used to lift the voice/identity preamble. */
  readonly skillPath?: string;
}

export interface LoganRunResult {
  readonly researchSummary: string;
  readonly loganPost: string;
  readonly moltbookPostId: string;
}

const DEFAULT_TOPIC = "What is today's biggest Cardano governance story?";
const DEFAULT_MOLTBOOK_ENDPOINT = "https://www.moltbook.com/api/v1/posts";
const DEFAULT_OLLAMA_MODEL = "gemma4:e4b";
const DEFAULT_OLLAMA_PORT = 11434;

/**
 * Read the first N lines of SKILL.md so Gemma gets Logan's voice without
 * blowing the 8k context window. The Voice/Identity + Moltbook API sections
 * live in the first ~50 lines on this branch.
 */
export function loadLoganSystemPrompt(skillPath: string, maxLines = 50): string {
  const raw = readFileSync(skillPath, "utf-8");
  const lines = raw.split(/\r?\n/);
  const slice = lines.slice(0, maxLines).join("\n");
  return (
    `You are Logan, posting to Moltbook. Voice + constraints from your skill card:\n\n${slice}\n\n` +
    "When asked to summarize research, respond with ONLY the post content — no preamble, " +
    "no code fences, no meta commentary. Keep it under 220 characters."
  );
}

async function callPerplexity(apiKey: string, topic: string): Promise<string> {
  const body = {
    model: "sonar-pro",
    messages: [
      {
        role: "user",
        content: topic,
      },
    ],
  };
  const r = await request("https://api.perplexity.ai/chat/completions", {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
    headersTimeout: 30_000,
    bodyTimeout: 60_000,
  });
  const text = await r.body.text();
  if (r.statusCode < 200 || r.statusCode >= 300) {
    throw new PerplexityError(`Perplexity returned ${r.statusCode}: ${text}`);
  }
  const parsed = JSON.parse(text) as {
    readonly choices?: ReadonlyArray<{ readonly message?: { readonly content?: string } }>;
  };
  const content = parsed.choices?.[0]?.message?.content;
  if (typeof content !== "string" || content.length === 0) {
    throw new PerplexityError(`Perplexity returned no content: ${text}`);
  }
  return content;
}

async function callMoltbook(endpoint: string, apiKey: string, content: string): Promise<string> {
  const r = await request(endpoint, {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ content }),
    headersTimeout: 30_000,
    bodyTimeout: 30_000,
  });
  const text = await r.body.text();
  if (r.statusCode < 200 || r.statusCode >= 300) {
    throw new MoltbookError(`Moltbook returned ${r.statusCode}: ${text}`);
  }
  let parsed: { readonly id?: string | number; readonly post_id?: string | number };
  try {
    parsed = JSON.parse(text) as {
      readonly id?: string | number;
      readonly post_id?: string | number;
    };
  } catch {
    throw new MoltbookError(`Moltbook returned non-JSON: ${text}`);
  }
  const id = parsed.id ?? parsed.post_id;
  if (id === undefined) {
    throw new MoltbookError(`Moltbook response missing id/post_id: ${text}`);
  }
  return String(id);
}

export async function loganRun(opts: LoganRunOptions): Promise<LoganRunResult> {
  const topic = opts.topic ?? DEFAULT_TOPIC;
  const endpoint = opts.moltbookEndpoint ?? DEFAULT_MOLTBOOK_ENDPOINT;
  const model = opts.ollamaModel ?? DEFAULT_OLLAMA_MODEL;
  const port = opts.ollamaPort ?? DEFAULT_OLLAMA_PORT;

  // Step 1 — Perplexity research.
  const researchSummary = await callPerplexity(opts.perplexityKey, topic);

  // Step 2 — Gemma summarize in Logan's voice.
  const system = opts.skillPath
    ? loadLoganSystemPrompt(opts.skillPath)
    : "You are Logan, a Cardano educator who favors marine-biology analogies. " +
      "Respond with ONLY the post content, under 220 characters.";

  const userPrompt =
    "Summarize this for a Moltbook post, <=220 chars, marine-biology analogy if you can " +
    `work one in: ${researchSummary}`;

  const loganPost = (
    await generate(userPrompt, model, { port, system, temperature: 0.7, maxTokens: 180 })
  ).trim();

  // Step 3 — post to Moltbook.
  const moltbookPostId = await callMoltbook(endpoint, opts.moltbookKey, loganPost);

  return { researchSummary, loganPost, moltbookPostId };
}
