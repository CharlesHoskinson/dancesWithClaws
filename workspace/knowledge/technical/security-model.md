# Cardano Security Model

## Overview

Cardano's security model is built on multiple layers of defense, spanning consensus protocol design, transaction model properties, formal verification, and economic incentives. The protocol has operated since 2017 with zero successful attacks on the core protocol. Its security properties emerge from the combination of the Ouroboros proof-of-stake consensus family (with formal security proofs), the extended UTxO (eUTxO) transaction model (which eliminates reentrancy and provides deterministic execution), and an economic design that makes attacks prohibitively expensive. This multi-layered approach contrasts with systems that rely primarily on a single security mechanism.

## Key Facts

- The eUTxO model structurally prevents reentrancy attacks, the vulnerability class responsible for the most significant exploits in blockchain history (including Ethereum's DAO hack).
- Plutus smart contract execution is fully deterministic: a transaction either succeeds or fails identically regardless of when or where it is evaluated.
- Ouroboros has formal security proofs published in peer-reviewed cryptographic research, demonstrating security under clearly stated assumptions.
- A 51% attack on Cardano would require an attacker to control 51% of all staked ADA, which at current participation levels represents a substantial portion of the total ADA supply.
- Practical finality on Cardano is achieved after approximately 15 days (3 complete epochs), though probabilistic finality strengthens with each subsequent block.
- There have been zero successful attacks on Cardano's core protocol since its launch.

## Technical Details

### Consensus Security: Ouroboros

The Ouroboros family of protocols (Classic, Praos, Genesis, Leios) provides the consensus layer with formally proven security guarantees. The current production protocol, Ouroboros Praos, has been proven to satisfy three critical properties under the assumption that the majority of stake is held by honest participants:

**Common Prefix (Consistency)**: If two honest nodes examine their local chains, they will agree on all blocks except for a bounded number of the most recent ones. This means the deeper a block is in the chain, the more certain its finality.

**Chain Growth**: The chain grows at a minimum rate proportional to the honest stake fraction. This prevents an adversary from stalling the chain by refusing to produce blocks.

**Chain Quality**: A sufficient proportion of blocks in any sufficiently long stretch of the chain will have been produced by honest stake pool operators. This prevents an adversary with minority stake from dominating block production.

These proofs are constructed in the Universal Composability (UC) framework and the Global UC (GUC) framework, providing strong guarantees about protocol behavior even when composed with other protocols and in the presence of adaptive adversaries.

### 51% Attack Threshold

To compromise Cardano's consensus, an attacker would need to control more than 50% of the active staked ADA. The practical implications are significant:

- With approximately 67% of the total ADA supply staked (~24.5 billion ADA), an attacker would need to control roughly 12.25 billion ADA.
- Acquiring this amount on the open market would be practically impossible without driving the price to extreme levels, as the available liquid supply is a fraction of the staked amount.
- Even if acquired, delegating such a large amount to attacker-controlled pools would be publicly visible on the transparent blockchain, giving the community time to respond.
- The attack would devalue the attacker's own holdings, creating a strong economic disincentive.

This security model is analogous to Bitcoin's 51% hash rate requirement but substitutes capital stake for energy expenditure.

### eUTxO and Reentrancy Prevention

Reentrancy is one of the most dangerous vulnerability classes in smart contract platforms. In an account-based model (like Ethereum's EVM), a contract call can trigger a callback to the calling contract before the first call completes, potentially allowing the attacker to manipulate state in unexpected ways. The 2016 DAO hack exploited exactly this pattern, resulting in the loss of 3.6 million ETH.

Cardano's eUTxO model eliminates reentrancy by construction:

- A transaction consumes specific UTxOs as inputs and produces new UTxOs as outputs. This is an atomic operation.
- Each UTxO can only be consumed once. There is no persistent mutable state that can be manipulated during execution.
- Validator scripts evaluate whether a UTxO can be spent based on the complete transaction context (all inputs, all outputs, validity range, etc.), but they cannot call other scripts or trigger callbacks.
- The entire transaction either succeeds (all validators approve) or fails (no state changes). There are no partial state updates.

This model makes it structurally impossible for a reentrancy attack to occur. The vulnerability simply does not exist in the execution model.

### Deterministic Execution

Plutus script execution on Cardano is fully deterministic, meaning that if a transaction validates successfully on the user's local machine, it will validate identically on every node in the network. This property provides several security benefits:

- **No front-running**: The outcome of a transaction does not depend on ordering relative to other transactions within a block (since each transaction specifies exactly which UTxOs it consumes).
- **No unexpected failures**: A transaction that is constructed and validated locally will not fail unexpectedly when submitted to the network (barring the consumed UTxOs being spent by another transaction first).
- **No fee loss on failure**: Because transactions are validated locally before submission, users do not pay fees for failed transactions. This contrasts with Ethereum, where transactions can fail after consuming gas.

The determinism comes from the eUTxO model's explicit state management: a transaction declares all inputs and outputs explicitly, and the blockchain state at the time of construction is exactly the state the transaction operates on.

### Finality Model

Cardano uses probabilistic finality, where the probability of a block being reversed decreases exponentially with each subsequent block added to the chain:

- **After 1 block (~20 seconds)**: Low confidence. The block could theoretically be replaced by a competing fork.
- **After several blocks (~minutes)**: Moderate confidence. An attacker would need significant stake to produce a competing chain.
- **After 1 epoch (5 days)**: High confidence. The stake distribution snapshot ensures that the block is anchored in a committed epoch.
- **After 3 epochs (~15 days)**: Practical finality. The reward distribution based on this epoch has been calculated and distributed, making reversal economically meaningless.

For most practical purposes, exchanges and services consider transactions confirmed after a much shorter period (typically 15-30 blocks, or roughly 5-10 minutes), accepting the extremely small residual probability of reversal.

### Key Management and Address Security

Cardano's hierarchical deterministic (HD) wallet structure based on BIP-32/BIP-44 standards provides:

- Separate key derivation for payment and staking credentials.
- Hardware wallet support (Ledger, Trezor) for cold key storage.
- Multi-signature transactions through native script capabilities.
- Extended address formats that encode both payment and delegation credentials.

Stake pool operators use a separate cold key, KES (Key Evolving Signature) key, and VRF (Verifiable Random Function) key structure. The cold key is kept offline, while the KES key rotates periodically (every 36 hours with current parameters), limiting the window of vulnerability if a hot key is compromised.

### Script Security

Plutus scripts have several built-in safety features:

- **Budget limits**: Every script execution has a hard budget in memory and CPU units. Scripts that exceed their budget are terminated, preventing infinite loops or resource exhaustion attacks.
- **Collateral**: Transactions containing Plutus scripts must include collateral inputs that are forfeited if the script fails during phase-2 validation. This disincentivizes submission of invalid transactions.
- **Reference scripts**: Scripts can be stored on-chain as reference scripts, reducing transaction size and enabling code auditing by the community before interaction.
- **Type safety**: Plutus Core's type system prevents many classes of programming errors at the language level.

## Common Misconceptions

**"Proof-of-stake is less secure than proof-of-work."** The security assumptions differ but are not inherently weaker. Ouroboros has formal proofs demonstrating security equivalent to Bitcoin's Nakamoto consensus under analogous assumptions (honest majority of stake vs. honest majority of hash power). The economic cost of a 51% attack on a large PoS network can exceed that of a PoW network.

**"No slashing means validators can misbehave without consequence."** While Cardano does not use slashing (destroying staked funds), misbehaving pools lose delegators and rewards. The economic incentive to behave honestly comes from ongoing revenue rather than the threat of capital destruction. Delegators can instantly re-delegate away from underperforming pools.

**"Smart contracts on Cardano are less secure because the eUTxO model is more complex."** The eUTxO model has a steeper learning curve but provides stronger security guarantees. The elimination of reentrancy alone removes the single most costly vulnerability class in smart contract history. The explicit state model forces developers to reason about state transitions more carefully, which tends to produce more secure code.

**"Cardano has never been tested by a real attack."** While Cardano has not suffered a successful protocol-level attack, the network has weathered sustained stress tests, spam attempts, and DDoS-style load events. The formal security proofs provide mathematical confidence beyond empirical testing.

## Comparison Points

- **Bitcoin**: Relies on proof-of-work with Nakamoto consensus. Security proofs are informal but well-studied. The 51% attack threshold is in hash rate rather than stake. Bitcoin's script language is intentionally limited, which reduces smart contract attack surface but also limits functionality.
- **Ethereum**: Account-based model with the EVM is susceptible to reentrancy, front-running, and non-deterministic execution failures. Ethereum's transition to proof-of-stake (The Merge) added slashing for validators. The rich smart contract ecosystem has experienced numerous high-profile exploits totaling billions in losses.
- **Solana**: Uses proof-of-history combined with proof-of-stake. Has experienced multiple network outages and required validator restarts, raising questions about resilience. Does not have formal security proofs for its consensus mechanism comparable to Ouroboros.
- **Cosmos**: Uses Tendermint BFT consensus with instant finality but requires two-thirds honest validators. Slashing is implemented for double-signing and extended downtime.

## Sources

- Kiayias, A., Russell, A., David, B., & Oliynykov, R. (2017). "Ouroboros: A Provably Secure Proof-of-Stake Blockchain Protocol." CRYPTO 2017.
- David, B., Gazi, P., Kiayias, A., & Russell, A. (2018). "Ouroboros Praos." EUROCRYPT 2018.
- Badertscher, C., Gazi, P., Kiayias, A., Russell, A., & Zikas, V. (2018). "Ouroboros Genesis." CCS 2018.
- Cardano Documentation — Security: https://docs.cardano.org/
- IOG Research Library: https://iohk.io/en/research/library/

## Last Updated

2025-02-01
