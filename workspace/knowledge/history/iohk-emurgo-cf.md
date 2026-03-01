# Cardano Founding Entities and Governance Organizations

## Overview

Cardano was established with a unique tri-entity structure designed to provide checks and balances across protocol development, commercial adoption, and ecosystem stewardship. The three founding organizations — Input Output Global (IOG, formerly IOHK), EMURGO, and the Cardano Foundation — each hold distinct mandates that were intended to prevent any single organization from exerting undue control over the network's direction. As Cardano matures into its Voltaire governance era, a fourth entity has emerged: Intersect, a member-based organization (MBO) that serves as the community's coordination layer for protocol development and governance.

This document describes the roles, responsibilities, and evolution of each organization, as well as how they interact within the broader Cardano ecosystem.

## Key Facts

### Input Output Global (IOG)

**Role:** Protocol research and development.

Input Output Global, originally incorporated as Input Output Hong Kong (IOHK), is the engineering and research company founded by Charles Hoskinson and Jeremy Wood in 2015. IOG was contracted to design and build the Cardano protocol, and it has been the primary driver of core protocol development since the project's inception.

IOG employs over 200 researchers and engineers, making it one of the largest blockchain research organizations in the world. The company has produced more than 180 peer-reviewed academic papers spanning consensus algorithms (the Ouroboros family), smart contract semantics (Plutus and Marlowe), cryptographic primitives, game theory, and formal verification methods.

Key contributions from IOG include:

- The Ouroboros family of proof-of-stake consensus protocols (Classic, BFT, Praos, Genesis, Leios).
- The Plutus smart contract platform, based on Haskell and the Extended UTXO model.
- The Hydra layer-2 scaling solution.
- The Mithril stake-based threshold signature scheme.
- The hard fork combinator mechanism enabling seamless protocol upgrades.
- The Marlowe domain-specific language for financial smart contracts.

IOG operates research labs and maintains collaborations with academic institutions including the University of Edinburgh, the University of Wyoming, Stanford University, and the Athens University of Economics and Business.

As part of the Voltaire transition, IOG has been progressively transferring stewardship of core code repositories and development coordination to Intersect. This does not mean IOG is ceasing development — rather, it means development governance is moving from a single-company model to a community-coordinated model where IOG is one contributor among many.

### EMURGO

**Role:** Commercial adoption, enterprise solutions, and education.

EMURGO is the official commercial arm of the Cardano ecosystem. Founded in 2017 and headquartered in Singapore (with operations in multiple countries), EMURGO focuses on driving real-world adoption of Cardano technology through investment, partnerships, and education.

Key activities and contributions include:

- **Enterprise Solutions.** EMURGO develops and supports enterprise-grade tools and platforms built on Cardano. This includes supply chain solutions, identity verification systems, and financial infrastructure.
- **USDA Stablecoin.** EMURGO has been instrumental in the development and support of USDA, a fiat-backed stablecoin on the Cardano network. Stablecoins are critical infrastructure for DeFi and commercial applications, and USDA represents a significant step toward making Cardano viable for everyday financial transactions.
- **Education.** EMURGO runs the EMURGO Academy, which provides blockchain education programs in over 50 countries. Courses cover Cardano development, blockchain fundamentals, and Haskell/Plutus programming. The academy has trained thousands of developers and entrepreneurs.
- **Investment.** Through EMURGO Ventures and related entities, EMURGO invests in startups building on Cardano, supporting ecosystem growth through capital deployment and mentorship.
- **Yoroi Wallet.** EMURGO developed Yoroi, the lightweight browser-extension wallet for Cardano, which serves as a key entry point for users interacting with the network without running a full node.

EMURGO operates across more than 50 countries and has established partnerships with governments, educational institutions, and private enterprises, particularly in Africa and Southeast Asia.

### Cardano Foundation

**Role:** Non-profit stewardship, governance coordination, and ecosystem standards.

The Cardano Foundation is an independent, Swiss-based non-profit entity established to act as the guardian of the Cardano ecosystem. Its mandate includes ecosystem growth, community engagement, governance coordination, and representing Cardano to regulators and institutional stakeholders.

Key activities and contributions include:

- **Governance Coordination.** The Foundation plays a central role in coordinating the Cardano Improvement Proposal (CIP) process, which is the formal mechanism for proposing and standardizing protocol changes. CIPs cover everything from ledger modifications to metadata standards to wallet interoperability.
- **Ecosystem Growth.** The Foundation supports developers, stake pool operators, and community initiatives through grants, partnerships, and technical support programs.
- **Regulatory Engagement.** As a Swiss non-profit, the Foundation engages with regulators and policymakers to represent the Cardano ecosystem's interests and promote sound regulatory frameworks for blockchain technology.
- **Standards and Certification.** The Foundation has pursued efforts to establish industry standards for blockchain interoperability, security audits, and best practices.
- **Community Programs.** The Foundation supports community events, ambassador programs, and educational initiatives that extend Cardano's reach globally.

