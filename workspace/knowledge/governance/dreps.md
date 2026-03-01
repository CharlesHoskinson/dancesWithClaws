# Delegated Representatives (DReps)

## Overview

Delegated Representatives, commonly known as DReps, are a cornerstone of Cardano's on-chain governance system introduced during the Voltaire era. DReps serve as elected representatives to whom ADA holders can delegate their voting power on governance actions. The DRep system implements a form of liquid democracy, where token holders are not required to personally evaluate and vote on every governance proposal. Instead, they can delegate their governance stake to a DRep whose judgment and values they trust, while retaining the ability to change or revoke that delegation at any time.

The DRep mechanism was specified in CIP-1694 and became operational with the Chang hard fork on September 1, 2024. By the end of 2024, thousands of DReps had registered on-chain, and approximately 20% of circulating ADA had been delegated to DReps, establishing the initial foundation for participatory governance on Cardano.

## Key Facts

- **Introduced**: September 1, 2024, via the Chang hard fork.
- **Specification**: Defined in CIP-1694 (On-Chain Decentralized Governance Mechanism for Voltaire).
- **Governance model**: Liquid democracy, meaning delegation is fluid and can be changed at any time.
- **Registration**: Open to any ADA holder. Registration is performed through an on-chain transaction.
- **Registered DReps**: Thousands of DReps had registered by the end of 2024.
- **Delegated stake**: Approximately 20% of circulating ADA was delegated to DReps by end of 2024.
- **Voting scope**: DReps vote on governance actions including treasury withdrawals, protocol parameter changes, constitutional amendments, and more.
- **Rewards**: DReps and their delegators are eligible for voting rewards, incentivizing participation in governance.
- **Token custody**: Delegation does not transfer ADA. Tokens remain in the delegator's wallet at all times.

## Technical Details

### How DRep Registration Works

Any ADA holder can register as a DRep by submitting a registration transaction on-chain. The registration process involves:

1. **Registration certificate**: The user creates a DRep registration certificate, which includes their DRep credential (a verification key hash or script hash) and an optional anchor (a URL pointing to metadata about the DRep).

2. **Metadata anchor**: DReps can provide an anchor URL that links to off-chain metadata such as their name, bio, platform, contact information, and governance philosophy. This metadata helps delegators evaluate DReps before delegating. The anchor URL points to a JSON file whose hash is recorded on-chain to ensure integrity.

3. **Deposit**: Registration requires a refundable deposit (defined by a protocol parameter), which discourages spam registrations. The deposit is returned when the DRep deregisters.

4. **On-chain transaction**: The registration certificate is submitted as part of a standard Cardano transaction, recorded immutably on the blockchain.

### Delegation Mechanics

Delegation to a DRep is a separate action from stake delegation for block production (which is delegated to Stake Pool Operators). Governance delegation and staking delegation are independent:

- **Separate delegation**: An ADA holder can delegate their stake to one SPO for staking rewards and to a different DRep for governance voting. These are independent choices.
- **Delegation transaction**: Delegating to a DRep is accomplished by submitting a vote delegation certificate in an on-chain transaction.
- **Instant effect**: Delegation takes effect at the next epoch boundary after the transaction is confirmed.
- **No lock-up**: Delegated ADA remains fully liquid. The delegator can spend, transfer, or re-delegate their ADA at any time without restriction.
- **Change anytime**: Delegators can switch their DRep delegation at any time by submitting a new delegation certificate. The new delegation overrides the previous one.

### Special Delegation Options

In addition to delegating to a specific registered DRep, ADA holders have two special delegation options:

- **Abstain**: Delegating to the "Abstain" option means the holder's stake does not count toward any governance vote, but it also does not count against the quorum threshold. This is a conscious choice to not participate.
- **No Confidence**: Delegating to "No Confidence" is a signal that the holder does not trust the current Constitutional Committee. This stake counts toward no-confidence motions against the CC.

These special options ensure that ADA holders who do not wish to delegate to a specific DRep still have meaningful ways to express their governance preferences.

### Voting Process

When a governance action is submitted on-chain, DReps can vote on it during the voting period:

