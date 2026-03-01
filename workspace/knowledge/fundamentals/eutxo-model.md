# Extended UTXO (eUTXO) Model

## Overview

The Extended Unspent Transaction Output (eUTXO) model is Cardano's ledger accounting system, extending Bitcoin's original UTXO model with programmability features that enable smart contracts. Introduced as part of the Alonzo hard fork in September 2021, eUTXO represents a fundamentally different approach to blockchain state management compared to the account-based model used by Ethereum and most other smart contract platforms.

In the UTXO model, the ledger does not track account balances. Instead, it tracks individual transaction outputs that have not yet been spent. A transaction consumes one or more existing UTXOs as inputs and creates new UTXOs as outputs. The eUTXO extension adds three critical capabilities to this model: the ability to attach arbitrary data (datums) to outputs, the ability to lock outputs with validator scripts (smart contracts), and the ability for transactions to include a "redeemer" value that provides input to the validator.

## Key Facts

- **Deterministic validation**: Transactions in the eUTXO model can be fully validated off-chain before submission. The outcome of a transaction is entirely determined by the transaction itself and the UTXOs it consumes — there is no dependency on global mutable state.
- **Predictable fees**: Because validation is deterministic, transaction fees are known precisely before submission. The average transaction fee on Cardano is approximately $0.17 USD equivalent, though this varies with transaction complexity and ADA price.
- **Parallel processing**: Since UTXOs are independent units, transactions that consume different UTXOs can be validated in parallel without conflicts. This provides a natural path to horizontal scalability.
- **Native multi-asset support**: Cardano's eUTXO model supports multiple token types natively at the ledger level. Any UTXO can carry ADA alongside arbitrary user-defined tokens (both fungible and non-fungible) without requiring smart contracts for basic token transfers.
- **No failed transactions on-chain**: Because transactions are validated locally before submission, and the inputs must exist and be unspent at the time of inclusion, users do not pay fees for failed transactions (unlike account-based systems where failed contract calls still consume gas).

## Technical Details

### UTXO Structure in eUTXO

Each eUTXO consists of:

1. **Address**: The destination, which can be a public key hash (for simple transfers) or a script hash (for smart contract-locked outputs).
2. **Value**: A bundle containing ADA and optionally any number of native tokens, identified by their policy ID and asset name.
3. **Datum**: An optional piece of arbitrary data attached to the output. For script-locked outputs, the datum serves as the "state" that the validator script can inspect.
4. **Reference Script**: Optionally, a Plutus script can be attached directly to a UTXO (introduced in Vasil/PlutusV2), allowing other transactions to reference it without including the full script in each transaction.

### Transaction Anatomy

A Cardano transaction specifies:

- **Inputs**: References to existing UTXOs to be consumed (spent).
- **Outputs**: New UTXOs to be created.
- **Redeemers**: Values provided for each script input, serving as arguments to the validator.
- **Validity interval**: A time range during which the transaction is valid.
- **Required signers**: Public key hashes that must sign the transaction.
- **Minting/burning policies**: Scripts and redeemers for creating or destroying native tokens.
- **Collateral**: UTXOs pledged to cover fees if a script fails Phase-2 validation (a safety mechanism).

### Validation Phases

Transaction validation occurs in two phases:

- **Phase 1**: Structural validation — checks that inputs exist, signatures are valid, fees are sufficient, the validity interval is current, and collateral is provided. This phase is inexpensive and does not execute scripts.
- **Phase 2**: Script validation — executes all Plutus validator scripts referenced by the transaction. If any script fails, the transaction is rejected and only the collateral is consumed. This two-phase approach protects against denial-of-service attacks while ensuring validators are compensated for script execution.

### The Concurrency Consideration

The most significant design consideration of the eUTXO model is how it handles contention. Because each UTXO can only be consumed by one transaction, if multiple users attempt to interact with the same UTXO simultaneously (such as a single liquidity pool UTXO in a DEX), only one transaction can succeed per block for that UTXO.

This is not a limitation of the model itself but a design constraint that requires different architectural patterns than account-based systems. Cardano DeFi protocols have developed several approaches:

