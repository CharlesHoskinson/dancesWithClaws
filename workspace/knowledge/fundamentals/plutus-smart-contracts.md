# Plutus Smart Contracts

## Overview

Plutus is Cardano's native smart contract platform, built on top of the Haskell programming language. Unlike most blockchain smart contract systems that use domain-specific languages (Solidity, Move, etc.), Plutus allows developers to write both on-chain validator scripts and off-chain application logic in the same language — Haskell. This unified approach reduces the potential for mismatches between what the off-chain code expects and what the on-chain code enforces.

The Plutus platform was launched on Cardano mainnet with the Alonzo hard fork in September 2021. Since then, it has undergone significant evolution through multiple versions, each improving performance, reducing costs, and expanding cryptographic capabilities. Plutus scripts run as validators in Cardano's eUTXO model, determining whether a transaction is authorized to consume a particular script-locked UTXO.

## Key Facts

- **Language foundation**: Plutus is based on Haskell, a statically-typed, purely functional programming language with strong formal verification properties. On-chain code compiles to Plutus Core, a lambda-calculus-based intermediate language.
- **Three versions deployed**: PlutusV1 (Alonzo, September 2021), PlutusV2 (Vasil, September 2022), and PlutusV3 (Conway, anticipated 2024-2025). Each version is additive — older scripts remain valid.
- **PlutusV3 improvements**: Brings 20-30% cost reduction through Sums of Products (SOPs) encoding, BLS12-381 cryptographic primitives for zero-knowledge proof support, and bitwise operations.
- **Developer ecosystem**: Over 1,000 developers have been trained through the Plutus Pioneer Program, a free educational initiative run by IOG. Multiple cohorts have been conducted since 2021.
- **Alternative frontends**: While Plutus is the core platform, several alternative languages compile to Plutus Core, including Aiken (Rust-like syntax), Helios (JavaScript-like), OpShin (Python-based), and Plu-ts (TypeScript-based).

## Technical Details

### Architecture: On-Chain and Off-Chain

The Plutus platform is divided into two components:

**On-chain (Plutus Core validators):**
Validator scripts are compiled to Plutus Core and stored on-chain. They execute during transaction validation (Phase 2) and return a simple pass/fail verdict. A validator receives three arguments:

1. **Datum**: The data attached to the UTXO being spent (the "state").
2. **Redeemer**: The data provided by the transaction attempting to spend the UTXO (the "action").
3. **Script Context**: Information about the transaction itself (inputs, outputs, signers, validity interval, minting, etc.).

The validator inspects these three pieces of data and decides whether the spending is authorized. If the validator returns successfully, the UTXO can be spent. If it throws an error, the transaction fails.

**Off-chain (Plutus Application Backend / transaction building):**
The off-chain component is responsible for constructing transactions, querying the blockchain for available UTXOs, building the correct datums and redeemers, balancing fees, and submitting transactions. Originally, this was done through the Plutus Application Backend (PAB), but the ecosystem has largely moved toward more modular transaction-building libraries and frameworks such as Lucid, Mesh, and cardano-cli.

### PlutusV1 to V2 Evolution

PlutusV2, introduced with the Vasil hard fork, brought several critical improvements:

- **Reference inputs**: Transactions can read UTXOs without consuming them. This enables sharing data (like oracle price feeds) across multiple transactions without contention.
- **Inline datums**: Datums can be stored directly on the UTXO instead of just their hash, reducing the need for off-chain datum management.
- **Reference scripts**: Plutus scripts can be stored in UTXOs and referenced by transactions, rather than including the full script in every transaction. This dramatically reduces transaction sizes and fees for complex scripts.
- **Cost model improvements**: Updated execution cost parameters reduced script costs by 20-50% for many common operations.

### PlutusV3 Advances

PlutusV3 represents the most significant upgrade to the Plutus platform:

- **Sums of Products (SOPs)**: A new data encoding scheme that replaces the Scott encoding used in V1/V2. SOPs are more efficient for pattern matching on algebraic data types, which is the bread and butter of Haskell-style programming. This encoding change alone delivers 20-30% reduction in script execution costs for typical validators.
- **BLS12-381 cryptographic primitives**: Built-in support for BLS12-381 elliptic curve operations enables efficient zero-knowledge proof verification on-chain. This is foundational for privacy-preserving applications, cross-chain bridges, and advanced cryptographic protocols like Mithril verification on-chain.
- **Bitwise primitives**: New built-in functions for bitwise operations on bytestrings enable more efficient data manipulation and hashing operations.
- **New built-in functions**: Additional utility functions reduce the need for hand-optimized code in common patterns.

