# Constitutional Committee

## Overview

The Constitutional Committee (CC) is one of the three governance bodies in Cardano's Voltaire-era governance system, alongside Delegated Representatives (DReps) and Stake Pool Operators (SPOs). The CC serves as a constitutional safeguard, reviewing governance actions to ensure they comply with the Cardano Constitution. Its role is to provide a check against governance decisions that, while potentially popular, may violate the foundational principles and rules of the ecosystem. The Constitutional Committee does not initiate governance actions; rather, it acts as a review and approval body that can block proposals it deems unconstitutional.

The CC was introduced as part of the Chang hard fork on September 1, 2024, and began with an initial set of seven members. These members were selected to bootstrap the governance system, with the expectation that future members would be elected through the on-chain governance process. The Constitutional Committee represents a deliberate design choice to balance democratic governance with constitutional rule of law, preventing a pure majority-rule system where any proposal could pass with sufficient votes regardless of its alignment with the ecosystem's foundational principles.

## Key Facts

- **Initial composition**: Seven members at launch.
- **Role**: Review governance actions for compliance with the Cardano Constitution.
- **Authority**: Can block (effectively veto) governance actions that violate the constitution. Cannot initiate governance actions independently.
- **Term limits**: CC members serve defined terms and must be re-elected or replaced through governance actions.
- **Election**: Future CC members are elected through on-chain governance actions, requiring approval from DReps.
- **Quorum**: The CC has a defined quorum threshold (a protocol parameter) specifying the minimum number of members who must vote for a decision to be valid.
- **Introduced**: September 1, 2024, via the Chang hard fork, as specified in CIP-1694.
- **Replaceable**: The community can replace individual CC members or the entire committee through governance actions, including a motion of no confidence.

## Technical Details

### Constitutional Review Function

The primary function of the CC is to evaluate governance actions against the Cardano Constitution. For most governance action types, CC approval is required in addition to DRep and/or SPO approval. The CC's review process works as follows:

1. **Governance action submitted**: A governance action is submitted on-chain by any ADA holder (with the required deposit).
2. **Voting period opens**: DReps, SPOs (where applicable), and CC members can vote on the action during the defined voting period.
3. **CC evaluation**: CC members evaluate whether the proposed action complies with the Cardano Constitution. Each CC member votes Yes, No, or Abstain.
4. **CC threshold**: For the CC to approve an action, the proportion of Yes votes among CC members must meet or exceed the CC quorum threshold (a protocol parameter). For example, if the threshold is set to a majority, at least four of seven members must vote Yes.
5. **Combined approval**: A governance action passes only if it receives sufficient approval from all required governance bodies. If the CC votes to block an action (by not meeting the approval threshold), the action fails regardless of DRep or SPO support.

### Governance Actions Requiring CC Approval

Not all governance action types require CC approval. The requirement depends on the action type:

| Governance Action               | DRep Vote Required | SPO Vote Required | CC Vote Required |
| ------------------------------- | ------------------ | ----------------- | ---------------- |
| Treasury withdrawal             | Yes                | No                | Yes              |
| Protocol parameter change       | Yes                | No                | Yes              |
| Hard fork initiation            | Yes                | Yes               | Yes              |
| Update Constitutional Committee | Yes                | No                | No               |
| Motion of no confidence         | Yes                | No                | No               |
| Update Constitution             | Yes                | No                | Yes              |
| Info action                     | Yes                | Yes               | No (non-binding) |

Notably, the governance actions to update the CC itself (adding/removing members) and motions of no confidence do not require CC approval. This is a critical design decision that ensures the community can replace the CC without the CC being able to block its own removal.

### Term Limits and Rotation

CC members serve for defined terms, measured in epochs. Term lengths are specified when members are added to the committee through governance actions. Key aspects of the term system include:

- **Expiration**: Each CC member has an expiration epoch. Once their term expires, they can no longer vote on governance actions unless re-elected.
- **Staggered terms**: Terms can be staggered so that not all members expire simultaneously, providing continuity in the committee's operations.
- **Re-election**: Expired members can be re-elected through a new governance action to update the CC.
- **No automatic renewal**: Terms do not automatically renew. Active governance participation is required to maintain the committee.

### Constitutional Committee Credentials

CC members are identified on-chain by their credentials, which can be:

- **Verification key hash**: A standard cryptographic credential tied to a key pair.
- **Script hash**: A script-based credential, allowing for multisig or other advanced authentication schemes. This enables organizational or multi-party representation on the CC.

Using script-based credentials, a single CC "member" can actually represent a group of individuals who must collectively sign to cast a vote, adding an additional layer of security and representation.

