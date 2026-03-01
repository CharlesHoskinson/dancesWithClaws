# Cardano Key Milestones

## Overview

Cardano's history is marked by a series of carefully planned protocol upgrades, each delivered via the hard fork combinator (HFC) mechanism. Since the mainnet launch in September 2017, the network has undergone eight or more hard forks with zero network splits, chain rollbacks, or unplanned outages during transitions. This track record is a direct result of Cardano's formal methods approach: each upgrade is specified in peer-reviewed research, implemented with extensive property-based testing, and deployed first to public testnets before reaching mainnet.

This document catalogs the most significant milestones in Cardano's history, from the initial mainnet launch through the most recent governance and ecosystem developments in late 2024.

## Key Facts

### 2017: Foundation

- **September 29, 2017 — Mainnet Launch (Byron Era).** The Cardano mainnet went live, running the Ouroboros Classic proof-of-stake consensus protocol. The initial launch included the Byron-era ledger, the Ada cryptocurrency, and the Daedalus full-node wallet. Block production was federated among the three founding entities: IOG (then IOHK), EMURGO, and the Cardano Foundation. The launch followed approximately two years of development and a token sale that raised roughly $62 million in 2015-2017.

### 2020: Decentralization

- **February 2020 — Ouroboros BFT (OBFT) Transition.** A brief intermediate hard fork upgraded the consensus mechanism from Ouroboros Classic to Ouroboros BFT, streamlining block production in preparation for the Shelley upgrade. This transition was notable for being entirely seamless to end users.

- **July 29, 2020 — Shelley Hard Fork.** The network transitioned to Ouroboros Praos, enabling stake delegation and community-operated stake pools. Within weeks, hundreds of stake pools registered on mainnet. The d-parameter began its gradual journey from 1.0 to 0.0. This was the moment Cardano became a truly decentralized network.

- **December 2020 — Allegra Hard Fork.** Introduced token locking and time-lock script support, laying groundwork for the native tokens capability that would arrive shortly after.

### 2021: Smart Contracts and Native Tokens

- **March 1, 2021 — Mary Hard Fork (Native Tokens).** Cardano gained the ability to mint, burn, and transfer user-defined tokens natively on the ledger without requiring smart contracts. This approach reduced complexity and gas costs compared to token standards on other chains that require contract execution. Within months, thousands of native tokens and NFT collections emerged.

- **March 31, 2021 — D-Parameter Reaches Zero.** Block production became 100% decentralized, with all blocks produced by community stake pools. IOG, EMURGO, and the Cardano Foundation no longer produced blocks, marking a critical decentralization milestone.

- **September 12, 2021 — Alonzo Hard Fork (Smart Contracts).** Plutus smart contracts went live on mainnet, enabling decentralized applications (dApps), decentralized exchanges, lending protocols, and other programmable logic. The Alonzo upgrade was preceded by extensive testnet phases (Alonzo Blue, White, and Purple) and delivered the Extended UTXO (eUTXO) model to mainnet. The first Plutus scripts executed on-chain within minutes of the hard fork.

### 2022: Capability Expansion

- **June 2022 — Vasil Hard Fork.** Named after the late Vasil Dabov, a prominent Cardano community member, this upgrade brought significant Plutus performance improvements (reference inputs via CIP-31, inline datums via CIP-32, reference scripts via CIP-33), as well as diffusion pipelining for faster block propagation. These changes reduced transaction costs and script sizes, making dApp development substantially more practical.

### 2023: Scaling Infrastructure

- **May 2023 — First Hydra Head on Mainnet.** The Hydra layer-2 scaling protocol achieved its first functional Head on the Cardano mainnet. Hydra Heads are isomorphic state channels that process transactions off-chain while inheriting the security guarantees of the mainnet. This milestone demonstrated the viability of Cardano's primary scaling approach.

- **July 2023 — Mithril Reaches Mainnet.** Mithril, a stake-based threshold signature scheme, launched on mainnet. Mithril enables lightweight clients and services to verify chain state without downloading and validating the entire blockchain history. This dramatically reduces bootstrap times for wallets and services, from hours to minutes. Mithril snapshots are produced by stake pool operators participating in the signing protocol.

### 2024: Governance and Ecosystem Growth

- **February 2024 — PlutusV3 on Testnet.** The third generation of the Plutus smart contract platform reached the public testnet, introducing new cryptographic primitives (BLS12-381 curves, Keccak-256 hashing), sums-of-products encoding for more efficient data representation, and additional built-in functions. Testing indicated script execution cost reductions of 20-30% compared to PlutusV2 for common operations.