### Execution Budget and Cost Model

Every Plutus script execution is constrained by an execution budget measured in two dimensions:

- **CPU steps**: A measure of computational effort (time).
- **Memory units**: A measure of memory consumption.

Each transaction has maximum limits for both dimensions, and the total per-block budget is also capped. The cost model maps each Plutus Core built-in function to its CPU and memory costs, ensuring deterministic fee calculation. Developers can calculate exact execution costs locally before submitting transactions.

The current per-transaction limits are 14 billion CPU steps (14,000 ms equivalent) and 10 million memory units. Per-block limits are higher, allowing multiple script transactions per block.

### Alternative Languages and Tooling

While Plutus (Haskell) is the foundational platform, the community has developed several alternative frontends:

- **Aiken**: A purpose-built language with Rust-inspired syntax specifically designed for Cardano smart contracts. It compiles to Plutus Core and has gained significant traction due to its developer-friendly tooling and fast compilation.
- **Helios**: A JavaScript-like language for writing Cardano smart contracts, aimed at web developers.
- **OpShin**: A Python-based smart contract language that compiles a subset of Python to Plutus Core.
- **Plu-ts**: A TypeScript-embedded DSL for writing and composing Plutus scripts.
- **Scalus**: A Scala-based toolkit for Plutus smart contract development.

All of these compile to Plutus Core, meaning they benefit from the same on-chain execution environment, security properties, and cost model.

### Plutus Pioneer Program

The Plutus Pioneer Program is IOG's educational initiative designed to train developers in Plutus smart contract development. The program consists of a series of weekly lectures, coding exercises, and homework assignments covering:

- Haskell fundamentals relevant to Plutus
- The eUTXO model and validator scripts
- Minting policies and native tokens
- State machines and more complex patterns
- Testing and deployment

Over 1,000 developers have completed the program across multiple cohorts, forming the core of Cardano's smart contract developer community.

## Common Misconceptions

**"Plutus requires learning Haskell, which makes it inaccessible."**
While Plutus itself is Haskell-based, the ecosystem now offers multiple alternative languages (Aiken, Helios, OpShin, Plu-ts) that allow developers to write smart contracts in syntax resembling Rust, JavaScript, Python, or TypeScript. The barrier to entry has been significantly lowered since 2021.

**"Plutus scripts are too expensive to run."**
Early PlutusV1 scripts were indeed costly due to the Scott encoding and limited optimizations. PlutusV2 reduced costs by 20-50% through reference scripts and improved cost models. PlutusV3 further reduces costs by 20-30% through SOPs. Modern well-optimized Cardano smart contract interactions typically cost fractions of an ADA.

**"Plutus is less capable than Solidity."**
Plutus and Solidity operate on fundamentally different execution models. Plutus validators are pure functions that verify transaction correctness, while Solidity contracts directly mutate state. Both can express the same applications, but the design patterns differ. Plutus benefits from determinism, formal verification potential, and the absence of reentrancy attacks by construction.

**"On-chain code is the entire application."**
In Plutus, on-chain validators are deliberately minimal — they verify that a transaction meets certain conditions. The bulk of application logic (user interfaces, transaction construction, UTXO selection, state management) lives off-chain. This design keeps on-chain costs low and allows off-chain logic to evolve without modifying deployed validators.

## Comparison Points

| Feature               | Plutus (Cardano)         | Solidity (Ethereum) | Move (Aptos/Sui)     |
| --------------------- | ------------------------ | ------------------- | -------------------- |
| Base language         | Haskell                  | JavaScript-like     | Rust-like            |
| Execution model       | Validator (verify)       | State mutation      | Resource-oriented    |
| On-chain state        | Datum on UTXO            | Contract storage    | Global objects       |
| Reentrancy risk       | None (by design)         | Yes (mitigable)     | None (by design)     |
| Formal verification   | Strong (Haskell tooling) | Limited             | Medium (Move Prover) |
| Fee determinism       | Exact pre-submission     | Estimated           | Estimated            |
| Alternative frontends | Aiken, Helios, OpShin    | Vyper, Yul          | None                 |

## Sources

- Plutus Core Specification: https://github.com/intersectmbo/plutus
- Cardano Documentation — Plutus: https://docs.cardano.org
- CIP-0085: Sums of Products for Plutus Core
- CIP-0381: BLS12-381 Plutus Primitives
- Plutus Pioneer Program: https://github.com/input-output-hk/plutus-pioneer-program
- Aiken Language: https://aiken-lang.org

## Last Updated

2025-02-01