### Checks and Balances

The CC is specifically designed to function within a system of checks and balances:

- **CC cannot initiate actions**: The CC can only approve or block governance actions submitted by others. It cannot propose treasury withdrawals, parameter changes, or any other action.
- **CC can be replaced**: The community (through DRep votes) can replace individual CC members or the entire committee. A motion of no confidence can be passed without CC approval.
- **CC cannot block its own replacement**: Governance actions to update the CC membership or pass a no-confidence motion do not require CC approval, preventing the committee from becoming an entrenched power.
- **Constitutional constraint**: The CC's veto power is constrained by the constitution. They are expected to block only actions that genuinely violate constitutional principles, not actions they personally disagree with on policy grounds.
- **Transparency**: CC votes are recorded on-chain, allowing the community to evaluate whether CC members are exercising their authority appropriately.

### State of No Confidence

If the community passes a motion of no confidence against the CC, the governance system enters a "state of no confidence." In this state:

- The existing CC is considered dissolved.
- Governance actions that require CC approval cannot proceed until a new CC is elected.
- The community must elect a new CC through a governance action to restore full governance functionality.

This mechanism serves as an emergency brake, allowing the community to reset the constitutional review function if the CC acts improperly.

### The Cardano Constitution

The CC's authority derives from the Cardano Constitution, a foundational document that defines the principles, rights, and rules of the Cardano ecosystem. The constitution was ratified at the Cardano Constitutional Convention held in Buenos Aires, Argentina, in December 2024. Key aspects include:

- The constitution sets boundaries for governance actions (e.g., what types of protocol changes are permissible, how treasury funds may be used).
- It defines the roles and limitations of each governance body.
- It establishes rights for ADA holders and participants in the ecosystem.
- Amendments to the constitution require approval from both DReps and the CC, ensuring broad consensus for foundational changes.

## Common Misconceptions

- **"The Constitutional Committee controls Cardano."** The CC has no power to initiate actions or force changes. Its sole governance function is to approve or block proposals made by others, and only on constitutional grounds. The CC is the most constrained of the three governance bodies.

- **"The CC can veto anything it disagrees with."** The CC's mandate is specifically to evaluate constitutional compliance, not to exercise general policy preferences. While enforcement of this norm is ultimately social rather than algorithmic, on-chain transparency of CC votes enables community oversight.

- **"The CC can prevent its own removal."** This is explicitly prevented by the governance design. Motions of no confidence and CC membership updates do not require CC approval, ensuring the community retains ultimate authority over the committee's composition.

- **"Seven members is too few to be representative."** The initial seven members were chosen to bootstrap the system. The community can expand the CC through governance actions. The size of the committee is a governance parameter that can evolve over time based on community preferences.

- **"The CC is permanent."** CC members serve term-limited roles. Every member must eventually face re-election or replacement. The committee is designed to be dynamic and responsive to community will.

## Comparison Points

| Feature             | Cardano CC                                      | US Supreme Court                             | Polkadot Technical Committee (deprecated) |
| ------------------- | ----------------------------------------------- | -------------------------------------------- | ----------------------------------------- |
| Role                | Constitutional review of governance actions     | Constitutional review of laws                | Fast-track referenda, emergency actions   |
| Composition         | 7 initial members (expandable)                  | 9 justices                                   | Variable membership                       |
| Term                | Defined terms (epoch-based), re-electable       | Lifetime appointment                         | No fixed terms                            |
| Appointment         | Community-elected via DRep vote                 | Presidential nomination, Senate confirmation | Council appointment                       |
| Removal             | Motion of no confidence (no CC approval needed) | Impeachment                                  | Council decision                          |
| Can initiate policy | No                                              | No (only reviews cases brought before it)    | Could fast-track proposals                |
| Veto scope          | Constitutional compliance only                  | Constitutional compliance only               | Could accelerate but not veto             |

The Cardano CC most closely resembles a constitutional court in traditional governance, though with the important distinction that it operates within a fully on-chain, decentralized system where its members are directly elected and removable by the community.

## Sources

- CIP-1694: An On-Chain Decentralized Governance Mechanism for Voltaire (https://github.com/cardano-foundation/CIPs/tree/master/CIP-1694)
- Cardano Constitution, ratified at the Buenos Aires Constitutional Convention, December 2024
- Cardano Node ledger specification for governance (https://docs.cardano.org)
- Input Output Global governance design documentation
- Chang Hard Fork implementation details and governance parameter specifications

## Last Updated

2025-02-01
