# Voltaire Era

## Overview

The Voltaire era represents the final stage of Cardano's multi-phase development roadmap, bringing full decentralized governance to the blockchain. Named after the French Enlightenment philosopher Francois-Marie Arouet (Voltaire), who championed civil liberties and the separation of powers, this era embeds self-sustaining governance directly into the protocol. With the activation of the Chang hard fork on September 1, 2024, Cardano transitioned from a system where founding entities (Input Output Global, the Cardano Foundation, and EMURGO) held significant decision-making power to one where the community governs the chain through on-chain mechanisms.

The Voltaire era is not a single event but a progressive rollout. The Chang hard fork initiated the first phase, introducing governance infrastructure, and subsequent upgrades continue to refine and expand the system. The goal is a blockchain that can evolve, fund itself, and resolve disputes without reliance on any centralized authority.

## Key Facts

- **Launch date**: September 1, 2024, via the Chang hard fork.
- **Governance framework**: Defined primarily by CIP-1694, which specifies on-chain governance actions and voting procedures.
- **Three governance bodies**: Delegated Representatives (DReps), Stake Pool Operators (SPOs), and the Constitutional Committee (CC).
- **Cardano Constitution**: A foundational document ratified by the community that sets the rules and principles for governance decisions. The constitution was ratified at a constitutional convention held in Buenos Aires, Argentina, in December 2024.
- **First governance votes**: Occurred in October 2024, marking the first time ADA holders participated in on-chain governance decisions through their DReps.
- **DRep delegation**: Approximately 20% of circulating ADA was delegated to DReps by the end of 2024, establishing an early baseline for governance participation.
- **Treasury**: The Cardano treasury, funded by a portion of transaction fees and monetary expansion, is governed through on-chain proposals and votes under the Voltaire framework.

## Technical Details

### Governance Architecture

The Voltaire governance model is built on a system of checks and balances distributed across three bodies:

1. **Delegated Representatives (DReps)**: ADA holders can either vote directly as their own DRep or delegate their voting power to a registered DRep. This liquid democracy model allows participation without requiring every holder to evaluate every proposal. Delegation does not transfer tokens; it only assigns voting weight.

2. **Stake Pool Operators (SPOs)**: SPOs participate in governance votes on protocol parameter changes and hard fork initiation. Their role in governance extends their existing responsibility for block production into the decision-making layer.

3. **Constitutional Committee (CC)**: A group of elected members who review governance actions for compliance with the Cardano Constitution. They serve as a constitutional check, ensuring that proposals do not violate the foundational principles of the ecosystem.

### Governance Actions

Under CIP-1694, several types of governance actions can be submitted on-chain:

- **Treasury withdrawals**: Proposals to allocate funds from the Cardano treasury.
- **Protocol parameter changes**: Adjustments to network parameters such as fees, block size, or Plutus execution costs.
- **Hard fork initiation**: Proposals to upgrade the protocol through a hard fork.
- **Motion of no confidence**: A mechanism to signal loss of confidence in the Constitutional Committee.
- **Update Constitutional Committee**: Add or remove members of the CC.
- **Update the Constitution**: Amend or replace the Cardano Constitution.
- **Info actions**: Non-binding polls or signals from the community.

Each governance action type requires approval from a specific combination of the three governance bodies. For example, treasury withdrawals require DRep and CC approval, while hard fork initiation requires all three bodies.

### Liquid Democracy

The liquid democracy model is a distinguishing feature of Voltaire. Unlike traditional representative democracy where votes are cast at fixed intervals, ADA holders can:

- Delegate to a DRep at any time.
- Change or withdraw delegation at any time.
- Become a DRep themselves with minimal barriers to entry.
- Vote directly on proposals if they prefer not to delegate.

This creates a fluid system where representation can shift in response to the performance and positions of DReps, rather than being locked in for fixed terms.

### Voting Mechanics

Votes are recorded on-chain as transactions. The weight of a vote is proportional to the ADA stake backing the voter (either directly held or delegated). Governance actions have defined thresholds that must be met for approval, and these thresholds vary by action type. There are also expiration periods after which unresolved proposals lapse.

## Common Misconceptions

- **"Voltaire means Cardano is finished."** The Voltaire era is the final named phase of the roadmap, but it does not mean development stops. It means the community now governs what gets built and funded. Ongoing development continues through governance-approved proposals and treasury funding.

- **"Only large ADA holders have influence."** While voting power is stake-weighted, the delegation system allows smaller holders to pool their influence through DReps. A DRep with broad community support can represent thousands of delegators regardless of individual stake sizes.

- **"The Constitutional Committee can block anything."** The CC can only block governance actions that violate the constitution. It cannot unilaterally impose decisions, and the community can replace CC members through a governance action if they act improperly.

- **"Governance participation is mandatory."** ADA holders are not required to participate in governance. Those who do not delegate or vote simply do not contribute to the governance quorum, though this may mean forgoing voting rewards.

- **"The founding entities no longer have any role."** While the Chang hard fork significantly reduced the control of founding entities, they still participate as ecosystem members. Input Output Global, the Cardano Foundation, and EMURGO continue to contribute to development, marketing, and ecosystem support, but they no longer hold privileged governance positions.

## Comparison Points

| Feature             | Cardano Voltaire                | Ethereum Governance                  | Bitcoin Governance                  |
| ------------------- | ------------------------------- | ------------------------------------ | ----------------------------------- |
| On-chain voting     | Yes, protocol-level             | Limited (off-chain signaling common) | No formal on-chain governance       |
| Delegation          | Liquid democracy via DReps      | No native delegation for governance  | N/A                                 |
| Constitution        | Ratified document               | No formal constitution               | No formal constitution              |
| Treasury            | On-chain, community-governed    | No protocol treasury                 | No protocol treasury                |
| Governance bodies   | Three (DReps, SPOs, CC)         | Informal (core devs, EF, community)  | Informal (core devs, miners, nodes) |
| Checks and balances | Constitutional Committee review | No formal mechanism                  | No formal mechanism                 |

Compared to other blockchain governance systems, Voltaire is notable for its formalized structure. Many blockchains rely on informal governance through social consensus, developer influence, or foundation decisions. Cardano's approach attempts to codify governance rules directly into the protocol, reducing ambiguity about how decisions are made and who has authority.

## Sources

- CIP-1694: An On-Chain Decentralized Governance Mechanism for Voltaire, Cardano Improvement Proposals repository (https://github.com/cardano-foundation/CIPs)
- Cardano Roadmap, Voltaire era (https://roadmap.cardano.org/en/voltaire/)
- Chang Hard Fork announcement, Input Output Global (https://iohk.io)
- Cardano Constitution ratification proceedings, Constitutional Convention Buenos Aires, December 2024
- Cardano governance explorer data on DRep delegation statistics

## Last Updated

2025-02-01
