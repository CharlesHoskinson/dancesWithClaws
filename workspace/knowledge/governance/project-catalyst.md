# Project Catalyst

## Overview

Project Catalyst is Cardano's decentralized innovation and grant funding program, widely recognized as the largest decentralized fund in the blockchain industry. Launched in 2020, it serves as the experimental governance and treasury mechanism through which the Cardano community allocates resources to projects that build on, improve, or promote the Cardano ecosystem. Project Catalyst operates through recurring funding rounds (called "Funds"), where community members submit proposals, voters evaluate and rank them, and successful proposals receive ADA from the Cardano treasury.

The program is designed to solve a fundamental challenge in decentralized ecosystems: how to allocate shared resources without centralized decision-making. By combining proposal submission, community review, and stake-weighted voting, Project Catalyst creates a feedback loop where the community identifies its own needs and funds its own solutions. Over its lifetime, the program has distributed more than $150 million in ADA to over 2,000 funded proposals across areas including development tools, education, marketing, DeFi infrastructure, and real-world adoption initiatives.

## Key Facts

- **Total distributed**: Over $150 million (USD equivalent at time of funding) across all completed fund rounds.
- **Total funded proposals**: More than 2,000 proposals have received funding since the program's inception.
- **Fund 14 statistics**: Approximately 18.6 million ADA allocated, 131 proposals funded, 4,893 unique voting wallets participated.
- **Funding cadence**: Fund rounds occur approximately every four months, though the schedule has varied as the process evolves.
- **Voting mechanism**: ADA holders register to vote, review proposals, and cast votes during a defined voting period. Voting power is proportional to registered ADA stake.
- **Voter rewards**: Participants who vote receive ADA rewards for their participation, incentivizing broad engagement.
- **Platform**: Proposals are submitted and reviewed through a dedicated application (previously the Catalyst Voting App, with ongoing platform evolution).
- **Challenge categories**: Each fund defines challenge categories (also called "challenges" or "categories") that focus funding on specific ecosystem needs.

## Technical Details

### Fund Lifecycle

Each Catalyst fund round follows a structured lifecycle:

1. **Challenge setting**: Challenge categories are defined, either by the Catalyst team or through community-proposed challenges. These categories specify the areas where funding will be directed (e.g., developer tooling, DApp creation, community outreach, cross-chain interoperability).

2. **Proposal submission**: During the submission phase, anyone can submit a proposal under one or more challenge categories. Proposals must include a problem statement, proposed solution, budget breakdown, timeline, and team information.

3. **Community review**: After submission, community reviewers (formerly called "Community Advisors" or "Proposal Assessors") evaluate proposals against defined criteria including impact, feasibility, and value for money. Reviewers provide written assessments and scores that help voters make informed decisions.

4. **Refinement stage**: Proposers can respond to reviewer feedback and refine their proposals before the voting phase.

5. **Voting**: Registered voters cast their votes during a defined voting period. Voters can support or oppose proposals, and their voting power is proportional to the ADA they registered for voting. Voting is conducted through a dedicated application using a privacy-preserving mechanism.

6. **Tallying and results**: After the voting period closes, votes are tallied and results are published. Proposals that meet the approval threshold and rank within the available budget for their category receive funding.

7. **Execution and reporting**: Funded teams execute their proposals and provide progress reports. Milestone-based funding release mechanisms have been introduced in later funds to ensure accountability.

### Voting Mechanics

The voting system in Project Catalyst uses a stake-weighted model:

- **Registration**: ADA holders register their wallets for voting during a snapshot period. The ADA balance at the time of snapshot determines voting power.
- **Minimum threshold**: A minimum ADA holding is required to participate in voting (this threshold has varied across funds).
- **Yes/No voting**: Voters can cast a "Yes" or "No" vote on each proposal, or abstain.
- **Privacy**: Votes are cast using a privacy-preserving protocol so that individual voting choices are not publicly linked to wallet addresses.
- **Rewards**: Voters receive ADA rewards distributed after each fund round, calculated proportionally based on their registered stake and participation.

### Evolution Over Time

Project Catalyst has undergone significant evolution since its first fund:

