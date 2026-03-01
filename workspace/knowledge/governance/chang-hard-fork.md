# Chang Hard Fork

## Overview

The Chang hard fork was a landmark upgrade to the Cardano blockchain, activated on September 1, 2024. Named in honor of Phil Chang, a member of the Cardano community who passed away and was recognized for his contributions to the governance vision, this hard fork marked the beginning of the Voltaire era of decentralized governance. The Chang hard fork holds a unique distinction in Cardano's history: it was the first hard fork that was not controlled by the founding entities (Input Output Global, the Cardano Foundation, and EMURGO). Instead, it was the product of community coordination and the decentralized governance process that Cardano had been building toward since its inception.

The upgrade introduced two major categories of changes: governance infrastructure enabling on-chain decision-making, and technical improvements to the Plutus smart contract platform. For end users, stakers, and most application developers, the transition was seamless, requiring no action and causing no disruption to normal blockchain operations.

## Key Facts

- **Activation date**: September 1, 2024.
- **Era transition**: Initiated the Voltaire era (from the Babbage era).
- **Naming**: Named after Phil Chang, a Cardano community member who contributed to governance design.
- **First decentralized hard fork**: The first Cardano hard fork not directly controlled by the founding entities.
- **PlutusV3**: Introduced the third major version of the Plutus smart contract execution environment, with 20-30% cost reductions for smart contract execution.
- **Governance infrastructure**: Deployed the on-chain governance mechanisms specified in CIP-1694, including DRep registration and delegation, Constitutional Committee operations, on-chain voting, and governance action submission.
- **User impact**: Seamless for end users. No wallet migrations, token transfers, or manual interventions were required.
- **Node version**: Required Cardano node operators and stake pool operators to upgrade to a compatible node version prior to the hard fork boundary.

## Technical Details

### Hard Fork Combinator

Cardano uses a mechanism called the Hard Fork Combinator (HFC) to manage protocol upgrades. Unlike many blockchains where hard forks carry significant risk of chain splits, the HFC allows Cardano to transition between protocol versions smoothly:

- The HFC combines the rules of the old and new protocol versions into a single node implementation.
- The transition is triggered at a specific epoch boundary when predefined conditions are met.
- Nodes running the updated software automatically switch to the new protocol rules at the boundary.
- Nodes that have not upgraded simply stop producing blocks but do not create a competing chain.

This mechanism has been used successfully for all of Cardano's previous era transitions (Byron to Shelley, Shelley to Allegra, Allegra to Mary, Mary to Alonzo, Alonzo to Babbage, and now Babbage to Conway/Voltaire).

### PlutusV3 Improvements

One of the most significant technical changes in the Chang hard fork was the introduction of PlutusV3, the third generation of Cardano's smart contract execution platform. Key improvements include:

**Cost Reductions (20-30%)**

- Optimized execution costs for common smart contract operations.
- Reduced memory and CPU budgets required for typical DeFi transactions.
- Lower costs make complex smart contract interactions more economically viable, benefiting DeFi protocols, DEXes, and other on-chain applications.

**New Built-in Functions**
PlutusV3 introduced several new built-in functions that expand smart contract capabilities:

- **BLS12-381 cryptographic primitives**: Support for BLS (Boneh-Lynn-Shacham) curve operations, enabling advanced cryptographic applications including zero-knowledge proofs, threshold signatures, and cross-chain bridge verification. The BLS12-381 curve is the same curve used by Ethereum 2.0 for its consensus mechanism, facilitating potential interoperability.
- **Keccak-256 hashing**: Added support for the Keccak-256 hash function (used natively by Ethereum), enabling Cardano smart contracts to verify Ethereum data structures and facilitating cross-chain applications.
- **Blake2b-224 hashing**: Additional hash function support expanding the cryptographic toolkit available to smart contract developers.
- **Integer-to-bytestring and bytestring-to-integer conversions**: Utility functions that simplify data manipulation within smart contracts.

**Sums of Products (SOPs)**
PlutusV3 introduced a new data encoding scheme called Sums of Products, which more efficiently represents algebraic data types in Plutus scripts. This results in:

- Smaller script sizes for contracts that use complex data structures.
- Faster execution of pattern matching and data destructuring operations.
- Overall reduction in transaction costs for contracts using structured data.

### Governance Infrastructure

The Chang hard fork deployed the on-chain governance mechanisms defined in CIP-1694. This was the largest structural change to the Cardano ledger since the introduction of smart contracts in the Alonzo hard fork. The governance changes include:

**DRep System**

- On-chain DRep registration and deregistration.
- Vote delegation certificates allowing ADA holders to delegate governance power to DReps.
- Special delegation options: Abstain and No Confidence.
- DRep activity tracking to identify inactive representatives.

**Constitutional Committee**

- On-chain representation of CC members with their credentials and term expiration epochs.
- CC voting mechanism for governance actions.
- Governance actions to update CC membership and express no confidence.

**Governance Actions**

- On-chain submission of governance actions with deposits.
- Seven types of governance actions: treasury withdrawals, protocol parameter changes, hard fork initiation, CC updates, no-confidence motions, constitutional updates, and info actions.
- Voting periods with defined expiration.
- Ratification logic implementing the required approval thresholds for each action type.

