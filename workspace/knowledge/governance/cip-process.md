# Cardano Improvement Proposal (CIP) Process

## Overview

The Cardano Improvement Proposal (CIP) process is the formal mechanism through which changes, standards, and enhancements to the Cardano ecosystem are proposed, discussed, and adopted. Modeled after similar processes in other open-source communities, the CIP framework provides a structured, transparent, and community-driven path for evolving the Cardano protocol, tooling, and standards. The process is managed through a public GitHub repository maintained by the Cardano Foundation, ensuring that all proposals and their histories are openly accessible.

CIPs are not limited to protocol-level changes. They can cover a wide range of topics including metadata standards, wallet interoperability, smart contract patterns, governance mechanisms, and ecosystem conventions. This breadth makes the CIP process a central coordination point for the entire Cardano developer and stakeholder community.

## Key Facts

- **Repository**: CIPs are hosted on GitHub at `cardano-foundation/CIPs`, making them publicly visible and open to contribution from anyone.
- **Total CIPs**: Over 100 CIPs have been published as of early 2025, covering protocol changes, token standards, metadata formats, and governance structures.
- **Status workflow**: CIPs follow a lifecycle of Draft, Proposed, and Active, with additional terminal statuses such as Inactive or Rejected.
- **CIP Editors**: A group of community-appointed editors manages the CIP repository, reviewing submissions for format compliance and facilitating discussion. Editors do not decide technical merit; that is left to the community and relevant stakeholders.
- **Biweekly meetings**: CIP editors and community members hold regular meetings (typically biweekly) to review proposals, discuss open issues, and advance CIPs through their lifecycle.
- **Anyone can submit**: There are no restrictions on who can author a CIP. Any community member, developer, or organization can submit a proposal.

## Technical Details

### CIP Lifecycle

The CIP process follows a defined status progression:

1. **Draft**: The initial status when a CIP is first submitted as a pull request to the GitHub repository. At this stage, the proposal is open for community feedback and iteration. The author refines the CIP based on comments from editors and the broader community.

2. **Proposed**: Once a CIP has been sufficiently discussed and the editors confirm it meets formatting and completeness requirements, it advances to Proposed status. This signals that the CIP is a well-formed proposal ready for broader consideration by implementors and stakeholders.

3. **Active**: A CIP reaches Active status when it has been implemented and adopted within the ecosystem. For protocol-level changes, this typically means the change has been incorporated into a node release. For standards, it means the standard has gained meaningful adoption.

Additional statuses include:

- **Inactive**: A CIP that has stalled or been abandoned by its author.
- **Rejected**: A CIP that has been explicitly rejected after review.

### CIP Structure

Each CIP follows a standardized template that includes:

- **Preamble**: Metadata including CIP number, title, author, status, type, and creation date.
- **Abstract**: A brief summary of the proposal.
- **Motivation**: The problem or opportunity the CIP addresses and why it matters.
- **Specification**: The detailed technical specification of the proposed change or standard.
- **Rationale**: Justification for design decisions made in the specification.
- **Path to Active**: The criteria that must be met for the CIP to achieve Active status.
- **Backwards Compatibility**: Analysis of how the proposal affects existing systems.
- **Reference Implementation**: Code or pseudocode demonstrating the proposal (where applicable).

### Notable CIPs

Several CIPs have had outsized impact on the Cardano ecosystem:

- **CIP-1 (CIP Process)**: The foundational CIP that defines the CIP process itself. It establishes the rules for submitting, reviewing, and advancing proposals. All subsequent CIPs follow the framework laid out in CIP-1.

- **CIP-1694 (On-Chain Governance)**: One of the most significant CIPs in Cardano's history. CIP-1694 defines the on-chain governance mechanism for the Voltaire era, introducing DReps, the Constitutional Committee, governance actions, and on-chain voting. This CIP was the basis for the Chang hard fork.

- **CIP-25 (NFT Metadata Standard)**: Established the initial standard for NFT metadata on Cardano, defining how token metadata should be structured and stored. CIP-25 enabled the early growth of the Cardano NFT ecosystem by providing a common format that marketplaces and wallets could support.

