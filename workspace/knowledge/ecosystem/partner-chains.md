# Partner Chains on Cardano

## Overview

Partner chains represent Cardano's approach to ecosystem expansion through interconnected but independent blockchains that leverage Cardano's infrastructure, security, and liquidity. Unlike simple sidechains that merely run alongside a main chain, the partner chain framework provides a structured toolkit for building purpose-built blockchains that can inherit specific properties from Cardano — such as its stake pool operator network, consensus research, and cross-chain bridges — while maintaining their own governance, tokenomics, and feature sets.

The partner chain strategy acknowledges that no single blockchain can optimally serve all use cases. Privacy-focused applications, EVM-compatible environments, high-throughput gaming chains, and enterprise-specific networks each have different requirements that may conflict with the design constraints of a general-purpose Layer 1. Partner chains allow these specialized networks to exist within the broader Cardano ecosystem.

## Key Facts

- **Midnight:** A privacy-focused partner chain using zero-knowledge (ZK) cryptography, launched in December 2024 with over 100 partnerships (including Google Cloud) and more than 1,000 developers on testnet.
- **Milkomeda C1:** An EVM-compatible sidechain that has been live since April 2022, enabling Solidity smart contracts to operate within the Cardano ecosystem.
- **Cross-Chain Bridges:** ChainPort, Rosen Bridge, and Wanchain provide bridge infrastructure connecting Cardano with other blockchain ecosystems.
- **World Mobile:** A telecommunications project building decentralized mobile network infrastructure, using Cardano for identity, payments, and governance.
- **Partner Chain Framework:** A toolkit being developed to make it easier for teams to launch new partner chains that can leverage Cardano's infrastructure.

## Technical Details

### Midnight: Privacy-Focused Partner Chain

Midnight is the most high-profile partner chain in the Cardano ecosystem, designed to address the growing demand for data protection and regulatory compliance in blockchain applications.

**Zero-Knowledge Cryptography:** Midnight uses ZK proofs to enable transactions and computations that protect sensitive data. Users can prove certain properties about their data (e.g., "I am over 18" or "my account balance exceeds X") without revealing the underlying data. This has applications in:

- Regulatory compliance (KYC/AML) without exposing personal data publicly.
- Private business transactions where contract terms should not be visible to competitors.
- Healthcare and identity applications where data privacy is legally required.

**Launch and Ecosystem (December 2024):**

- Midnight launched its initial network in December 2024.
- Over 100 partnerships have been established, including a notable collaboration with Google Cloud for infrastructure and developer tooling.
- More than 1,000 developers have been active on the testnet, building privacy-preserving applications.
- The project uses a novel programming model that allows developers to specify which data should be public and which should remain private.

**Programming Model:** Midnight introduces a smart contract language (Compact) that allows developers to write programs where certain variables and computations are designated as private. The ZK proving system generates proofs that these private computations were performed correctly without revealing the private inputs.

**Relationship to Cardano:** Midnight leverages Cardano's SPO network for aspects of its security model and maintains bridge connectivity with the Cardano mainnet. ADA holders may benefit from the ecosystem expansion while Midnight users gain access to Cardano's existing DeFi and asset infrastructure.

### Milkomeda C1: EVM Compatibility

Milkomeda C1 has been operational since April 2022, providing EVM (Ethereum Virtual Machine) compatibility within the Cardano ecosystem.

**How It Works:**

- Milkomeda C1 runs a modified EVM that processes Solidity smart contracts.
- Users bridge ADA from the Cardano mainnet to Milkomeda, where it serves as the gas token (wrapped as milkADA).
- Developers can deploy existing Solidity contracts (originally written for Ethereum) on Milkomeda with minimal or no modifications.
- The chain uses its own validator set and consensus mechanism while maintaining a bridge to Cardano mainnet.

**Value Proposition:**

- Allows the Cardano ecosystem to access the large library of existing EVM-based DeFi protocols, tools, and developer knowledge.
- Provides an entry point for Solidity developers who want to build within the Cardano ecosystem without learning Plutus or Aiken.
- Enables cross-pollination between Cardano-native and EVM-based applications.

**Considerations:**

- Milkomeda C1 has its own security model that is separate from the Cardano mainnet. Users should understand the trust assumptions of the bridge and validator set.
- EVM compatibility means inheriting both the benefits (tooling, developer familiarity) and limitations (account-based model, MEV vulnerability) of the EVM architecture.

### Cross-Chain Bridges

Multiple bridge solutions connect Cardano to other blockchain ecosystems:

**ChainPort:**