- **Batching**: An off-chain component collects user orders and processes them in batches against the shared UTXO (used by SundaeSwap, Minswap, and others).
- **UTXO splitting**: Protocol state is distributed across multiple UTXOs that can be consumed independently.
- **Order-book patterns**: Users create individual UTXOs representing orders, which can be matched in parallel.
- **Hydra state channels**: High-frequency interactions are moved to Layer 2 where the concurrency model operates within a smaller group.

These patterns are now well-established, and major Cardano DEXes routinely process thousands of swaps per epoch.

### Native Tokens vs Smart Contract Tokens

A distinguishing feature of Cardano's eUTXO model is that user-defined tokens (both fungible tokens and NFTs) are treated as first-class citizens in the ledger. A minting policy script governs creation and destruction, but once minted, tokens are carried within UTXOs alongside ADA and transferred using the same mechanisms. This means:

- Token transfers do not require smart contract execution, reducing fees.
- Tokens benefit from the same security and accounting guarantees as ADA itself.
- Wallets can display and manage all tokens without special contract integrations.
- The ledger natively enforces conservation of tokens across transactions.

## Common Misconceptions

**"The eUTXO model is less powerful than account-based models."**
This is a mischaracterization. The eUTXO and account-based models are computationally equivalent — any application that can be built on one can be built on the other. They represent different trade-off profiles. eUTXO favors determinism, local validation, and parallelism, while account-based models favor simpler mental models for global shared state. The design patterns differ, but the expressiveness does not.

**"UTXO concurrency means Cardano can't do DeFi."**
Early in the smart contract era (late 2021), some developers unfamiliar with the UTXO model struggled with concurrency patterns. This led to premature conclusions about the model's capabilities. Since then, the Cardano DeFi ecosystem has matured significantly, with protocols like Minswap, SundaeSwap, and Liqwid Finance processing substantial daily volumes using well-established UTXO-native design patterns.

**"You lose money on failed transactions."**
In account-based systems like Ethereum, failed smart contract interactions still consume gas, costing users fees for transactions that produce no useful outcome. In Cardano's eUTXO model, transactions are validated off-chain before submission. If the local validation succeeds but the on-chain state has changed (e.g., the UTXO was already spent), the transaction is simply rejected with no fee charged. Only in the rare case of Phase-2 script failure is collateral consumed.

**"eUTXO doesn't have state."**
eUTXO does support state, but it is managed differently than in account-based models. State is carried in datums attached to UTXOs. When a script-locked UTXO is consumed and a new one is created, the datum can be updated, effectively implementing state transitions. The datum is the state, and the UTXO lifecycle is the state machine.

## Comparison Points

| Feature                 | eUTXO (Cardano)             | Account Model (Ethereum)  | UTXO (Bitcoin)              |
| ----------------------- | --------------------------- | ------------------------- | --------------------------- |
| State representation    | Datum on UTXO               | Global contract storage   | Script on UTXO (limited)    |
| Fee predictability      | Exact, pre-submission       | Estimated, variable gas   | Exact, pre-submission       |
| Failed transaction cost | None (usually)              | Full gas consumed         | None                        |
| Parallel validation     | Natural (independent UTXOs) | Sequential (shared state) | Natural (independent UTXOs) |
| Native multi-asset      | Yes                         | No (ERC-20 contracts)     | No                          |
| Smart contracts         | Plutus validators + datums  | Solidity/Vyper contracts  | Bitcoin Script (limited)    |
| Shared state access     | Requires design patterns    | Direct                    | N/A                         |
| Transaction determinism | Full                        | State-dependent           | Full                        |

## Sources

- Chakravarty, M., Chapman, J., MacKenzie, K., Melkonian, O., Jones, M. P., & Wadler, P. (2020). "The Extended UTXO Model." Financial Cryptography Workshops.
- Cardano Documentation — Transaction Model: https://docs.cardano.org
- IOHK Technical Report: "UTXOma: UTXO with Multi-Asset Support."
- Cardano Ledger Specification: https://github.com/intersectmbo/cardano-ledger

## Last Updated

2025-02-01
