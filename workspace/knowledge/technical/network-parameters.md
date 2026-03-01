# Cardano Network Parameters

## Overview

Cardano's behavior is governed by a set of updatable protocol parameters that control everything from block size and transaction limits to staking economics and smart contract execution budgets. Unlike hardcoded protocol rules, these parameters can be adjusted through the on-chain governance process without requiring a hard fork. This design provides the network with flexibility to adapt to changing conditions, optimize performance, and respond to community needs while maintaining protocol stability. Understanding these parameters is essential for developers building on Cardano, stake pool operators managing infrastructure, and governance participants voting on parameter changes.

## Key Facts

- Cardano epochs last 5 days (432,000 slots), with each slot lasting 1 second.
- The maximum block body size is 90,112 bytes (88 KB), increased from the original 64 KB through governance.
- The maximum transaction size is 16,384 bytes (16 KB).
- The minimum fixed cost for stake pool operation is 340 ADA per epoch.
- Plutus smart contracts are metered using execution units measured in memory (bytes) and CPU (picoseconds) rather than a single gas metric.
- Daily transaction volume averaged approximately 71,500 transactions in Q4 2024.
- All protocol parameters are subject to change through the governance mechanism introduced in the Conway era.

## Technical Details

### Epoch and Slot Structure

Cardano's time is divided into epochs and slots:

- **Slot**: The smallest unit of time in the protocol, lasting 1 second. Each slot represents an opportunity for a block to be produced, but not every slot will have a block.
- **Block**: Produced when a slot leader is elected for a given slot. The active slot coefficient (f) determines the probability that any given slot has a leader. Currently set to 0.05, this means approximately 5% of slots produce blocks, yielding roughly one block every 20 seconds on average.
- **Epoch**: A period of 432,000 slots (5 days). Epoch boundaries trigger stake distribution snapshots, reward calculations, and parameter updates.

The 20-second average block time is a deliberate design choice balancing throughput against propagation time. Blocks need sufficient time to propagate across the global network before the next block is produced to minimize chain forks.

### Block and Transaction Size Parameters

Key size parameters that govern throughput:

| Parameter                       | Value                | Description                           |
| ------------------------------- | -------------------- | ------------------------------------- |
| maxBlockBodySize                | 90,112 bytes         | Maximum size of a block body          |
| maxTxSize                       | 16,384 bytes         | Maximum size of a single transaction  |
| maxBlockHeaderSize              | 1,100 bytes          | Maximum size of a block header        |
| maxBlockExecutionUnits (memory) | 62,000,000 units     | Maximum total Plutus memory per block |
| maxBlockExecutionUnits (steps)  | 20,000,000,000 steps | Maximum total Plutus CPU per block    |
| maxTxExecutionUnits (memory)    | 14,000,000 units     | Maximum Plutus memory per transaction |
| maxTxExecutionUnits (steps)     | 10,000,000,000 steps | Maximum Plutus CPU per transaction    |

These parameters collectively determine the network's throughput capacity. The block size limits how many transactions can fit in each block, while execution unit limits constrain the computational complexity of smart contract transactions.

### Transaction Fees

Cardano uses a deterministic fee model based on transaction size and execution:

```
Fee = txFeeFixed + txFeePerByte * tx_size + script_execution_fee
```

Key fee parameters:

- **txFeeFixed**: 155,381 lovelace (base fee for any transaction).
- **txFeePerByte**: 44 lovelace per byte of transaction size.
- **executionUnitPrices (memory)**: 0.0577 lovelace per memory unit.
- **executionUnitPrices (steps)**: 0.0000721 lovelace per CPU step.

A typical simple ADA transfer (approximately 300 bytes) costs roughly 170,000 lovelace (0.17 ADA). Smart contract transactions cost more due to their larger size and additional execution unit fees.

The deterministic fee model is a significant feature: users know the exact fee before submitting a transaction. There is no fee auction, no gas price volatility, and no risk of a transaction consuming fees but failing to execute (Plutus scripts are evaluated deterministically off-chain before submission).

### Execution Units: Memory and CPU

Instead of Ethereum's single-dimensional gas model, Cardano uses a two-dimensional resource model for smart contract execution:

- **Memory**: Measured in abstract memory units, representing the peak memory consumption of script execution. This maps to actual RAM usage on validator nodes.
- **CPU Steps**: Measured in abstract CPU steps (picoseconds of idealized execution time), representing the computational work required.

This two-dimensional model allows more precise resource accounting. A script that is computationally light but memory-heavy is not penalized for CPU it does not use, and vice versa. The block-level limits for both dimensions must be satisfied independently, preventing any single resource from being exhausted.

### Staking and Pool Parameters

Parameters governing the staking system:

