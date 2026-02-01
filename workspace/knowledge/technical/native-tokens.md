# Cardano Native Tokens

## Overview

Cardano implements a multi-asset ledger where user-defined tokens are tracked directly at the protocol level, alongside ADA. Unlike platforms such as Ethereum where custom tokens are implemented through smart contracts (e.g., ERC-20), Cardano native tokens are first-class citizens of the ledger itself. They are carried in transaction outputs, transferred using the same mechanism as ADA, and governed by the same ledger rules. This architectural decision, introduced in the Mary hard fork (March 2021), eliminates entire categories of token-related vulnerabilities and dramatically reduces the cost and complexity of token operations.

## Key Facts

- Native tokens on Cardano require zero smart contract execution for standard transfers, meaning no execution fees beyond the base transaction fee.
- A standard token transfer costs approximately 0.17 ADA in transaction fees, the same as sending ADA.
- Token transfers cannot suffer from reentrancy attacks, approval front-running, or integer overflow vulnerabilities because no custom code executes during transfers.
- Transaction outputs on Cardano can carry multiple different tokens simultaneously (multi-asset outputs).
- Thousands of distinct native tokens have been created on Cardano since the Mary era.
- Minting and burning of tokens is controlled by minting policies, which are scripts that define the conditions under which new tokens can be created or destroyed.
- Each native token is identified by a combination of its minting policy hash (policy ID) and a token name (asset name), together forming an asset ID.

## Technical Details

### Ledger-Level Token Tracking

In Cardano's multi-asset UTxO model, every transaction output contains a value field that is not a single number but a bundle of assets. This bundle maps policy IDs and asset names to quantities. The ledger's value arithmetic operates over these bundles natively:

- Addition and subtraction of multi-asset values follow straightforward bundle arithmetic.
- The preservation of value rule (inputs must equal outputs plus fees) applies to all assets simultaneously.
- The ledger enforces that no asset can have a negative quantity in an output.

This means the ledger itself guarantees token conservation. If you send 100 tokens in inputs, exactly 100 tokens must appear in outputs (unless minting or burning occurs in the same transaction, as authorized by the relevant minting policy). There is no custom code that could fail, re-enter, or behave unexpectedly during a transfer.

### Comparison with ERC-20 Tokens

On Ethereum, an ERC-20 token is a smart contract that maintains a mapping of addresses to balances. Every token transfer requires executing the contract's `transfer` function, which:

1. Costs gas proportional to the execution complexity.
2. Can contain arbitrary logic, including bugs.
3. Is susceptible to reentrancy if callbacks are involved.
4. Requires separate `approve` and `transferFrom` calls for third-party transfers, which introduces front-running vulnerabilities.
5. Can suffer from integer overflow or underflow in older implementations without SafeMath.

Cardano native tokens eliminate all of these issues by construction. There is no contract to execute, no custom logic to audit for simple transfers, and no approval mechanism to exploit. The ledger handles everything.

### Multi-Asset Outputs

A single Cardano UTxO can hold ADA plus any number of different native tokens. This enables efficient token management:

- A user can send multiple different tokens to the same recipient in a single transaction output.
- DEX (decentralized exchange) protocols can hold liquidity pool reserves for multiple token pairs efficiently.
- NFT collections can be bundled in fewer UTxOs, reducing chain bloat.

Every UTxO must contain a minimum amount of ADA (the minimum UTxO value), which scales with the size of the value being stored. This prevents the creation of dust UTxOs and ensures that the cost of maintaining UTxO set entries is covered.

### Minting Policies

While transfers require no script execution, the creation (minting) and destruction (burning) of tokens is governed by minting policies. A minting policy is a script attached to a policy ID that defines the conditions under which tokens under that policy can be minted or burned. Minting policies can be:

- **Simple scripts**: Time-locked or multi-signature policies that require certain conditions (e.g., a specific key must sign, or minting must occur before a deadline). These are evaluated by the ledger without Plutus execution costs.
- **Plutus scripts**: Arbitrary validator logic that can enforce complex minting conditions. These require execution units (memory and CPU) and associated fees.

Common minting policy patterns include:

