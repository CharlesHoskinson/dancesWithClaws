# Cardano Architecture

## Overview

Cardano employs a two-layer architectural design that cleanly separates the concerns of value settlement from programmable computation. This separation is a deliberate engineering choice rooted in the principle that different concerns benefit from different design constraints — settlement requires maximal security and simplicity, while computation requires flexibility and expressiveness.

The two layers — the Settlement Layer and the Computation Layer — operate on a single blockchain and a single ledger. This is an important distinction: Cardano is not two separate blockchains bridged together, but rather a single chain with a clean internal separation of concerns. This architecture enables independent upgradability, targeted formal verification, and a principled approach to extending the platform's capabilities over time.

## Key Facts

- **Single ledger, two layers**: Cardano operates a single blockchain. The Settlement Layer and Computation Layer are logical separations within the same ledger, not separate chains.
- **Settlement Layer**: Handles the Ouroboros consensus protocol, the eUTXO ledger model, native token accounting, and ADA transfers. It is the foundation upon which everything else is built.
- **Computation Layer**: Hosts Plutus validator scripts that enforce smart contract logic. Validators run during transaction validation and determine whether script-locked UTXOs can be spent.
- **Native multi-asset**: Token support is implemented at the Settlement Layer, meaning fungible tokens and NFTs are first-class ledger entities — not smart contract artifacts. This provides stronger guarantees and lower costs for token operations.
- **Formal methods heritage**: The architecture was designed with formal verification in mind. Key components of the ledger have been specified in formal notation and the Haskell implementation closely follows these specifications.

## Technical Details

### Settlement Layer

The Settlement Layer is the bedrock of Cardano. It encompasses:

**Ouroboros Consensus:**
The consensus mechanism selects block producers, defines the slot and epoch structure, and ensures agreement on the canonical chain. The Settlement Layer runs Ouroboros Praos (currently), which provides provable security under the honest-majority-of-stake assumption. See the dedicated Ouroboros knowledge file for detailed information.