**On-Chain Voting**

- Vote transaction types for DReps, SPOs, and CC members.
- Stake-weighted vote tallying.
- Configurable thresholds via protocol parameters.

### Conway Ledger Era

Internally, the post-Chang ledger era is referred to as the "Conway" era in the Cardano node codebase. This naming follows the convention of using surnames of notable figures for ledger eras (Shelley, Allegra, Mary, Alonzo, Babbage, Conway). The Conway era ledger rules encode all of the governance mechanisms and PlutusV3 features introduced by the Chang hard fork.

### Phased Rollout

The governance functionality was deployed in phases:

- **Phase 1 (Chang hard fork, September 2024)**: Core governance infrastructure, DRep registration and delegation, CC bootstrapping with initial members, basic governance actions, and PlutusV3.
- **Phase 2 (subsequent updates)**: Full treasury withdrawal capabilities, refined governance parameters based on initial experience, and expanded governance action types reaching full operational status.

This phased approach allowed the community to gradually adopt governance features and identify any issues before enabling the full scope of governance capabilities.

### Seamless User Experience

A key engineering goal of the Chang hard fork was to ensure a seamless transition for end users:

- **Wallets**: No wallet updates were required for basic functionality. Users could continue sending, receiving, and staking ADA without any changes. Wallet providers updated their software to add governance features (DRep delegation, voting) as optional new capabilities.
- **DApps**: Existing smart contracts and decentralized applications continued to function without modification. DApps using PlutusV1 or PlutusV2 scripts were unaffected, as backward compatibility was maintained.
- **Staking**: Stake delegation to pools continued without interruption. Staking rewards were not affected by the hard fork.
- **Exchanges**: Exchanges and custodians needed to upgrade their node software but did not need to perform any token migrations or account restructuring.

### Stake Pool Operator Coordination

The hard fork required SPOs to upgrade their nodes to a Conway-compatible version before the activation epoch. The coordination process included:

- Advance communication of the target epoch for the hard fork.
- Testnet deployment and validation prior to mainnet activation.
- Monitoring of SPO upgrade progress through on-chain version signaling.
- The hard fork was triggered only after sufficient SPO adoption of the new node version was confirmed.

## Common Misconceptions

- **"The Chang hard fork created a new token or chain."** The Chang hard fork was an in-place protocol upgrade. There was no new token, no chain split, and no migration required. ADA holders' balances and staking positions were completely unaffected.

- **"Smart contracts broke after the hard fork."** Full backward compatibility was maintained. Contracts written for PlutusV1 and PlutusV2 continued to function exactly as before. PlutusV3 is an additional option, not a replacement.

- **"The founding entities lost all influence."** While the Chang hard fork was the first not directly controlled by founding entities, these organizations remain active participants in the ecosystem. They contribute to development, fund research, and participate in governance like any other stakeholders. The change was in formal control, not in participation.

- **"Everyone needed to upgrade their wallet."** Regular ADA holders did not need to take any action. Wallet providers released updates to support new governance features, but existing wallet versions continued to work for basic transactions and staking.

- **"PlutusV3 is only about cost savings."** While the 20-30% cost reduction is a headline feature, PlutusV3 also introduced fundamentally new cryptographic capabilities (BLS curves, Keccak-256) that enable entirely new categories of applications, including zero-knowledge proofs and cross-chain verification.

## Comparison Points

| Feature               | Chang Hard Fork (Cardano)                | The Merge (Ethereum)                 | Typical Cosmos Chain Upgrade     |
| --------------------- | ---------------------------------------- | ------------------------------------ | -------------------------------- |
| Date                  | September 1, 2024                        | September 15, 2022                   | Varies                           |
| Primary purpose       | Governance + smart contract improvements | Consensus change (PoW to PoS)        | Feature additions                |
| User action required  | None                                     | None                                 | Sometimes (depending on upgrade) |
| Chain split risk      | None (HFC mechanism)                     | Minimal (ETC/ETH split was earlier)  | Low (coordinated upgrades)       |
| Smart contract impact | Full backward compatibility + PlutusV3   | No direct smart contract changes     | Varies                           |
| Governance changes    | Full on-chain governance system          | None (governance remained off-chain) | Varies                           |
| Transition mechanism  | Hard Fork Combinator                     | Difficulty bomb + beacon chain merge | Coordinated halt + restart       |

The Chang hard fork is notable for simultaneously introducing both governance infrastructure and significant smart contract improvements in a single, seamless upgrade, demonstrating the maturity of Cardano's hard fork combinator approach.

## Sources

- Chang Hard Fork announcement and technical overview, Input Output Global (https://iohk.io)
- CIP-1694: An On-Chain Decentralized Governance Mechanism for Voltaire (https://github.com/cardano-foundation/CIPs/tree/master/CIP-1694)
- PlutusV3 specification and built-in function documentation (https://plutus.readthedocs.io)
- Cardano Node release notes for Conway era compatibility
- Cardano Foundation hard fork coordination documentation (https://docs.cardano.org)
- Intersect hard fork working group reports and coordination materials

## Last Updated

2025-02-01
