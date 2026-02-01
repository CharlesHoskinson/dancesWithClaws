# Cardano Staking and Delegation

## Overview

Cardano uses a delegated proof-of-stake (DPoS) consensus mechanism where ADA holders can participate in block production by either running a stake pool or delegating their stake to an existing pool. Unlike many other proof-of-stake systems, Cardano's delegation mechanism is non-custodial: delegated ADA never leaves the owner's wallet, remains fully liquid at all times, and can be spent or re-delegated without any unbonding period. This design achieves strong security through broad participation while preserving the utility and liquidity of staked assets.

## Key Facts

- Staking rewards on Cardano typically range from 3% to 6% APY, depending on pool performance, saturation, and network parameters.
- The first rewards from a new delegation appear after approximately 20 days (4 full epochs), due to the epoch-based snapshot and reward distribution cycle.
- There is no minimum ADA requirement for staking. Any amount of ADA in a registered stake address earns rewards proportional to its delegation.
- Delegated ADA is never locked. It remains in the delegator's wallet and can be spent, transferred, or used in DeFi protocols at any time.
- Pool saturation is set at approximately 64-67 million ADA, a threshold designed to incentivize delegators to spread their stake across multiple pools rather than concentrating in a few large pools.
- As of 2025, approximately 67% of the total ADA supply participates in staking.
- Over 1.25 million wallets are actively staking across more than 3,000 registered stake pools.
- The total number of ADA wallets exceeds 4.83 million.

## Technical Details

### How Delegation Works

Cardano separates the concepts of payment credentials and staking credentials at the address level. A typical Cardano address encodes both a payment key (controlling spending) and a staking key (controlling delegation). This separation means:

1. **Registration**: A user registers their staking key on-chain by submitting a stake key registration certificate. This costs a refundable deposit of 2 ADA.
2. **Delegation**: The user submits a delegation certificate that associates their staking key with a specific stake pool. This takes effect at the next epoch boundary.
3. **Earning**: All ADA held at addresses associated with the registered staking key contributes to the delegated pool's total stake.
4. **Rewards**: Rewards are calculated per epoch and distributed automatically to the stake address. They compound automatically since they are held at a staked address.

### Epoch Cycle and Reward Timing

Cardano operates on 5-day epochs. The reward distribution follows a specific timeline:

- **Epoch N**: A snapshot of the stake distribution is taken at the beginning of the epoch.
- **Epoch N+1**: The snapshot from Epoch N becomes the active stake distribution used for block production.
- **Epoch N+2**: Rewards earned during Epoch N+1 (using the Epoch N snapshot) are calculated.
- **Epoch N+3**: Calculated rewards are distributed to delegators.

This means there is a delay of approximately 15-20 days from initial delegation to first reward. After the initial delay, rewards arrive every 5 days (every epoch) as long as the pool produces blocks.

### Reward Calculation

Rewards for each epoch are drawn from two sources:

1. **Monetary expansion**: New ADA minted from the reserve (the difference between total supply of 45 billion and current circulating supply). The monetary expansion parameter (rho) controls the fraction of reserves distributed each epoch.
2. **Transaction fees**: All transaction fees collected during the epoch are added to the reward pot.

From the total reward pot, a portion (currently 20%, controlled by the tau parameter) goes to the Cardano treasury. The remaining 80% is distributed to stake pools and their delegators based on:

- **Pool performance**: Pools that produce all their assigned blocks earn full rewards. Pools that miss blocks earn proportionally less.
- **Pool parameters**: Each pool sets a fixed cost (minimum 340 ADA per epoch) and a margin (percentage of pool rewards kept by the operator). Delegator rewards are calculated after subtracting the fixed cost and margin.
- **Pledge influence**: The a0 parameter provides a slight reward bonus to pools where the operator has pledged more of their own ADA, incentivizing skin-in-the-game.

### Pool Saturation

The saturation mechanism is a key design feature that promotes decentralization. The saturation point is calculated as:

```
Saturation Point = Total Staked ADA / Desired Number of Pools (k parameter)
```

With the k parameter set to 500 and approximately 67% of ADA staked, the saturation point falls in the range of 64-67 million ADA. When a pool's total delegation exceeds this threshold:

