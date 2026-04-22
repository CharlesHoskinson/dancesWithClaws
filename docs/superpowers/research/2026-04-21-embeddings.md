---
topic: Embeddings provider for Logan's Cardano RAG
date: 2026-04-21
status: research-complete
recommendation: swap to ollama/mxbai-embed-large (1024 dim)
confidence: 0.85
---

# Embeddings Provider Research — Logan

## Current Baseline

`openai/text-embedding-3-small` — 1536 dims, ~62.3 MTEB retrieval, $0.02 / 1M tokens, 8191-token input cap. Requires `OPENAI_API_KEY` which is the loose end we are closing.

## Local Candidates (Ollama, April 2026)

| Model               | Params | Dims              | Ctx | Disk      | MTEB retr.         | Notes                                              |
| ------------------- | ------ | ----------------- | --- | --------- | ------------------ | -------------------------------------------------- |
| `nomic-embed-text`  | 137M   | 768               | 2K  | ~300 MB   | 62.39              | Near-parity with OpenAI; lightweight               |
| `mxbai-embed-large` | 335M   | 1024              | 8K  | ~700 MB   | 64.68              | Beats `text-embedding-3-small`; best for tech docs |
| `embeddinggemma`    | 300M   | 768 (MRL→256/128) | 2K  | <200 MB Q | Top of <500M class | Newer, less prod validation; multilingual          |

(BGE-M3 ruled out: 568M / 1.2 GB, sparse+dense unnecessary for Logan.)

## Corpus Fit

41 Markdown files in `workspace/knowledge/`: Cardano protocol, governance, ecosystem, DeFi. Vocabulary like `Ouroboros`, `eUTxO`, `DReps`, `Plutus`, `CIP-xxxx`. Medium-length chunks. Monolingual English.

`mxbai-embed-large`'s 8K context and 1024 dims preserve fine-grained protocol distinctions better than `nomic-embed-text`'s 768 / 2K.

## Migration Cost

`src/memory/embeddings-ollama.ts` already exists with `DEFAULT_OLLAMA_EMBEDDING_MODEL = "nomic-embed-text"`. `src/agents/memory-search.ts` already branches on provider. `src/memory/sqlite-vec.ts` stores embeddings as `Float32Array` blobs — dimension-agnostic, no re-indexing migration needed.

Required changes:

- `openclaw.json` → `memorySearch.provider: "ollama"`, `memorySearch.model: "mxbai-embed-large"`
- `openclaw.json` → `env.vars.OPENAI_API_KEY` removable
- First RAG search triggers batch re-embedding (41 files, ~1–2 min)
- No code changes, no test changes beyond provider mocks

## Hybrid-Scoring Impact

Current: `vectorWeight: 0.7 / textWeight: 0.3`. Because `mxbai-embed-large` (64.68) > `text-embedding-3-small` (62.3), tightening to `0.75 / 0.25` is justified. For `nomic-embed-text`, keep 0.7/0.3 unchanged.

## Recommendation

**Swap to `ollama/mxbai-embed-large` (1024 dim). Confidence 0.85. Rollback = switch to `nomic-embed-text` (< 15 min).**

```json
"memorySearch": {
  "provider": "ollama",
  "model": "mxbai-embed-large",
  "query": { "hybrid": { "vectorWeight": 0.75, "textWeight": 0.25 } }
}
```

Rollback: set `model: "nomic-embed-text"`, revert weights to 0.7/0.3.
Escape hatch: retain OpenAI as a conditional fallback if retrieval quality regresses.

## Sources

- mxbai-embed-large — https://ollama.com/library/mxbai-embed-large
- nomic-embed-text — https://ollama.com/library/nomic-embed-text
- EmbeddingGemma — https://ai.google.dev/gemma/docs/embeddinggemma
- MTEB leaderboard March 2026 — https://awesomeagents.ai/leaderboards/embedding-model-leaderboard-mteb-march-2026/
- OpenAI pricing — https://developers.openai.com/api/docs/models/text-embedding-3-small