- **CIP-68 (Datum Metadata Standard)**: An evolution beyond CIP-25, CIP-68 introduced a more flexible and powerful metadata standard using datums attached to UTxOs. This approach allows for updatable metadata, richer data structures, and tighter integration with smart contracts. CIP-68 is increasingly preferred for new NFT and token projects.

- **CIP-30 (Cardano dApp-Wallet Web Bridge)**: Defines the standard interface for communication between web-based decentralized applications and Cardano wallets. This CIP is essential for the dApp ecosystem, enabling users to connect their wallets to applications in a consistent way across different wallet providers.

- **CIP-33 and CIP-32 (Reference Scripts and Inline Datums)**: These CIPs introduced optimizations for Plutus smart contracts, reducing transaction sizes and costs by allowing scripts and datums to be referenced rather than included in every transaction.

### Relationship to Cardano Improvement Proposal Extensions (CPS)

In addition to CIPs, the ecosystem also uses Cardano Problem Statements (CPS), which are documents that describe a problem or challenge without prescribing a specific solution. A CPS can inspire one or more CIPs that propose solutions. This separation allows the community to first build consensus around problem definitions before jumping to solutions.

## Common Misconceptions

- **"CIPs are mandatory standards."** CIPs that reach Active status represent community consensus and best practices, but adoption is generally voluntary for off-chain standards. Protocol-level CIPs that are implemented in node software do become effectively mandatory for network participants, but ecosystem standards (like metadata formats) rely on voluntary adoption.

- **"Only IOG or the Cardano Foundation can submit CIPs."** The process is open to anyone. While major protocol CIPs have often been authored by IOG researchers or engineers, many important CIPs (particularly around token standards and wallet interfaces) have been authored by independent community developers.

- **"CIP editors decide which proposals get accepted."** Editors manage the process, not the outcomes. Their role is to ensure proposals meet formatting requirements, facilitate discussions, and track status changes. Technical merit and adoption decisions are made by the broader community and implementors.

- **"A CIP number means the proposal is approved."** CIP numbers are assigned for organizational purposes when a proposal enters Draft status. A numbered CIP may still be in Draft, Proposed, Inactive, or Rejected status.

## Comparison Points

| Aspect             | Cardano CIP                               | Ethereum EIP                              | Bitcoin BIP                                |
| ------------------ | ----------------------------------------- | ----------------------------------------- | ------------------------------------------ |
| Repository         | GitHub (Cardano Foundation)               | GitHub (Ethereum Foundation)              | GitHub (Bitcoin community)                 |
| Statuses           | Draft, Proposed, Active, Inactive         | Draft, Review, Last Call, Final, Stagnant | Draft, Proposed, Final, Replaced, Rejected |
| Scope              | Protocol, standards, metadata, governance | Protocol, ERCs, interface, networking     | Protocol, process, informational           |
| Editor review      | Yes, community-appointed editors          | Yes, EIP editors                          | Yes, BIP editors                           |
| Meeting cadence    | Biweekly                                  | Biweekly (AllCoreDevs for protocol EIPs)  | Ad hoc                                     |
| Problem statements | CPS (separate track)                      | No formal equivalent                      | No formal equivalent                       |
| Open submission    | Yes                                       | Yes                                       | Yes                                        |

The CIP process is most closely analogous to Ethereum's EIP process. Both use GitHub-based workflows, editor review, and status progressions. A notable difference is Cardano's use of CPS documents to separate problem identification from solution proposals, which adds structure to the early stages of the improvement process.

## Sources

- CIP-1: CIP Process, Cardano Improvement Proposals repository (https://github.com/cardano-foundation/CIPs/blob/master/CIP-0001)
- Cardano Foundation CIP repository (https://github.com/cardano-foundation/CIPs)
- CIP-1694: An On-Chain Decentralized Governance Mechanism (https://github.com/cardano-foundation/CIPs/tree/master/CIP-1694)
- CIP-25: Media NFT Metadata Standard (https://github.com/cardano-foundation/CIPs/tree/master/CIP-0025)
- CIP-68: Datum Metadata Standard (https://github.com/cardano-foundation/CIPs/tree/master/CIP-0068)
- CIP biweekly meeting notes (https://github.com/cardano-foundation/CIPs/tree/master/BiweeklyMeetings)

## Last Updated

2025-02-01