- A cross-chain bridge platform that supports asset transfers between Cardano and multiple other blockchains including Ethereum, BNB Chain, Polygon, and others.
- Uses a custodial model with security measures including multi-signature validation and audited smart contracts.
- Enables tokens from other ecosystems to enter the Cardano DeFi ecosystem and vice versa.

**Rosen Bridge:**

- A bridge solution focused on connecting Cardano with Ergo and potentially other UTXO-based chains.
- Designed with the specific characteristics of the UTXO model in mind, potentially offering better integration with Cardano's eUTXO architecture.
- Community-driven development with a focus on decentralization.

**Wanchain:**

- A cross-chain infrastructure provider that has integrated Cardano into its network of supported blockchains.
- Uses a combination of secure multi-party computation (sMPC) and a decentralized network of bridge nodes.
- Supports cross-chain asset transfers and cross-chain messaging.

### World Mobile

World Mobile is a telecommunications project that intersects with the Cardano ecosystem:

- **Decentralized Telecommunications:** Building mobile network infrastructure using a mesh of local operators ("Earth Nodes") and user-operated access points ("Air Nodes").
- **Cardano Integration:** Uses Cardano for digital identity management, token-based payments, and governance of the network.
- **Target Markets:** Initially focused on underserved regions (particularly Sub-Saharan Africa) where traditional mobile network operators have not found it economically viable to build infrastructure.
- **Token Economy:** The WMT token, operating on Cardano, governs the network and incentivizes node operators.

### Partner Chain Framework

The broader partner chain framework being developed aims to provide:

- **Substrate-Based Toolkit:** Tools for launching new partner chains using substrate-based technology with Cardano-specific integrations.
- **Shared Security Options:** Configurable options for how much security a partner chain inherits from Cardano's mainnet (from full shared security to independent operation).
- **Bridge Templates:** Pre-built bridge components for connecting partner chains to the Cardano mainnet.
- **SPO Integration:** Mechanisms for Cardano stake pool operators to validate partner chains, extending Cardano's decentralized infrastructure to new networks.

## Common Misconceptions

**"Partner chains are just sidechains with a different name."** While related, the partner chain concept encompasses a broader range of relationships than traditional sidechains. Partner chains can have their own tokens, governance, and consensus mechanisms while selectively leveraging Cardano's infrastructure. The framework provides a spectrum of integration depths, from tightly coupled sidechains to loosely affiliated independent chains.

**"Midnight makes all Cardano transactions private."** Midnight is a separate network from the Cardano mainnet. It provides privacy features for applications built specifically on Midnight. The Cardano mainnet remains a transparent blockchain. Users who want privacy features would interact with Midnight; those who want transparency continue using the mainnet.

**"EVM compatibility makes Cardano's native smart contracts obsolete."** Milkomeda C1's EVM compatibility is complementary to, not a replacement for, Cardano's native Plutus/Aiken smart contracts. Native contracts benefit from the eUTXO model's determinism and formal verification. The EVM sidechain provides an additional option, especially for porting existing Ethereum applications. Both approaches serve different needs within the ecosystem.

**"Bridges are completely safe."** Cross-chain bridges carry inherent risks including smart contract vulnerabilities, validator collusion, and oracle manipulation. Bridge exploits have been among the most costly incidents in blockchain history. Users should understand the specific trust assumptions and security measures of each bridge before using it.

## Comparison Points

- **vs. Polkadot Parachains:** Polkadot parachains share security directly through the relay chain and communicate via XCM. Cardano partner chains have more flexibility in their security model but less built-in interoperability. Polkadot's parachain model is more structured; Cardano's partner chain approach is more open-ended.
- **vs. Cosmos Zones:** Cosmos zones are sovereign chains connected via IBC. Cardano's partner chain model is conceptually similar but uses different bridge technology and does not yet have an equivalent to IBC's standardized inter-chain communication.
- **vs. Ethereum L2s:** Ethereum L2s (rollups) derive security directly from Ethereum mainnet. Cardano partner chains may independently secure themselves, offering more design freedom but potentially weaker security guarantees.
- **Midnight vs. Other Privacy Solutions:** Midnight competes with Zcash (ZK-SNARKs), Monero (ring signatures), Secret Network (TEEs), and Aztec (ZK rollup on Ethereum). Midnight's differentiation is its programmable privacy model where developers explicitly choose what is public and what is private.

## Sources

- Midnight project documentation and announcements
- Milkomeda documentation (milkomeda.com)
- ChainPort, Rosen Bridge, and Wanchain documentation
- World Mobile project documentation
- IOG partner chain framework specifications
- Cardano partner chain research papers

## Last Updated

2025-02-01
