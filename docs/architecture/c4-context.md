# C4 System Context - DancesWithClaws (OpenClaw)

Logan (ELL - Exit Liquidity Lobster) is a Cardano-focused AI agent running on Moltbook, built on the OpenClaw platform.

## System Context Diagram

```mermaid
C4Context
  title System Context - DancesWithClaws (Logan)

  Person(user, "Human Users", "Interact via messaging platforms")
  Person(aiAgent, "AI Agents", "Other Moltbook agents that interact with Logan")

  System(openclaw, "DancesWithClaws", "Autonomous Cardano agent with 30-min heartbeat, RAG knowledge base, and multi-channel messaging")

  System_Ext(moltbook, "Moltbook", "Social network for AI agents")
  System_Ext(sokosumi, "Sokosumi Marketplace", "Cardano-based AI agent hiring platform")
  System_Ext(anthropic, "Anthropic API", "Claude Opus 4.5 (primary LLM)")
  System_Ext(openai, "OpenAI API", "text-embedding-3-small for RAG")
  System_Ext(google, "Google API", "Gemini models (fallback)")
  System_Ext(discord, "Discord", "Messaging platform")
  System_Ext(slack, "Slack", "Messaging platform")
  System_Ext(telegram, "Telegram", "Messaging platform")
  System_Ext(whatsapp, "WhatsApp", "Messaging via Baileys")

  Rel(user, discord, "Sends messages")
  Rel(user, slack, "Sends messages")
  Rel(user, telegram, "Sends messages")
  Rel(user, whatsapp, "Sends messages")

  Rel(discord, openclaw, "Routes messages", "WebSocket")
  Rel(slack, openclaw, "Routes messages", "Bolt API")
  Rel(telegram, openclaw, "Routes messages", "Bot API")
  Rel(whatsapp, openclaw, "Routes messages", "Baileys")

  Rel(openclaw, moltbook, "Posts content, reads feed", "REST/HTTPS")
  Rel(openclaw, sokosumi, "Hires sub-agents", "REST/HTTPS")
  Rel(openclaw, anthropic, "Generates responses", "REST/HTTPS")
  Rel(openclaw, openai, "Generates embeddings", "REST/HTTPS")
  Rel(openclaw, google, "Fallback LLM calls", "REST/HTTPS")

  Rel(aiAgent, moltbook, "Interacts via platform")
  Rel(moltbook, openclaw, "Delivers DMs, notifications", "REST/HTTPS")

  UpdateLayoutConfig($c4ShapeInRow="4", $c4BoundaryInRow="2")
```

## Overview

**Logan** is an autonomous agent for the Cardano ecosystem built on the OpenClaw platform. It runs 24/7, engaging with Moltbook every 30 minutes to scan feeds, generate posts, and interact with other agents.

**Users** interact with Logan through Discord, Slack, Telegram, WhatsApp, Signal, and other messaging platforms.

**AI agents** on Moltbook can engage with Logan's posts, follow it, and send direct messages.

## Systems

| System | Role |
|--------|------|
| **Moltbook** | Social network where Logan posts and scans feeds |
| **Anthropic API** | Claude Opus 4.5 for generating content |
| **OpenAI API** | text-embedding-3-small for vector embeddings |
| **Google API** | Fallback LLM (Gemini) if Anthropic unavailable |
| **Sokosumi** | Marketplace for delegating tasks to specialist agents |
| **Messaging platforms** | Discord, Slack, Telegram, WhatsApp, Signal, iMessage |

## Key Flows

**Heartbeat (every 30 minutes):**
1. Check agent status on Moltbook
2. Scan feed for recent posts
3. Search Cardano knowledge base (41 documents)
4. Generate post with Claude Opus 4.5
5. Publish to Moltbook
6. Log activity to workspace

**User message:**
1. Received via messaging platform
2. Routed through Gateway
3. Agent processes with tools and LLM
4. Response sent back through messaging platform

**Sokosumi delegation:**
When a task is too complex for Logan, it can hire specialist agents through the Sokosumi marketplace using on-chain payments (USDM stablecoins).
