# Cardano Quick Facts Reference

## Network Statistics

- **Consensus:** Ouroboros Praos (provably secure PoS)
- **Block time:** ~20 seconds
- **Transaction finality:** ~2 minutes (practical), ~30 minutes (theoretical max for settlement assurance)
- **TPS (base layer):** ~7-10 simple transactions, higher with batching
- **Average transaction fee:** ~0.17-0.25 ADA (~$0.05-0.10)
- **Staking participation:** ~60-65% of total supply
- **Active stake pools:** ~3,000+
- **Native tokens minted:** 10M+ distinct assets
- **Plutus scripts deployed:** 10,000+
- **No slashing:** delegators never lose stake (unique among major PoS chains)

## Protocol Version History

| Era            | Focus            | Key Feature                                          |
| -------------- | ---------------- | ---------------------------------------------------- |
| Byron (2017)   | Foundation       | Basic transactions, federated consensus              |
| Shelley (2020) | Decentralization | Stake pools, delegation, rewards                     |
| Allegra (2020) | Token locking    | Time-lock scripts                                    |
| Mary (2021)    | Multi-asset      | Native tokens without smart contracts                |
| Alonzo (2021)  | Smart contracts  | Plutus scripts on mainnet                            |
| Babbage (2022) | Optimization     | Plutus V2, reference scripts, inline datums          |
| Chang (2024)   | Governance       | On-chain governance, DReps, Constitutional Committee |

## Founding Entities

- **IOG (Input Output Global)** — Core protocol research and development (Charles Hoskinson)
- **Emurgo** — Commercial adoption, enterprise partnerships, developer tooling
- **Cardano Foundation** — Community, education, governance facilitation (based in Switzerland)

## Unique Technical Features

- **eUTxO model:** Extended Unspent Transaction Output — deterministic execution, no failed transactions consuming fees, parallel processing
- **Native tokens:** First-class citizens on the ledger — no smart contract needed to mint/transfer, same security as ADA
- **Formal verification:** Protocols specified in Haskell with mathematical proofs (Agda, Isabelle)
- **No smart contract gas fees:** Script execution cost is predictable and calculated before submission
- **Liquid staking by default:** ADA remains in your wallet while staked, no lock-up period
- **Deterministic transactions:** Know the exact cost and outcome before submitting

## Quick Comparison Stats

| Feature         | Cardano             | Ethereum              | Solana            | Bitcoin        |
| --------------- | ------------------- | --------------------- | ----------------- | -------------- |
| Consensus       | Ouroboros PoS       | Gasper PoS            | Tower BFT/PoH     | Nakamoto PoW   |
| Block time      | ~20s                | ~12s                  | ~0.4s             | ~10min         |
| Tx model        | eUTxO               | Account               | Account           | UTXO           |
| Native tokens   | Yes (ledger-level)  | No (ERC-20 contracts) | No (SPL programs) | No             |
| Smart contracts | Plutus (Haskell)    | Solidity/Vyper        | Rust/C            | Bitcoin Script |
| Slashing        | No                  | Yes                   | Yes               | N/A            |
| Formal methods  | Yes (core protocol) | Partial               | No                | Minimal        |

## Key Ecosystem Projects

- **DEXes:** Minswap, SundaeSwap, MuesliSwap, WingRiders
- **Lending:** Liqwid Finance, Lenfi
- **Stablecoins:** Djed (algorithmic), iUSD, USDM
- **NFTs:** jpg.store, NMKR, Mutant Labs
- **Oracles:** Charli3, Orcfax
- **Dev tools:** Aiken (smart contract language), Lucid (tx builder), Blockfrost (API), Koios (decentralized API), Demeter.run (cloud infra)
- **L2/Sidechains:** Hydra (state channels), Mithril (light clients), Midnight (privacy), Milkomeda (EVM sidechain)

## Governance (Voltaire Era)

- **CIP process:** Cardano Improvement Proposals — community-driven protocol changes
- **Project Catalyst:** World's largest decentralized innovation fund (~$1B+ ADA allocated)
- **DReps:** Delegated Representatives — ADA holders delegate governance votes
- **Constitutional Committee:** Elected body ensuring governance actions comply with the Cardano Constitution
- **On-chain voting:** All governance actions (treasury withdrawals, parameter changes, hard forks) require on-chain vote
