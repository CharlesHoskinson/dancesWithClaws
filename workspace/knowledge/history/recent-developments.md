# Cardano Recent Developments (2024-2025)

## Overview

The 2024-2025 period represents one of the most transformative phases in Cardano's history. The activation of on-chain governance through the Chang hard fork, the launch of PlutusV3 with meaningful cost reductions, significant DeFi growth, the debut of the Midnight partner chain, and continued scaling demonstrations via Hydra collectively mark Cardano's transition from a protocol-building phase to an ecosystem-maturation phase. This document provides a factual timeline and analysis of the major developments during this period.

## Key Facts

### Q1 2024: PlutusV3 and Governance Preparation

**PlutusV3 on Testnet (February 2024)**

The third major iteration of Cardano's smart contract platform reached the public testnet in February 2024. PlutusV3 introduced several important upgrades:

- **New Cryptographic Primitives.** Support for BLS12-381 elliptic curves enables efficient zero-knowledge proof verification on Cardano, opening the door to privacy-preserving applications and cross-chain bridges that rely on pairing-based cryptography. Keccak-256 hashing support improves interoperability with Ethereum-based systems, as Keccak-256 is the hash function underlying much of Ethereum's infrastructure.
- **Sums-of-Products Encoding.** A more efficient method for encoding algebraic data types in Plutus scripts, reducing the overhead of data serialization and deserialization within smart contracts.
- **Cost Reductions.** Benchmarks during the testnet phase showed script execution cost reductions of approximately 20-30% compared to PlutusV2 for common smart contract operations. This is a significant improvement for DeFi protocols and other dApps where transaction costs directly impact user experience and protocol viability.
- **Additional Built-in Functions.** New built-ins reduce the need for expensive on-chain computation by providing optimized implementations of frequently used operations.

PlutusV3 was subsequently deployed to mainnet as part of the broader protocol upgrade path in 2024.

### Q2-Q3 2024: The Chang Hard Fork and Governance Activation

**Chang Hard Fork (September 1, 2024)**

The Chang hard fork was the most consequential governance upgrade in Cardano's history. It activated the CIP-1694 on-chain governance framework on mainnet, fundamentally changing how protocol decisions are made.

Key governance features activated by Chang:

- **Delegated Representatives (DReps).** Ada holders can register as DReps or delegate their voting power to a DRep of their choice. This creates a liquid democracy model where participants can vote directly or delegate to representatives with relevant expertise.
- **Constitutional Committee.** A body responsible for ensuring that governance actions comply with the Cardano Constitution. The Constitutional Committee can approve or reject governance actions based on constitutional conformance.
- **Governance Actions.** Six types of on-chain governance actions became available: protocol parameter changes, hard fork initiation, treasury withdrawals, motion of no confidence (in the Constitutional Committee), update to the Constitutional Committee, and constitutional amendments.
- **Stake Pool Operator Governance Role.** SPOs serve as an additional governance check, particularly for critical actions like hard fork initiation.

The Chang fork deployed successfully with broad ecosystem support. Wallet providers, stake pool operators, exchanges, and dApp developers coordinated to ensure a smooth transition.

**First On-Chain Governance Votes (October 2024)**

Within weeks of the Chang hard fork, the Cardano community conducted its first formal on-chain governance votes. DReps cast votes on governance actions, establishing precedent for how the new governance system operates in practice. This was a significant milestone — Cardano moved from theoretical governance design to live, operational community decision-making.

### Q4 2024: Ecosystem Expansion

**Midnight Launch (December 2024)**

Midnight, a data-protection-focused partner chain, launched in December 2024. Key characteristics of Midnight include:

- **Zero-Knowledge Smart Contracts.** Midnight uses zero-knowledge proof technology to enable smart contracts that can process confidential data without revealing it on-chain. This addresses a critical limitation of transparent blockchains for enterprise and regulatory use cases.
- **Regulatory Compliance.** Midnight is designed to support selective disclosure, meaning users can prove compliance with regulatory requirements without exposing all underlying data.
- **Cardano Heritage.** While Midnight operates as a separate chain, it shares research heritage, development expertise, and ecosystem connections with Cardano. It was developed by IOG and benefits from Cardano's formal methods approach.

**USDA Stablecoin**

EMURGO's USDA stablecoin initiative continued to develop during this period. USDA is a fiat-backed stablecoin on the Cardano network, designed to provide a stable medium of exchange for DeFi protocols, remittances, and commercial transactions. The availability of a regulated, fiat-backed stablecoin is considered critical infrastructure for ecosystem growth. The broader stablecoin market on Cardano saw significant growth, with stablecoin market capitalization increasing approximately 66% during this period.

**Argentina Partnership**

Cardano established a notable partnership in Argentina, reflecting the project's longstanding focus on emerging markets and regions with challenging financial infrastructure. Argentina's high inflation environment and technologically literate population make it a natural fit for blockchain-based financial solutions. The partnership encompassed blockchain education, potential government use cases, and ecosystem development support.

**DeFi TVL Growth**

