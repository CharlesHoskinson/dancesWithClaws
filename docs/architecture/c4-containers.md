# C4 Container Diagram - DancesWithClaws (OpenClaw)

Shows the high-level technology choices and how containers communicate.

## Container Diagram

```mermaid
C4Container
  title Container Diagram - DancesWithClaws

  Person(user, "User", "Interacts via messaging")
  Person(aiAgent, "AI Agent", "Moltbook agent")

  System_Ext(moltbook, "Moltbook API", "Agent social network")
  System_Ext(llmProvider, "LLM Providers", "OpenAI, Anthropic, Google")
  System_Ext(sokosumi, "Sokosumi", "Agent marketplace")

  Container_Boundary(openclaw, "DancesWithClaws System") {
    Container(gateway, "Gateway Service", "Node.js, WebSocket", "Routes messages between channels and agents, manages sessions")
    Container(agent, "Agent Runtime", "TypeScript, Pi-Agent", "Logan agent with Claude Opus 4.5, executes heartbeat cycles")
    Container(memory, "Memory System", "SQLite, sqlite-vec", "Hybrid RAG with BM25 + vector search, 50K entry cache")
    Container(channels, "Channel Plugins", "TypeScript", "Discord, Slack, Telegram, WhatsApp adapters")
    Container(heartbeat, "Heartbeat Runner", "Croner", "30-minute scheduled tasks for Moltbook engagement")
    ContainerDb(knowledge, "Knowledge Base", "Markdown, YAML", "41 Cardano documents for RAG retrieval")
    ContainerDb(workspace, "Workspace", "Files", "Logs, skills, sessions, agent config")
  }

  Container_Boundary(security, "Security Layer") {
    Container(sandbox, "Docker Sandbox", "Docker, seccomp", "Read-only FS, dropped capabilities, PID/memory limits")
    Container(proxy, "Squid Proxy", "Alpine, Squid", "Domain allowlist, 64KB/s rate limit, egress filtering")
  }

  Rel(user, channels, "Sends messages", "Platform SDK")
  Rel(aiAgent, moltbook, "Posts, comments")
  Rel(channels, gateway, "Routes normalized messages", "WebSocket :18789")
  Rel(gateway, agent, "Dispatches to agent", "Internal")
  Rel(agent, memory, "Searches knowledge", "memory_search tool")
  Rel(memory, knowledge, "Reads documents", "Hybrid search")
  Rel(agent, workspace, "Reads/writes logs", "File I/O")
  Rel(heartbeat, agent, "Triggers cycles", "Cron schedule")
  Rel(agent, proxy, "External HTTP calls", "HTTP :3128")
  Rel(proxy, moltbook, "Filtered requests", "HTTPS")
  Rel(proxy, llmProvider, "LLM API calls", "HTTPS")
  Rel(proxy, sokosumi, "Agent hiring", "HTTPS")
  Rel(sandbox, agent, "Isolates execution", "Container")

  UpdateLayoutConfig($c4ShapeInRow="3", $c4BoundaryInRow="1")
```

## Services

**Gateway Service** (Node.js, WebSocket)
- Receives messages from channel plugins on `:18789` (WebSocket) and `:18790` (HTTP)
- Parses session keys to route to the correct agent
- Manages concurrent chat sessions

**Agent Runtime** (TypeScript, Pi-Agent-Core)
- Runs Claude Opus 4.5 for all LLM calls
- Executes tools: memory_search, exec (curl), browser automation (denied in production)
- Manages conversation state and context
- Handles the 30-minute Moltbook heartbeat

**Memory System** (SQLite + sqlite-vec)
- Hybrid search: BM25 (lexical) + vector embeddings (semantic)
- Caches up to 50K entries for fast retrieval
- Uses OpenAI's text-embedding-3-small for vector generation
- Queries the Knowledge Base during heartbeat and user messages

**Channel Plugins** (TypeScript)
- Discord.js integration
- Baileys for WhatsApp (reverse-engineered protocol)
- Grammy (Telegram Bot API)
- Slack Bolt framework
- Others: Signal, iMessage via BlueBubbles, LINE, Zalo, Mattermost, Matrix

**Knowledge Base** (Markdown files, 41 documents)
- Fundamentals: Ouroboros, eUTXO, Plutus, Marlowe, Hydra, Mithril
- Governance: Voltaire era, CIP process, Project Catalyst, DReps
- DeFi: Minswap, SundaeSwap, oracles, staking, liquidity pools
- History: roadmap, milestones, organizations, comparisons (vs Ethereum/Solana/Bitcoin)

**Workspace** (File system)
- `logs/daily/YYYY-MM-DD.md` - Daily activity log from heartbeat cycles
- `skills/` - Agent-specific skill definitions
- `sessions/` - Persistent chat state across restarts
- `openclaw.json` - Agent configuration

## Security Layer

**Docker Sandbox**
- Container runs with read-only root filesystem (`/` is mounted read-only)
- All Linux capabilities dropped (`--cap-drop=ALL`)
- seccomp filter loaded (`security/seccomp-sandbox.json`)
- 512MB RAM limit, 256 PID limit
- Non-root user (no `root` permission)
- Timeout: 300 seconds per tool call

**Squid Proxy** (Alpine Linux)
- Runs inside `oc-sandbox-net` Docker bridge network at `172.30.0.10:3128`
- Domain whitelist only (allowlist in `security/proxy/squid.conf`)
- Rate limiting: 64 KB/s sustained bandwidth
- All agent egress traffic flows through this proxy
- Blocks unknown domains, stops data exfiltration

## Data Flow

Inbound message:
```
User (Discord/Slack/etc)
  → Channel Plugin (adapts to OpenClaw message format)
  → Gateway WebSocket (:18789)
  → Session key routing
  → Agent Runtime
  → LLM call (via Squid Proxy → Anthropic API)
  → Response generation
  → Channel Plugin (translates back to platform format)
  → User receives reply
```

Heartbeat cycle:
```
Croner scheduler (30 min intervals)
  → Agent Runtime
  → Query Moltbook API (via Squid → moltbook.com)
  → Search Memory System (memory_search tool)
  → Query Knowledge Base with hybrid RAG
  → LLM call: generate post content
  → POST to Moltbook API (via Squid)
  → Append to daily log in Workspace
```

Tool execution:
```
Agent calls memory_search
  → Memory System queries SQLite
  → BM25 + vector search on Knowledge Base
  → Returns top-k results
  → Agent receives result

Agent calls exec (curl)
  → Sandboxed curl process spawned
  → Process makes HTTP request through Squid Proxy
  → Response returned to agent
  → Process terminated
```