- **Vote options**: Yes, No, or Abstain.
- **Vote weight**: A DRep's vote weight equals the total ADA delegated to them (including their own stake).
- **On-chain votes**: Votes are submitted as on-chain transactions, providing transparency and immutability.
- **Threshold**: Each type of governance action has a defined approval threshold (e.g., a percentage of total active delegated stake that must vote Yes). The specific thresholds are protocol parameters and can themselves be changed through governance.
- **Expiration**: Governance actions have an expiration period. If the required thresholds are not met before expiration, the action lapses.

### DRep Activity and Expiration

To maintain a healthy governance system, DReps have an activity requirement:

- **Activity period**: DReps must vote on at least one governance action within a defined activity period (a protocol parameter measured in epochs).
- **Inactive status**: DReps who do not vote within the activity period become inactive. Their delegated stake no longer counts toward the active voting stake for quorum and threshold calculations.
- **Re-activation**: An inactive DRep can become active again by voting on a governance action or by submitting an update certificate.

This mechanism prevents stale delegations from permanently distorting governance outcomes.

### Voting Rewards

Participation in governance is incentivized through voting rewards:

- DReps who actively vote on governance actions are eligible for rewards.
- Delegators who delegate to active DReps may also receive governance rewards.
- The reward mechanism encourages both DRep participation and delegator engagement in selecting active, responsible representatives.

The specific reward structure and amounts are governed by protocol parameters and may evolve through governance decisions.

## Common Misconceptions

- **"Delegating to a DRep means giving them your ADA."** This is incorrect. Delegation only assigns voting power. ADA never leaves the delegator's wallet. The delegator retains full custody and can spend or move their tokens freely.

- **"You can only delegate to one DRep."** As of the initial implementation, each wallet delegates its full governance stake to a single DRep (or to Abstain/No Confidence). However, users with multiple wallets can delegate each wallet to a different DRep. Future protocol upgrades may enable split delegation from a single wallet.

- **"DReps are elected in formal elections."** There is no election cycle for DReps. Any ADA holder can register as a DRep at any time. Delegators choose their DReps freely and can change their choice at any time. The "election" is continuous and organic rather than periodic.

- **"DReps make decisions for you permanently."** Delegation is revocable at any time. If a delegator disagrees with how their DRep votes, they can instantly switch to a different DRep or choose to vote directly themselves.

- **"Only technical experts can be DReps."** While technical knowledge is valuable, DReps can represent any perspective or expertise. Some DReps focus on technical proposals, while others may specialize in community development, education, or policy. The diversity of DReps is a feature of the system.

- **"DRep governance replaces stake pool delegation."** DRep delegation for governance and SPO delegation for staking are completely independent systems. Delegating to a DRep does not affect staking rewards or pool delegation.

## Comparison Points

| Feature              | Cardano DReps                           | Polkadot OpenGov                    | Cosmos Governance                            |
| -------------------- | --------------------------------------- | ----------------------------------- | -------------------------------------------- |
| Delegation model     | Liquid democracy (revocable anytime)    | Delegation to tracks/referenda      | Delegation to validators (inheritable votes) |
| Registration         | Open, on-chain, deposit required        | N/A (direct voting with delegation) | N/A (validators vote by default)             |
| Delegation scope     | Governance only (separate from staking) | Per-referendum delegation possible  | Governance follows staking delegation        |
| Activity requirement | Yes (activity period)                   | No formal DRep activity requirement | No formal activity requirement               |
| Special options      | Abstain, No Confidence                  | Abstain                             | Abstain, No With Veto                        |
| Token custody        | Tokens stay with delegator              | Tokens may be locked during voting  | Tokens stay with delegator                   |
| Vote weight          | Proportional to delegated ADA           | Proportional to locked DOT          | Proportional to delegated ATOM               |

Cardano's DRep system is notable for its clean separation between staking delegation and governance delegation, and for its explicit liquid democracy model where delegation changes are immediate and frictionless.

## Sources

- CIP-1694: An On-Chain Decentralized Governance Mechanism for Voltaire (https://github.com/cardano-foundation/CIPs/tree/master/CIP-1694)
- Cardano Node and Ledger documentation on governance (https://docs.cardano.org)
- Chang Hard Fork specification and governance implementation details
- DRep registration and delegation data from Cardano governance explorers
- Input Output Global documentation on Voltaire governance design

## Last Updated

2025-02-01
