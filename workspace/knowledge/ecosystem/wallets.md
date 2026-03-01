# Wallets on Cardano

## Overview

Wallets are the primary interface between users and the Cardano blockchain, managing private keys, displaying balances, constructing transactions, and connecting to decentralized applications. The Cardano wallet ecosystem has matured to include multiple options ranging from simple browser extensions to full-featured desktop applications and hardware wallet integrations. A key unifying standard is the CIP-30 dApp connector, which provides a consistent interface for web-based applications to interact with any compatible wallet.

Cardano wallets must handle the unique aspects of the eUTXO model, including UTXO selection (choosing which unspent outputs to use as transaction inputs), native multi-asset support (displaying and managing tokens alongside ADA), and staking delegation (allowing users to delegate their stake to pools without locking funds).

## Key Facts

- **Eternl:** A full-featured wallet with advanced capabilities including multi-account management, a dApp connector browser, detailed UTXO management, and comprehensive staking tools.
- **Nami:** A simple, lightweight browser extension wallet focused on ease of use, popular among users new to Cardano.
- **Typhon:** A wallet supporting multi-account management with a clean interface, offering both browser extension and web-based access.
- **Lace:** A lightweight wallet developed by IOG (Input Output Global), designed for simplicity with plans for multi-chain support.
- **Hardware Wallet Support:** Ledger and Trezor hardware wallets are supported for secure key storage across multiple Cardano software wallets.
- **CIP-30 dApp Connector:** The standard protocol enabling web-based dApps to interact with Cardano wallets, similar to Ethereum's EIP-1193.
- **Developer Wallet APIs:** Libraries and APIs available for developers to integrate wallet functionality into their applications.

## Technical Details

### Eternl (formerly CCVault)

Eternl is widely regarded as the most feature-rich wallet in the Cardano ecosystem:

**Core Features:**

- Multi-account support: Users can create and manage multiple accounts within a single wallet, each with its own set of addresses and delegation preferences.
- dApp Browser: A built-in browser for interacting with Cardano dApps directly within the wallet interface.
- UTXO Management: Advanced tools for viewing and managing individual UTXOs, which is useful for power users and developers working with the eUTXO model.
- Transaction History: Detailed transaction history with filtering, labeling, and export capabilities.
- Native Asset Management: Full support for viewing, sending, and receiving Cardano native tokens and NFTs.

**Staking Features:**

- Multi-pool delegation: Eternl supports delegating to multiple stake pools from a single wallet, distributing stake across different pools. This leverages Cardano's account-based staking model where different payment addresses within a wallet can delegate to different pools.
- Staking rewards tracking: Detailed views of rewards earned per epoch, including historical data.
- Pool comparison tools: Built-in metrics for evaluating and comparing stake pools.

**Security:**

- Hardware wallet integration with Ledger and Trezor.
- Spending password protection.
- Seed phrase backup and recovery.
- Available as a browser extension (Chrome, Brave, Edge, Firefox) and as a web application.

### Nami

Nami is designed for simplicity and ease of use:

- **Browser Extension:** Available as a Chrome/Brave browser extension, providing quick access to wallet functions.
- **Minimalist Interface:** Clean, straightforward UI focused on essential operations: send, receive, delegate, and connect to dApps.
- **Single Address Mode:** Nami uses a simplified single-address model by default, which is easier for new users but provides less privacy than wallets that generate new addresses for each transaction.
- **dApp Connector:** Full CIP-30 support for connecting to decentralized applications.
- **NFT Display:** Built-in NFT viewer for Cardano native assets.
- **Collateral Management:** Simple collateral setting for interacting with Plutus smart contracts (required for script validation on Cardano).

Nami's simplicity makes it a popular first wallet for users entering the Cardano ecosystem, though power users may find its feature set limiting compared to Eternl or Typhon.

### Typhon

Typhon offers a middle ground between simplicity and advanced features:

- **Multi-Account Support:** Users can manage multiple accounts with different delegation preferences.
- **Cross-Platform:** Available as both a browser extension and a web application.
- **Transaction Builder:** Tools for constructing complex transactions including multi-asset sends and metadata attachment.
- **Staking Dashboard:** Comprehensive staking interface with pool information and rewards tracking.
- **Native Asset Support:** Full management of Cardano native tokens and NFTs.
- **Hardware Wallet Support:** Integration with Ledger devices for secure transaction signing.

### Lace

Lace is IOG's (Input Output Global) lightweight wallet project:

- **IOG Development:** Built by the same organization that develops the Cardano node software, Lace benefits from deep protocol knowledge.
- **Lightweight Design:** Focused on simplicity and fast performance, targeting users who want a clean, uncluttered experience.
- **Browser Extension:** Available as a Chrome-based browser extension.
- **Multi-Chain Vision:** Designed with a long-term vision of supporting multiple blockchain networks beyond Cardano.
- **dApp Connector:** Full CIP-30 support for web3 interactions.
- **Staking Center:** Built-in stake pool explorer and delegation interface.
- **NFT Gallery:** Visual display of NFT holdings with metadata viewing.