- **One-time mint**: A policy that references a specific UTxO as an input. Since UTxOs can only be spent once, the policy can only be satisfied once, guaranteeing a fixed supply. This is the standard pattern for NFTs.
- **Time-locked mint**: A policy that allows minting only before a specified slot, after which the supply is permanently fixed.
- **Role-based mint**: A policy requiring signatures from designated minting authorities, useful for stablecoins or regulated assets.
- **Algorithmic mint**: A Plutus policy that enforces complex rules such as collateralization ratios or oracle price feeds.

### Token Metadata

Native token metadata on Cardano is handled through several mechanisms:

- **On-chain metadata**: Transaction metadata (using metadata labels) can include token information such as name, description, image URI, and other properties. The Cardano Token Registry and CIP-25 (NFT metadata standard) define conventions for this data.
- **Off-chain metadata**: The Cardano Token Registry (maintained by the Cardano Foundation) allows token issuers to register human-readable names, tickers, and descriptions for their tokens.
- **CIP-68**: A more recent metadata standard that stores token metadata in reference UTxOs on-chain, allowing for updatable metadata while maintaining NFT uniqueness guarantees.

### Fungible Tokens vs. NFTs

The native token framework handles both fungible and non-fungible tokens uniformly:

- **Fungible tokens**: Multiple units of the same asset (same policy ID and asset name) are interchangeable. A minting policy might allow creating millions of units for a community token.
- **Non-fungible tokens (NFTs)**: Achieved by ensuring that exactly one unit of a particular asset name is ever minted. The one-time mint pattern (referencing a specific UTxO) is the standard approach for guaranteeing uniqueness.
- **Semi-fungible tokens**: Tokens with limited editions (e.g., 100 copies) use the same framework with minting policies that enforce the desired supply cap.

## Common Misconceptions

**"Native tokens are less capable than ERC-20 tokens."** Native tokens handle standard operations (transfer, balance tracking, multi-party transactions) more efficiently and securely than ERC-20. For complex token behaviors (such as rebasing or transfer fees), Plutus validators can be attached to UTxOs holding native tokens, providing equivalent programmability when needed.

**"You need to write a smart contract to create a token on Cardano."** Simple tokens can be created using simple script minting policies (multisig or time-locked) without writing any Plutus code. Only complex minting logic requires Plutus scripts.

**"Native tokens are just wrapped ADA."** Native tokens are entirely independent assets with their own policy IDs and supply schedules. They happen to share the same ledger infrastructure as ADA, but they are not backed by or convertible to ADA at the protocol level.

**"Transfers of native tokens are free."** Transfers require the standard Cardano transaction fee (approximately 0.17 ADA), which covers the cost of ledger processing. What they do not require is additional smart contract execution fees, which on other platforms can be the dominant cost component.

## Comparison Points

- **Ethereum ERC-20**: Smart contract-based tokens with higher transfer costs (gas for contract execution), vulnerability to contract bugs, and the need for separate approval transactions. More flexible in terms of custom transfer logic but at the cost of security and efficiency.
- **Bitcoin (Colored Coins, Ordinals, Runes)**: Bitcoin has experimented with token standards layered on top of its base protocol. These approaches range from metadata-based systems (colored coins) to more recent inscription-based approaches (Ordinals, Runes), but none are first-class ledger features like Cardano's native tokens.
- **Solana SPL Tokens**: Solana's token program is a system-level program that provides token functionality. While more integrated than Ethereum's approach, SPL tokens still require program execution for transfers, unlike Cardano's purely ledger-level approach.
- **Algorand ASA**: Algorand Standard Assets are also ledger-level tokens, sharing the same architectural philosophy as Cardano native tokens. Both platforms benefit from reduced transfer costs and elimination of smart contract vulnerabilities for basic token operations.

## Sources

- Cardano Documentation — Native Tokens: https://docs.cardano.org/native-tokens/
- CIP-25 NFT Metadata Standard: https://cips.cardano.org/cip/CIP-25
- CIP-68 Datum Metadata Standard: https://cips.cardano.org/cip/CIP-68
- Cardano Ledger Specification (Mary Era): https://github.com/intersectmbo/cardano-ledger
- IOG Blog — Native Tokens on Cardano: https://iohk.io/en/blog/posts/2021/02/18/building-native-tokens-on-cardano-for-pleasure-and-profit/

## Last Updated

2025-02-01