- **September 1, 2024 — Chang Hard Fork (Voltaire Governance).** The Chang hard fork activated CIP-1694 on-chain governance on mainnet. This introduced Delegated Representatives (DReps), a Constitutional Committee, and formal governance actions including protocol parameter changes, treasury withdrawals, hard fork initiation, and constitutional amendments. Ada holders gained direct or delegated voting power over the protocol's future. The Chang fork was the most significant governance upgrade in Cardano's history.

- **October 2024 — First On-Chain Governance Votes.** Following the Chang hard fork, the Cardano community conducted its first formal on-chain governance votes. DReps participated in voting on governance actions, marking the practical beginning of the Voltaire era's community-driven decision-making process.

- **December 2024 — Midnight Launch.** Midnight, a data-protection-focused partner chain built using Cardano technology, launched. Midnight uses zero-knowledge proofs to enable confidential smart contracts while maintaining regulatory compliance capabilities. It operates as a separate chain but shares infrastructure and research heritage with the Cardano ecosystem.

## Technical Details

The hard fork combinator (HFC) is the mechanism that enables all of these transitions. Developed by IOG, the HFC allows the Cardano node to understand the rules of multiple eras simultaneously. When a hard fork boundary is reached (at a specific epoch), the node seamlessly switches from the old era's rules to the new era's rules without requiring a network restart, chain split, or manual intervention by node operators.

Each hard fork is preceded by:

1. Research specification in peer-reviewed papers or CIPs (Cardano Improvement Proposals).
2. Implementation and internal testing.
3. Deployment to public testnets (preview and pre-production).
4. A formal hard fork date announcement with sufficient lead time.
5. Mainnet deployment at a specific epoch boundary.

The cumulative result of eight-plus hard forks with zero network splits is a testament to the robustness of this approach. For comparison, several other major blockchain networks have experienced unplanned chain splits or consensus failures during upgrades.

## Common Misconceptions

- **"Cardano launched with smart contracts."** Smart contracts arrived nearly four years after mainnet launch, with the Alonzo hard fork in September 2021. The intervening years were spent on decentralization (Shelley), native tokens (Mary), and foundational research.

- **"Cardano has never had a hard fork."** Cardano has had many hard forks — more than eight. The confusion arises because Cardano's hard forks are seamless and non-contentious, unlike the contentious hard forks seen in some other blockchain communities. The hard fork combinator makes them smooth transitions rather than disruptive events.

- **"The Vasil hard fork was delayed because of bugs."** The Vasil hard fork was delayed to allow additional testing and quality assurance. While some issues were found and resolved during the testnet phase, this is the expected purpose of a public testnet. The decision to delay was a deliberate choice to prioritize safety over speed.

- **"Hydra gives Cardano a million TPS on mainnet."** The frequently cited high-TPS figures for Hydra refer to throughput within individual Hydra Heads under specific conditions (such as simple transfer transactions). Mainnet layer-1 throughput is a separate measure. Hydra adds scalability by offloading transaction processing, not by increasing mainnet block sizes directly.

## Comparison Points

| Milestone Category        | Cardano           | Notable Comparison                   |
| ------------------------- | ----------------- | ------------------------------------ |
| Mainnet launch            | Sep 2017          | Ethereum: Jul 2015, Solana: Mar 2020 |
| Full decentralization     | Mar 2021 (d=0)    | Ethereum: PoS merge Sep 2022         |
| Smart contracts           | Sep 2021 (Alonzo) | Ethereum: at genesis (2015)          |
| Layer-2 scaling           | May 2023 (Hydra)  | Ethereum: various rollups 2021-2023  |
| On-chain governance       | Sep 2024 (Chang)  | Tezos: at genesis (2018)             |
| Hard forks without splits | 8+ consecutive    | Ethereum: ETH/ETC split (2016)       |

## Sources

- Cardano Mainnet Launch Announcement: https://iohk.io/en/blog/posts/2017/10/16/cardano-help-desk-tour-arrives-in-tokyo/
- Shelley Hard Fork: https://iohk.io/en/blog/posts/2020/07/28/the-shelley-hard-fork-is-here/
- Alonzo Hard Fork: https://iohk.io/en/blog/posts/2021/09/12/today-will-feel-satisfsatisfying-for-a-lot-of-people/
- Vasil Hard Fork: https://iohk.io/en/blog/posts/2022/09/16/vasil-what-to-expect/
- Chang Hard Fork (CIP-1694): https://cips.cardano.org/cip/CIP-1694
- Hydra Documentation: https://hydra.family
- Mithril Documentation: https://mithril.network

## Last Updated

2025-02-01