- The pool's rewards are capped as if it had exactly the saturation amount.
- Excess delegation earns diminishing returns.
- Delegators are incentivized to move to less saturated pools.

This mechanism naturally distributes stake across many pools, increasing the network's resilience to centralization. The k parameter can be adjusted through governance to increase the desired number of pools over time.

### Non-Custodial Design

Cardano's delegation is fundamentally non-custodial:

- Delegated ADA remains in the delegator's wallet. The pool operator never has access to delegated funds.
- Spending ADA requires only the payment key; the staking key is separate.
- There is no slashing mechanism. Delegators cannot lose their ADA due to pool operator misbehavior. The worst outcome is reduced or zero rewards if a pool performs poorly.
- There is no unbonding period. ADA can be spent or re-delegated immediately. The only delay is the epoch-based snapshot system, which means delegation changes take effect at the next epoch boundary.

### Multi-Pool Delegation

With the Conway era and CIP-inspired improvements, Cardano has explored mechanisms for delegating to multiple pools from a single wallet. Prior to this, users wanting to split their delegation across multiple pools needed to use multiple wallets or leverage smart contract-based solutions. Multi-pool delegation simplifies portfolio diversification for large ADA holders.

### Stake Pool Operations

Running a stake pool requires:

- A relay node and a block-producing node.
- A pool registration certificate specifying the pool's parameters (cost, margin, pledge).
- A 500 ADA refundable deposit for pool registration.
- Operational reliability to produce assigned blocks consistently.
- A pledge (pool operator's own staked ADA), which affects the pool's attractiveness and slight reward bonus.

Pool operators earn the fixed cost plus their declared margin percentage from each epoch's rewards before the remainder is distributed to delegators.

## Common Misconceptions

**"Staking locks your ADA."** This is false. Cardano staking is entirely liquid. Delegated ADA can be spent, transferred, or used in DeFi at any time. There is no lock-up or unbonding period. This is a key differentiator from many other PoS networks.

**"You can lose ADA through staking (slashing)."** Cardano has no slashing mechanism. If a pool performs poorly or goes offline, delegators simply earn reduced rewards. Their principal ADA is never at risk from the delegation itself.

**"Larger pools earn better rewards."** Due to the saturation mechanism, pools approaching or exceeding the saturation threshold actually provide diminishing returns to delegators. Mid-sized, well-performing pools near but below saturation tend to offer the most consistent returns.

**"You need a lot of ADA to stake."** There is no minimum stake requirement. Even a few ADA can be delegated and will earn proportional rewards. The only cost is the 2 ADA refundable deposit for stake key registration and a small transaction fee.

**"Rewards are paid instantly."** Due to the epoch-based snapshot system, initial rewards take approximately 20 days to appear. After the initial delay, rewards arrive every 5 days and compound automatically.

## Comparison Points

- **Ethereum Staking**: Requires 32 ETH minimum for solo validation. Staked ETH was locked until the Shapella upgrade and still involves exit queues. Liquid staking derivatives (Lido, Rocket Pool) add liquidity but introduce smart contract risk and centralization concerns. Ethereum has a slashing mechanism for validator misbehavior.
- **Cosmos Staking**: Features a 21-day unbonding period during which staked ATOM earns no rewards and cannot be transferred. Slashing is possible for double-signing. Delegation is available but with less liquidity than Cardano.
- **Polkadot Staking**: Uses nominated proof-of-stake (NPoS) with a 28-day unbonding period. Slashing applies to both validators and nominators. Has a minimum nomination amount that varies over time.
- **Solana Staking**: Delegation is available with a roughly 2-day warmup and cooldown period. No slashing is currently implemented, similar to Cardano. However, Solana's validator set is more concentrated due to hardware requirements.

## Sources

- Cardano Documentation — Staking and Delegation: https://docs.cardano.org/about-cardano/learn/delegation/
- Cardano Staking Information: https://cardano.org/stake-pool-delegation/
- Pool.pm — Stake Pool Explorer: https://pool.pm/
- ADApools.org: https://adapools.org/
- IOG Blog — Staking and Delegating: https://iohk.io/en/blog/posts/2020/11/13/the-general-perspective-on-staking-in-cardano/

## Last Updated

2025-02-01