The Foundation underwent a leadership transition in its early years, with the community raising concerns about the initial management's direction. Since the leadership change, the Foundation has been more actively engaged with the developer community and governance processes.

### Intersect (Member-Based Organization)

**Role:** Community governance coordination and development stewardship.

Intersect is a newer entity in the Cardano ecosystem, established as a member-based organization (MBO) to serve as the community coordination layer for Cardano's decentralized governance. As of early 2025, Intersect has grown to over 1,000 members, including individuals, stake pool operators, dApp developers, and institutional participants.

Key activities and contributions include:

- **Open-Source Repository Stewardship.** Intersect manages the open-source repositories for Cardano core software, facilitating contributions from multiple development teams rather than relying solely on IOG.
- **Development Coordination.** Through technical working groups and committees, Intersect coordinates protocol development priorities, release planning, and quality assurance across contributor organizations.
- **Governance Support.** Intersect provides tooling, documentation, and process support for the CIP-1694 governance system, including DRep onboarding, governance action submission, and constitutional oversight.
- **Community Committees.** Intersect operates several committees focused on specific areas: the Technical Steering Committee, the Membership and Community Committee, the Civics Committee, and the Budget Committee, among others.
- **Constitution Stewardship.** Intersect played a significant role in facilitating the drafting and ratification of the Cardano Constitution, which serves as the foundational governance document for the Voltaire era.

Intersect represents the structural evolution of Cardano from a project governed by founding entities to a project governed by its community. It is not a replacement for IOG, EMURGO, or the Cardano Foundation, but rather a complementary layer that coordinates their contributions alongside those of the broader community.

## Technical Details

The tri-entity model was designed from Cardano's inception to avoid the governance concentration problems seen in other blockchain projects. By separating research/development (IOG), commercialization (EMURGO), and stewardship (Cardano Foundation), the founders aimed to create a system of checks and balances.

Each entity was initially funded through a share of the Ada token genesis distribution:

- IOG received a development contract funded by Ada from the genesis block.
- EMURGO received a share for commercial development activities.
- The Cardano Foundation received a share for ecosystem stewardship.

The Cardano Treasury, funded by a portion of transaction fees and monetary expansion, is the long-term sustainability mechanism. Under Voltaire governance, treasury withdrawals require on-chain approval through the governance system, meaning no single entity can unilaterally access treasury funds.

## Common Misconceptions

- **"IOG is Cardano."** IOG is the largest single contributor to Cardano's development, but it is not Cardano itself. The network is operated by thousands of independent stake pool operators, and governance authority now rests with Ada holders through the CIP-1694 system. Multiple development teams contribute to the ecosystem.

- **"EMURGO only does marketing."** While EMURGO does engage in ecosystem promotion, its primary functions are commercial adoption, enterprise solutions, investment, and education. The USDA stablecoin initiative and the EMURGO Academy represent substantive operational activities.

- **"The Cardano Foundation does nothing."** This perception stems from a period of leadership challenges in the Foundation's early years. Under subsequent leadership, the Foundation has been active in CIP coordination, regulatory engagement, and ecosystem support, though its activities are often less visible than IOG's engineering work.

- **"Intersect replaces the other three entities."** Intersect complements the existing entities by providing a community-first coordination layer. IOG continues engineering work, EMURGO continues commercial activities, and the Foundation continues stewardship. Intersect provides the governance and coordination infrastructure for these and other contributors to work together under community direction.

## Comparison Points

| Aspect              | IOG                             | EMURGO                       | Cardano Foundation         | Intersect               |
| ------------------- | ------------------------------- | ---------------------------- | -------------------------- | ----------------------- |
| Type                | For-profit R&D                  | For-profit commercial        | Non-profit                 | Member-based org        |
| Primary focus       | Protocol engineering            | Adoption and investment      | Stewardship and standards  | Governance coordination |
| Headquarters        | Wyoming, USA / Remote           | Singapore                    | Zug, Switzerland           | Distributed             |
| Team size (approx.) | 200+ researchers/engineers      | Varies by initiative         | Smaller operational team   | 1,000+ members          |
| Funding model       | Development contracts, treasury | Investment returns, services | Genesis allocation, grants | Membership, treasury    |

## Sources

- IOG Website: https://iog.io
- EMURGO Website: https://emurgo.io
- Cardano Foundation Website: https://cardanofoundation.org
- Intersect Website: https://www.intersectmbo.org
- CIP Process Repository: https://github.com/cardano-foundation/CIPs
- EMURGO Academy: https://education.emurgo.io

## Last Updated

2025-02-01