### Hardware Wallet Support

Hardware wallets provide the highest level of security for key storage by keeping private keys on a dedicated device that never exposes them to potentially compromised computers:

**Ledger (Nano S, Nano S Plus, Nano X, Stax):**

- Full support for ADA and Cardano native assets.
- Transaction signing on-device with details displayed on the Ledger screen.
- Compatible with Eternl, Typhon, Lace, and other Cardano wallets.
- Supports staking delegation from hardware wallet.

**Trezor (Model T, Model One, Safe 3):**

- ADA support with on-device transaction verification.
- Compatible with multiple Cardano software wallets.
- Open-source firmware for transparency and auditability.
- Supports basic Cardano operations including sending, receiving, and staking.

**Best Practices:**

- Use hardware wallets for storing significant amounts of ADA.
- Keep firmware updated to the latest version.
- Store seed phrase backup securely offline.
- Verify transaction details on the hardware wallet screen before confirming.

### CIP-30 dApp Connector Standard

CIP-30 defines the standard interface for communication between web-based decentralized applications and Cardano wallets:

**How It Works:**

1. A dApp detects available CIP-30-compatible wallets injected into the browser's `window.cardano` object.
2. The dApp requests to connect to a specific wallet using `window.cardano.[walletName].enable()`.
3. The user approves the connection in their wallet interface.
4. Once connected, the dApp can request the wallet to:
   - Provide the user's addresses and UTXO set.
   - Sign transactions constructed by the dApp.
   - Submit signed transactions to the network.
   - Provide collateral UTXOs for script interactions.

**Developer Benefits:**

- Write dApp frontend code once and have it work with any CIP-30-compatible wallet.
- No need to implement wallet-specific integrations.
- Users choose their preferred wallet; the dApp does not dictate wallet choice.

**Extensions:** Additional CIPs extend the base CIP-30 standard with capabilities like CIP-95 (governance-related wallet functions for on-chain voting).

### Developer Wallet APIs

For developers building applications that need wallet functionality:

- **Lucid / Lucid Evolution:** JavaScript/TypeScript libraries that can construct and manage wallets programmatically, useful for backend services and automated systems.
- **cardano-cli:** Command-line key generation and transaction signing for development and testing.
- **CML (Cardano Multiplatform Library):** Low-level library available in multiple languages for key management and transaction construction.
- **Wallet Backend APIs:** Cardano Wallet Backend provides a REST API for wallet management, transaction construction, and coin selection, suitable for services that need to manage wallets server-side.

## Common Misconceptions

**"You need ADA to receive tokens."** On Cardano, receiving any transaction (including native tokens and NFTs) does not require the recipient to take any action or pay any fee. However, holding native tokens does require a minimum ADA amount (the minimum UTXO value) to be present in the UTXO. The sender typically includes this ADA in the transaction.

**"Staking locks your ADA."** Cardano's liquid staking model means delegated ADA is never locked. Users can spend, send, or re-delegate their ADA at any time while it remains staked. There is no unbonding period. This is a significant difference from many other proof-of-stake networks.

**"All wallets are equally secure."** Security varies significantly. Hardware wallets provide the strongest key protection. Browser extension wallets are convenient but rely on the security of the user's browser and operating system. Web-based wallets introduce additional trust assumptions. Users should choose wallets appropriate for the value they are securing.

**"You only need one wallet."** While a single wallet is sufficient for basic use, many users benefit from multiple wallets — a hardware wallet for long-term storage, a browser extension for daily dApp interactions, and potentially separate wallets for different activities (DeFi, NFTs, governance).

## Comparison Points

- **vs. MetaMask (Ethereum):** MetaMask is the dominant Ethereum wallet with broader ecosystem support. Cardano's multi-wallet ecosystem (Eternl, Nami, Typhon, Lace) provides more user choice. CIP-30 serves a similar unifying role to Ethereum's EIP-1193 provider standard.
- **vs. Phantom (Solana):** Phantom offers a single dominant wallet experience on Solana. Cardano's approach of multiple competitive wallets provides diversity but can be confusing for newcomers who must choose among options.
- **UTXO vs. Account Model Wallets:** Cardano wallets must handle UTXO selection and management, which adds complexity compared to account-based wallets. This complexity is mostly hidden from users but affects how wallets construct transactions and manage balances.

## Sources

- Eternl wallet documentation (eternl.io)
- Nami wallet documentation (namiwallet.io)
- Typhon wallet documentation
- Lace wallet documentation (lace.io)
- CIP-30 specification (Cardano Improvement Proposals)
- Ledger and Trezor Cardano integration documentation

## Last Updated

2025-02-01