**eUTXO Ledger:**
The extended UTXO model tracks all value on the network. Each UTXO contains an address, a value bundle (ADA plus optional native tokens), an optional datum, and an optional reference script. The ledger rules enforce conservation of value — no transaction can create or destroy ADA (except through the protocol's reward mechanism) or native tokens (except through minting policy scripts).

**Native Token Framework:**
Cardano's multi-asset ledger supports user-defined tokens at the protocol level. Key properties:

- Tokens are identified by a minting policy hash (policy ID) and an asset name.
- Minting and burning are governed by minting policy scripts that execute during transaction validation.
- Once minted, tokens are carried in UTXOs and transferred using the same ledger rules as ADA.
- No smart contract execution is needed for token transfers — they are pure ledger operations.
- The minimum UTXO value (minUTXOValue) ensures that every UTXO carries enough ADA to cover its storage cost on-chain.

**Transaction Processing:**
Transactions at the Settlement Layer are processed in two phases:

- Phase 1 validates structural properties (input existence, signatures, fees, validity interval) without executing scripts.
- Phase 2 executes any Plutus scripts referenced by the transaction.

This two-phase approach means that structurally invalid transactions are rejected cheaply, and script execution costs are only incurred for well-formed transactions.

**Staking and Delegation:**
The staking mechanism is embedded in the Settlement Layer. Stake addresses, delegation certificates, pool registrations, and reward calculations are all Settlement Layer operations. This means staking does not require smart contracts and benefits from the layer's simplicity and high assurance.

### Computation Layer

The Computation Layer provides programmable logic through Plutus validator scripts:

**Plutus Validators:**
Validators are functions that receive a datum, redeemer, and script context, and return a pass/fail verdict. They determine whether a transaction is authorized to consume a script-locked UTXO. Validators are pure functions with no side effects — they cannot modify state directly; they can only approve or reject a proposed state transition.

**Script Execution Environment:**
Plutus scripts compile to Plutus Core, a small lambda-calculus-based language that runs in a deterministic evaluation environment. The execution is metered by CPU steps and memory units, with costs calculated deterministically from the script and its inputs. This ensures that fee calculation is exact and reproducible.

**Minting Policies:**
In addition to spending validators, the Computation Layer includes minting policy scripts that govern token creation and destruction. Minting policies are executed when a transaction includes a minting field, and they determine whether the minting or burning of tokens under their policy ID is authorized.

**Stake Validators:**
Script-based stake addresses can have associated validators that control reward withdrawal and delegation changes. These are less common than spending validators and minting policies but enable advanced staking mechanisms.

### Why Two Layers?

The architectural separation provides several benefits:

**Independent Upgradability:**
The Settlement Layer can be upgraded independently of the Computation Layer and vice versa. For example, changes to the Plutus cost model or the addition of new built-in functions (as in the V1 to V2 to V3 progression) do not require changes to the consensus protocol or ledger rules. Similarly, consensus upgrades (like Ouroboros Genesis) do not affect smart contract execution.

**Targeted Formal Verification:**
The Settlement Layer is specified using formal methods (the Cardano ledger formal specification). Because the settlement rules are simpler and more constrained than arbitrary computation, they are more amenable to formal verification. The Haskell implementation of the ledger closely follows the formal specification, and the two can be compared and verified against each other.

**Security Through Simplicity:**
The Settlement Layer handles the most security-critical operations (consensus, value accounting, staking) with a minimal, well-understood rule set. By keeping the settlement rules simple, the attack surface is reduced and the system is easier to reason about.

**Clean Abstraction Boundaries:**
The two-layer design creates clean interfaces between components. The Computation Layer interacts with the Settlement Layer through well-defined mechanisms (script evaluation during Phase 2, datum and redeemer passing). This modularity makes the system easier to test, audit, and maintain.

### Node Architecture

The Cardano node itself reflects this layered design:

- **Consensus layer** (ouroboros-consensus): Implements the Ouroboros protocol, chain selection, and block validation.
- **Ledger layer** (cardano-ledger): Implements the eUTXO ledger rules, native token accounting, and staking mechanics.
- **Plutus layer** (plutus): Provides the Plutus Core evaluator for script execution.
- **Networking layer** (ouroboros-network): Handles peer-to-peer communication, block and transaction diffusion.

Each layer is implemented as a separate Haskell package with well-defined APIs, enabling independent development and testing.

### Governance Integration (Conway Era)

The Conway ledger era adds on-chain governance to the architecture. Governance actions (protocol parameter changes, treasury withdrawals, hard fork initiations, constitutional amendments) are submitted as special transactions and voted on by three governance bodies: Delegated Representatives (DReps), Stake Pool Operators, and the Constitutional Committee.

Governance is integrated at the Settlement Layer level, meaning governance actions and votes are first-class ledger operations rather than smart contract constructs. This provides the same high-assurance guarantees for governance as for value transfer.

### Hard Fork Combinator

A distinctive feature of Cardano's architecture is the Hard Fork Combinator (HFC), which enables seamless protocol upgrades without network disruption. The HFC allows:

- Multiple ledger eras to be supported simultaneously within the same node.
- Smooth transitions between eras at specific epoch boundaries.
- Backward compatibility — a node running the latest era can still validate blocks from all previous eras.

This mechanism has been used for every major Cardano upgrade (Byron to Shelley, Shelley to Allegra, Mary, Alonzo, Babbage, and Conway) without any network downtime.

## Common Misconceptions

**"Cardano is two separate blockchains."**
This is incorrect. Cardano operates a single blockchain with a single ledger. The "two layers" refer to a logical separation of concerns within that single chain — settlement logic versus computation logic. There is no bridge, no cross-chain communication, and no separate consensus between the layers.

**"Native tokens are smart contracts."**
On Cardano, native tokens are ledger-level entities, not smart contract constructs. While minting policies (which are scripts) govern token creation and destruction, the tokens themselves exist at the Settlement Layer and can be transferred without any script execution. This is fundamentally different from ERC-20 tokens on Ethereum, which are entirely defined by smart contract state.

**"The two-layer design makes Cardano slower."**
The two-layer design does not introduce performance overhead. Both layers operate within the same transaction validation pipeline. The separation is architectural, not operational — it affects how the system is designed and maintained, not how fast transactions are processed.

**"Smart contracts can modify ledger state directly."**
Plutus validators cannot modify state. They can only validate that a proposed state transition (the transaction) meets certain conditions. State changes are expressed as the difference between consumed UTXOs (inputs) and created UTXOs (outputs). The validator checks that this transition is authorized, but the transaction itself defines the change.

## Comparison Points

| Aspect                   | Cardano (Two-Layer)        | Ethereum (Unified)           | Bitcoin (Settlement Only)    |
| ------------------------ | -------------------------- | ---------------------------- | ---------------------------- |
| Token model              | Native (ledger-level)      | Contract-based (ERC-20)      | None (UTXO only)             |
| Smart contract execution | Separate Computation Layer | Integrated in EVM            | Limited (Bitcoin Script)     |
| Formal specification     | Yes (ledger spec)          | Partial (Yellow Paper)       | Informal                     |
| Upgrade mechanism        | Hard Fork Combinator       | Hard fork + EIPs             | Soft forks + BIPs            |
| Governance               | On-chain (Conway era)      | Off-chain (social consensus) | Off-chain (social consensus) |
| State model              | eUTXO                      | Account/state trie           | UTXO                         |

## Sources

- Cardano Ledger Formal Specification: https://github.com/intersectmbo/cardano-ledger
- Cardano Node Architecture: https://github.com/intersectmbo/cardano-node
- Cardano Documentation: https://docs.cardano.org
- Hard Fork Combinator Documentation: https://docs.cardano.org/learn/hard-forks
- IOG Research Papers: https://iohk.io/en/research/library/

## Last Updated

2025-02-01