- **Early funds (Fund 1-3)**: Small-scale experiments with limited budgets, testing the basic mechanics of proposal submission and voting.
- **Growth phase (Fund 4-8)**: Rapid expansion in budget size, number of proposals, and voter participation. Community Advisor roles were formalized.
- **Maturation phase (Fund 9-12)**: Introduction of milestone-based funding, improved review processes, and platform upgrades. Increased focus on accountability and proposal quality.
- **Current phase (Fund 13+)**: Continued refinement with larger budgets, evolved challenge structures, and integration with the broader Voltaire governance framework. Fund 14 represented a continuation of this trajectory with 18.6 million ADA allocated across 131 funded proposals and 4,893 voting wallets.

### Relationship to Voltaire Governance

Project Catalyst was originally conceived as an experimental precursor to full on-chain governance under the Voltaire era. While Voltaire introduces protocol-level governance through DReps and on-chain voting (as specified in CIP-1694), Project Catalyst operates as a complementary system focused specifically on treasury-funded innovation grants. The two systems are expected to converge over time, with Catalyst potentially becoming a module within the broader on-chain governance framework.

Currently, Catalyst operates with its own voting infrastructure separate from the on-chain governance mechanisms introduced by the Chang hard fork. The long-term vision is for treasury allocations to be fully governed through on-chain mechanisms, with Catalyst-style proposal evaluation and review processes integrated into that framework.

### Accountability and Milestone Reporting

Later fund rounds introduced milestone-based funding to address concerns about proposal accountability:

- Funded proposals define milestones at the time of submission.
- Funding is released in tranches as milestones are completed and verified.
- A milestone review process evaluates whether deliverables meet the stated objectives.
- Proposals that fail to deliver can have remaining funding withheld.

This system represents a significant improvement over the earlier model where full funding was released upfront.

## Common Misconceptions

- **"Anyone can get free money from Catalyst."** While anyone can submit a proposal, the community review and voting process is competitive. Only proposals that convince voters of their value and feasibility receive funding. Many proposals are not funded in each round.

- **"Catalyst is controlled by IOG or the Cardano Foundation."** While IOG played a significant role in building the initial Catalyst infrastructure and processes, the funding decisions are made entirely by community voters. The operational aspects of Catalyst are progressively being decentralized.

- **"Voting is one-person-one-vote."** Catalyst uses stake-weighted voting, meaning voting power is proportional to the ADA registered by the voter. This is a deliberate design choice consistent with Cardano's proof-of-stake model, where economic stake represents commitment to the network.

- **"All funded proposals succeed."** Like any grant or venture funding program, not all funded proposals deliver on their promises. The introduction of milestone-based funding has improved accountability, but some proposals still underperform or fail to complete their objectives.

- **"Catalyst funding is denominated in USD."** Funding is allocated and distributed in ADA. USD equivalents are often cited for context, but the actual amounts received by proposers fluctuate with ADA market value between the time of approval and distribution.

## Comparison Points

| Feature            | Project Catalyst                   | Ethereum Grants (EF, Gitcoin)                      | Polkadot Treasury              |
| ------------------ | ---------------------------------- | -------------------------------------------------- | ------------------------------ |
| Funding source     | Cardano treasury (protocol-level)  | Foundation endowment / quadratic funding           | On-chain treasury (inflation)  |
| Decision mechanism | Community vote (stake-weighted)    | Committee review (EF) / quadratic voting (Gitcoin) | Council and community vote     |
| Scale              | $150M+ distributed                 | Varies by program                                  | Significant treasury balance   |
| Proposal process   | Open submission, community review  | Application-based (EF) / open (Gitcoin)            | On-chain proposal              |
| Voter rewards      | Yes, ADA rewards for participation | No direct rewards for Gitcoin voters               | No direct voter rewards        |
| Recurring rounds   | Every ~4 months                    | Ongoing (EF) / periodic (Gitcoin rounds)           | Continuous (proposals anytime) |
| Milestone tracking | Yes (later funds)                  | Varies by program                                  | Limited                        |

Project Catalyst is distinguished by its scale, recurring cadence, and community-driven evaluation process. While other ecosystems have grant programs, few combine protocol-level treasury funding with open community voting at the scale that Catalyst has achieved.

## Sources

- Project Catalyst official site (https://projectcatalyst.io)
- Cardano Catalyst documentation and fund results
- Fund 14 results and statistics, published by the Catalyst team
- Input Output Global blog posts on Project Catalyst milestones
- Cardano treasury and governance documentation (https://docs.cardano.org)

## Last Updated

2025-02-01
