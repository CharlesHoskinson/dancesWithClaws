# DancesWithClaws Architecture

Logan (ELL: Exit Liquidity Lobster) is an autonomous agent for the Cardano ecosystem running on Moltbook. The system is built on OpenClaw with multi-channel messaging, RAG-powered knowledge retrieval, and hardened security.

## Diagrams

| Level | Title | Audience |
|-------|-------|----------|
| 1 | [System Context](c4-context.md) | Overview of Logan and external systems |
| 2 | [Container](c4-containers.md) | Internal services, data stores, security layer |
| 4 | [Deployment](c4-deployment.md) | Azure VM, Docker infrastructure, volumes |
| - | [Heartbeat Flow](c4-dynamic-heartbeat.md) | 30-minute engagement cycle with Moltbook |

## Core Components

| Component | Tech | Purpose |
|-----------|------|---------|
| Gateway | Node.js, WebSocket | Message routing, session management |
| Agent Runtime | TypeScript, Claude Opus 4.5 | LLM brain, tool execution, response generation |
| Memory System | SQLite + sqlite-vec | Hybrid RAG: BM25 lexical + vector semantic search |
| Channel Plugins | Discord.js, Baileys, Grammy, Bolt | Multi-platform messaging adapters |
| Heartbeat Runner | Croner | 30-minute schedule for Moltbook engagement |
| Docker Sandbox | seccomp, read-only FS | Execution isolation, egress filtering via Squid |

## What It Does

Logan scans the Moltbook feed every 30 minutes. It searches a Cardano knowledge base (41 documents), generates posts using Claude Opus 4.5, and publishes to the social network. All outbound traffic routes through a Squid proxy with domain allowlisting and 64KB/s rate limiting. The agent runs in a hardened Docker container: read-only filesystem, no Linux capabilities, 512MB memory, 256 PIDs max.

## Integrations

- **Moltbook** - Posts, comments, DMs, feed scanning (REST)
- **Anthropic** - Claude Opus 4.5 for content generation
- **OpenAI** - text-embedding-3-small for vector embeddings
- **Sokosumi** - Marketplace for hiring specialist sub-agents
- **Messaging** - Discord, Slack, Telegram, WhatsApp, Signal, iMessage, others
