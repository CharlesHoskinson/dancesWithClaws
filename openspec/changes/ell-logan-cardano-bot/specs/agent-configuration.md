# Agent Configuration — OpenClaw Setup

## Agent Identity

- **Agent ID:** `logan`
- **Display Name:** Logan
- **Codename:** ELL (Exit Liquidity Lobster)

## Model Configuration

- **Model:** `anthropic/claude-sonnet-4`
- **Rationale:** Cost-effective for maximum-volume 24/7 operation (~360-480 invocations/day across 24 hourly heartbeat cycles). Sonnet 4 provides strong reasoning for technical content while keeping API costs manageable at scale.

## Workspace Layout

```
C:\dancesWithClaws\workspace\
├── AGENT.md                          # Agent identity and instructions
├── HEARTBEAT.md                      # 1-hour cycle action sequence (24/7)
├── MEMORY.md                         # Persistent agent memory
├── skills/
│   └── moltbook-cardano/
│       ├── SKILL.md                  # Core skill definition
│       └── references/
│           ├── cardano-facts.md      # Technical facts & numbers
│           ├── moltbook-api.md       # API endpoint reference
│           ├── content-templates.md  # Post/comment templates
│           └── engagement-rules.md   # Decision tree for engagement
├── knowledge/                        # RAG knowledge base (see cardano-rag-database.md)
│   ├── fundamentals/
│   ├── governance/
│   ├── ecosystem/
│   ├── technical/
│   ├── history/
│   └── comparisons/
└── logs/
    └── daily/                        # Daily activity logs
```

## Environment Variables

| Variable | Purpose | Source |
|----------|---------|--------|
| `MOLTBOOK_API_KEY` | Moltbook API authentication | `POST /agents/register` response |

## Heartbeat Configuration

- **Interval:** Every 1 hour (24 cycles/day, 24/7 — no downtime)
- **Actions per cycle:** See `HEARTBEAT.md` and `heartbeat-scheduling.md`
- **Max tool calls per cycle:** ~15–20

## openclaw.json Configuration

```json5
{
  agents: {
    logan: {
      model: "anthropic/claude-sonnet-4",
      workspace: "./workspace",
      heartbeat: {
        interval: "1h",
        enabled: true
      },
      env: ["MOLTBOOK_API_KEY"],
      skills: ["moltbook-cardano"],
      memorySearch: {
        enabled: true,
        provider: "openai",
        model: "text-embedding-3-small",
        extraPaths: ["./knowledge"],
        query: {
          hybrid: {
            enabled: true,
            vectorWeight: 0.7,
            textWeight: 0.3,
            candidateMultiplier: 4
          }
        },
        cache: { enabled: true, maxEntries: 50000 }
      }
    }
  }
}
```

## Resource Estimates

| Resource | Daily Estimate |
|----------|---------------|
| Claude Sonnet 4 invocations | 360–480 |
| Moltbook API calls | 1500–2500 |
| Knowledge base queries | 360–480 |
| Embedding operations | ~50 (cached after first run) |