| Parameter        | Value   | Description                                   |
| ---------------- | ------- | --------------------------------------------- |
| k (nOpt)         | 500     | Desired number of stake pools                 |
| a0               | 0.3     | Pledge influence factor                       |
| rho              | 0.003   | Monetary expansion rate per epoch             |
| tau              | 0.2     | Treasury tax rate on rewards                  |
| minPoolCost      | 340 ADA | Minimum fixed pool cost per epoch             |
| stakePoolDeposit | 500 ADA | Refundable deposit for pool registration      |
| stakeKeyDeposit  | 2 ADA   | Refundable deposit for stake key registration |

The k parameter is particularly significant as it determines the saturation point for pools. With k=500, the ideal scenario is 500 equally-sized pools. Increasing k would lower the saturation threshold per pool, encouraging more pools and greater decentralization, but also potentially fragmenting stake among pools too small to consistently produce blocks.

### Minimum UTxO Value

Every UTxO on Cardano must contain a minimum amount of ADA, calculated based on the size of the UTxO:

```
minUTxOValue = coinsPerUTxOByte * utxo_size_in_bytes
```

The `coinsPerUTxOByte` parameter (currently 4,310 lovelace) ensures that maintaining UTxO entries in the ledger state has a cost proportional to the storage burden they impose. UTxOs carrying native tokens require more ADA because they are larger. This mechanism prevents spam attacks that could bloat the UTxO set with dust entries.

### Governance Parameters (Conway Era)

The Conway era introduced on-chain governance with new parameters:

- **dRepDeposit**: Deposit required to register as a Delegated Representative (DRep).
- **dRepActivity**: Number of epochs a DRep can be inactive before being considered dormant.
- **govActionDeposit**: Deposit required to submit a governance action.
- **govActionLifetime**: Number of epochs a governance action remains active for voting.
- **committeeMinSize**: Minimum number of Constitutional Committee members.
- **committeeMaxTermLength**: Maximum term length for committee members in epochs.

Protocol parameter changes are now proposed as governance actions and must be ratified by DReps, stake pool operators, and/or the Constitutional Committee depending on the parameter category.

### Parameter Categories

Parameters are grouped into categories with different governance requirements:

- **Network parameters** (block size, tx size): Require SPO vote + DRep vote.
- **Economic parameters** (fees, costs): Require DRep vote + Constitutional Committee.
- **Technical parameters** (execution units, collateral): Require DRep vote + Constitutional Committee.
- **Governance parameters** (voting thresholds, deposits): Require DRep vote + Constitutional Committee.

This categorization ensures that parameter changes receive appropriate scrutiny from the stakeholders most affected by the change.

## Common Misconceptions

**"Cardano can only process a fixed number of transactions per second."** TPS depends on transaction size and type. Simple ADA transfers are small and many fit per block; complex smart contract transactions are larger and fewer fit. Quoting a single TPS number is misleading without specifying the transaction type.

**"Parameters are fixed and cannot change without a hard fork."** Protocol parameters are explicitly designed to be updatable through governance. The hard fork mechanism is reserved for changes that require new ledger rules or capabilities, not parameter adjustments.

**"Higher block size always means better performance."** Increasing block size improves throughput but also increases propagation delay, which can lead to more orphaned blocks and reduced security. Parameter changes involve careful tradeoff analysis.

**"Cardano uses gas like Ethereum."** Cardano's two-dimensional execution unit model (memory + CPU) is fundamentally different from Ethereum's single-dimensional gas model. Additionally, Cardano fees are deterministic and known before submission, unlike Ethereum's fee auction mechanism.

## Comparison Points

- **Ethereum**: Uses a single gas dimension, dynamic fee market (EIP-1559), and variable block sizes (gas limit). Fees fluctuate based on demand, and transactions can fail after consuming gas. Cardano's deterministic fees and two-dimensional resource model provide more predictable costs.
- **Bitcoin**: Uses fixed 10-minute blocks with a 4 MB weight limit. Fee market is purely auction-based. Bitcoin has no on-chain governance for parameter changes; they require soft or hard forks with community consensus.
- **Solana**: Uses 400ms block times with significantly higher throughput but also higher hardware requirements for validators. Solana's parameters are less formally governed.

## Sources

- Cardano Documentation — Protocol Parameters: https://docs.cardano.org/about-cardano/explore-more/protocol-parameters/
- Cardano Protocol Parameters (live): https://cexplorer.io/params
- CIP-1694 — On-Chain Governance: https://cips.cardano.org/cip/CIP-1694
- Cardano Ledger Specification: https://github.com/intersectmbo/cardano-ledger
- IOG Blog — Network Parameters: https://iohk.io/en/blog/

## Last Updated

2025-02-01