Cardano's DeFi ecosystem showed meaningful growth during this period. Total Value Locked (TVL) across Cardano DeFi protocols grew by approximately 13% quarter-over-quarter, driven by improved protocol tooling (PlutusV3 cost reductions), new protocol launches, and broader market dynamics. Major Cardano DeFi protocols contributing to this growth include decentralized exchanges (Minswap, SundaeSwap, WingRiders), lending platforms (Liqwid, Lenfi), and yield aggregators.

The DeFi growth is particularly notable because it occurred alongside the governance transition, demonstrating that the ecosystem can advance on multiple fronts simultaneously.

### Scaling Demonstrations

**Hydra Gaming Demo (1.04 Million TPS)**

A Hydra-based gaming demonstration achieved a throughput of 1.04 million transactions per second, showcasing the potential of Cardano's layer-2 scaling approach for high-frequency, low-latency applications. Key context for this figure:

- This throughput was achieved within a Hydra Head specifically optimized for the gaming use case.
- The transactions were lightweight game-state updates, not complex smart contract interactions.
- The demonstration illustrates the theoretical ceiling for Hydra throughput under favorable conditions, not typical mainnet usage.
- Real-world Hydra deployments will see variable throughput depending on transaction complexity, number of participants, and network conditions.

The gaming demo is significant because it demonstrates that Cardano's scaling architecture can support applications requiring extremely high throughput, such as real-time gaming, micropayments, and IoT data streaming.

## Technical Details

**PlutusV3 Performance Impact**

The 20-30% cost reduction in PlutusV3 is achieved through multiple optimizations:

- Sums-of-products encoding reduces the number of operations needed to construct and deconstruct data types.
- New built-in functions replace patterns that previously required expensive on-chain computation.
- BLS12-381 primitives are implemented as optimized native code rather than interpreted Plutus scripts.

For DeFi protocols, these cost reductions translate directly to lower fees for users and more efficient capital utilization. A DEX swap that cost X lovelace under PlutusV2 may cost 0.7X-0.8X lovelace under PlutusV3, all else being equal.

**Governance System Architecture**

The CIP-1694 governance system operates within the existing Cardano ledger. Governance actions are special transactions that, once submitted and ratified (through DRep votes, Constitutional Committee approval, and/or SPO votes depending on the action type), are automatically enacted by the ledger rules at the next epoch boundary. This means governance outcomes are enforced by the protocol itself, not by off-chain processes or trusted intermediaries.

The voting thresholds vary by action type. Critical actions like hard fork initiation require higher approval thresholds than routine parameter adjustments. The Constitutional Committee serves as a constitutional check, ensuring actions do not violate the foundational principles established in the Cardano Constitution.

## Common Misconceptions

- **"The Chang fork means Cardano governance is complete."** Chang activated the foundational governance mechanism, but governance is an ongoing process. The constitutional framework, DRep ecosystem, tooling, and community practices will continue to evolve. The Chang fork was the beginning of operational governance, not its completion.

- **"1.04 million TPS means Cardano processes 1 million transactions per second."** The Hydra gaming demo showed what is possible within a single optimized Hydra Head for lightweight transactions. Layer-1 mainnet throughput is a separate and much lower figure. Hydra adds scalability through parallelism (multiple Heads processing different transaction sets concurrently), not by increasing mainnet block capacity.

- **"PlutusV3 makes PlutusV2 obsolete."** PlutusV2 scripts continue to function on mainnet. PlutusV3 adds new capabilities and improves efficiency, but existing PlutusV2 dApps do not need to migrate immediately. Developers can choose to upgrade to take advantage of new features and cost savings.

- **"DeFi TVL growth means Cardano DeFi is risk-free."** TVL is a measure of capital locked in DeFi protocols. It does not indicate the absence of smart contract risk, market risk, or liquidity risk. Users should conduct their own research before interacting with any DeFi protocol.

## Comparison Points

| Development                   | Cardano (2024)        | Broader Context                             |
| ----------------------------- | --------------------- | ------------------------------------------- |
| On-chain governance           | Chang fork (CIP-1694) | Few L1s have binding on-chain governance    |
| Smart contract cost reduction | 20-30% (PlutusV3)     | Ethereum L2s also reducing costs via blobs  |
| L2 scaling demo               | 1.04M TPS (Hydra)     | Solana targets high L1 throughput instead   |
| Privacy chain                 | Midnight (ZK-based)   | Zcash, Secret Network also focus on privacy |
| Stablecoin growth             | +66% market cap       | Industry-wide stablecoin expansion in 2024  |

## Sources

- Chang Hard Fork Announcement: https://iog.io/en/blog/
- CIP-1694 Specification: https://cips.cardano.org/cip/CIP-1694
- PlutusV3 Documentation: https://plutus.readthedocs.io
- Hydra Documentation: https://hydra.family
- Midnight Website: https://midnight.network
- Cardano DeFi Metrics: https://defillama.com/chain/Cardano
- EMURGO USDA Information: https://emurgo.io
- Intersect Governance Resources: https://www.intersectmbo.org

## Last Updated

2025-02-01
