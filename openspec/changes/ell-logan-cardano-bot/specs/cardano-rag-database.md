# Cardano RAG Database — Knowledge Base

## Overview

Logan uses OpenClaw's built-in vector memory search (hybrid BM25 + semantic embeddings) as a RAG database populated with comprehensive Cardano knowledge. This ensures every post and comment is grounded in verified facts, not hallucination.

At maximum volume (20–30 posts, 300–500 comments/day, 24/7 operation), RAG grounding is critical — Logan cannot afford to make up facts when posting at this scale.

## Knowledge Base Structure

```
workspace/knowledge/
├── fundamentals/
│   ├── ouroboros-pos.md              # Ouroboros PoS protocol deep dive
│   ├── eutxo-model.md               # Extended UTXO accounting model
│   ├── plutus-smart-contracts.md     # Plutus platform & Haskell-based contracts
│   ├── marlowe-dsl.md               # Marlowe domain-specific language
│   ├── hydra-l2.md                  # Hydra head protocol (Layer 2 scaling)
│   ├── mithril.md                   # Mithril stake-based threshold multisig
│   ├── cardano-architecture.md      # Settlement + computation layer design
│   └── consensus-deep-dive.md       # Ouroboros evolution: Praos → Genesis → Leios → Omega
├── governance/
│   ├── voltaire-era.md              # Voltaire governance era overview
│   ├── cip-process.md               # Cardano Improvement Proposal process
│   ├── project-catalyst.md          # Project Catalyst treasury + voting
│   ├── dreps.md                     # Delegated Representatives system
│   ├── constitutional-committee.md  # On-chain governance structure
│   └── chang-hard-fork.md           # Chang hard fork & governance activation
├── ecosystem/
│   ├── defi-protocols.md            # Major DeFi protocols (SundaeSwap, Minswap, Liqwid, etc.)
│   ├── nft-ecosystem.md             # NFT standards, marketplaces, CIP-25/68
│   ├── stablecoins.md               # Djed, iUSD, USDM
│   ├── oracles.md                   # Charli3, Orcfax
│   ├── developer-tooling.md         # Aiken, Lucid, Blockfrost, Koios, Ogmios
│   ├── sidechains.md                # Sidechain concepts and security models
│   ├── real-world-adoption.md       # RealFi, Atala PRISM, Africa initiatives
│   ├── partner-chains.md            # Midnight, Milkomeda, cross-chain bridges
│   ├── wallets.md                   # Eternl, Nami, Typhon, Lace, hardware wallets
│   └── community-resources.md       # Essential Cardano, Intersect, Gimbalabs, communities
├── technical/
│   ├── formal-verification.md       # Formal methods in Cardano development
│   ├── haskell-foundation.md        # Why Haskell, functional programming benefits
│   ├── native-tokens.md             # Multi-asset ledger, native token model
│   ├── staking-delegation.md        # Liquid staking, stake pools, delegation
│   ├── network-parameters.md        # Key network stats, TPS, finality, fees
│   ├── security-model.md            # Security properties, attack resistance
│   ├── tokenomics.md                # ADA supply, inflation, treasury mechanics
│   └── interoperability-bridges.md  # ChainPort, Rosen, Wanchain, wrapped tokens
├── history/
│   ├── roadmap-eras.md              # Byron → Shelley → Goguen → Basho → Voltaire
│   ├── key-milestones.md            # Major launches, hard forks, dates
│   ├── iohk-emurgo-cf.md           # Founding entities and their roles
│   └── recent-developments.md       # 2024-2025: Chang fork, Voltaire, PlutusV3
└── comparisons/
    ├── vs-ethereum.md               # Fair technical comparison
    ├── vs-solana.md                 # Fair technical comparison
    ├── vs-bitcoin.md               # Fair technical comparison
    ├── pos-landscape.md            # PoS consensus comparison across chains
    └── competitive-advantages.md    # Consolidated "why Cardano" technical reference
```

**Total: 41 knowledge files** across 6 categories.

## OpenClaw RAG Configuration

In `openclaw.json` under the agent's `memorySearch` config:

```json5
{
  agents: {
    logan: {
      memorySearch: {
        enabled: true,
        provider: "openai",               // or "gemini" or "local"
        model: "text-embedding-3-small",
        extraPaths: ["./knowledge"],       // Index entire knowledge/ tree
        query: {
          hybrid: {
            enabled: true,
            vectorWeight: 0.7,             // Semantic similarity weight
            textWeight: 0.3,               // BM25 keyword weight
            candidateMultiplier: 4         // Retrieve 4x candidates before re-ranking
          }
        },
        cache: { enabled: true, maxEntries: 50000 }
      }
    }
  }
}
```

## How It Works

1. **Indexing:** `memorySearch.extraPaths: ["./knowledge"]` recursively indexes all `.md` files under `workspace/knowledge/`
2. **Hybrid Search:** Combines BM25 (keyword) + vector similarity (semantic) for both:
   - Semantic queries: "how does Cardano handle governance"
   - Exact-match queries: "CIP-1694", "Ouroboros Praos"
3. **Agent Usage:** Logan calls `memory_search` tool before generating any content
4. **Caching:** Embedding cache (SQLite-vec) avoids re-processing unchanged files
5. **Format:** Knowledge files are plain markdown — easy to update, version-control, review

## Content Generation Flow

```
1. Select content pillar for this heartbeat cycle
2. memory_search the knowledge base for relevant facts
3. Cross-reference with daily memory (avoid repeating recent topics)
4. Generate post/comment grounded in retrieved knowledge
5. Every factual claim is traceable to a knowledge file
```

At 300–500 comments/day, Logan queries the knowledge base 360–480 times per day. Caching and SQLite-vec acceleration keep this fast even at this volume.

## Population Strategy

### Phase 1: Manual Curation (Pre-Launch)
- Curate ~30 core knowledge files from:
  - Official Cardano documentation (docs.cardano.org)
  - IOG research papers and blog posts
  - CIP repository (Cardano Improvement Proposals)
  - Technical specifications and whitepapers
- Each file: 500–2000 words, well-structured markdown with headers
- Focus on factual, verifiable, non-opinion content

### Phase 2: Agent-Augmented Growth (Post-Launch)
- Logan discovers new topics through Moltbook discussions
- Appends notes and new facts to relevant knowledge files
- Creates new files for emerging topics not yet covered
- Flags uncertain claims for human review

### Phase 3: Periodic Human Review (Ongoing)
- Monthly review of knowledge base accuracy
- Add emerging developments (new hard forks, protocol upgrades)
- Remove outdated information
- Verify agent-added content for accuracy

## Knowledge File Template

```markdown
# [Topic Title]

## Overview
[2-3 sentence summary]

## Key Facts
- [Fact 1 with specific numbers/dates where applicable]
- [Fact 2]
- [Fact 3]

## Technical Details
[Detailed explanation, 200-500 words]

## Common Misconceptions
- Myth: [misconception]
  Reality: [correction]

## Comparison Points
[How this compares to equivalent features on other chains]

## Sources
- [Official doc or paper reference]
- [CIP reference if applicable]

## Last Updated
[Date]
```
