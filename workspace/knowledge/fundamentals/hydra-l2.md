# Hydra Layer 2 Protocol

## Overview

Hydra is Cardano's Layer 2 scaling solution based on isomorphic state channels. The term "isomorphic" is key — it means that the Layer 2 environment replicates the full capabilities of the Cardano mainnet (Layer 1), including native tokens, NFTs, and Plutus smart contract execution. This is in contrast to many Layer 2 solutions on other blockchains that offer a reduced feature set compared to their base layer.

Developed by Input Output Global (IOG), Hydra enables a group of participants to open a "Head" (a state channel) where they can transact with near-instant finality and minimal fees, while the security of their funds is ultimately guaranteed by the Cardano mainnet. The protocol is designed for scenarios where a known, relatively small group of participants needs high-throughput, low-latency transactions.

## Key Facts

- **Isomorphic state channels**: Hydra Heads replicate the full Cardano ledger features, including native multi-asset tokens, NFTs, and Plutus script execution. Any transaction that is valid on Layer 1 is valid inside a Hydra Head.
- **1.04 million TPS benchmark**: In October 2024, a Hydra-based implementation of the game Doom achieved 1.04 million transactions per second, demonstrating the raw throughput potential of the protocol in a real application scenario.
- **SundaeSwap integration**: SundaeSwap, a major Cardano DEX, has integrated Hydra for off-chain order processing, enabling faster DEX trading with settlement on mainnet.
- **Not a mainnet replacement**: Hydra is designed for trusted sub-networks and specific use cases, not as a general replacement for Layer 1. It complements mainnet rather than competing with it.
- **Open source**: The Hydra Head protocol implementation is fully open source and available on GitHub under the Apache 2.0 license.

## Technical Details

### How a Hydra Head Works

The lifecycle of a Hydra Head follows these stages:

**1. Initialization:**
A group of participants agrees to open a Hydra Head. Each participant runs a Hydra node connected to both the Cardano mainnet and the other participants' nodes. An initialization transaction is posted on Layer 1, identifying the participants and establishing the Head parameters.

**2. Committing:**
Each participant commits UTXOs from Layer 1 into the Head by posting commit transactions on-chain. These UTXOs are locked in a script on Layer 1 and become available inside the Head. The committed funds are effectively moved from Layer 1 to Layer 2.

**3. Open (Active):**
Once all participants have committed, the Head opens. Participants can now submit transactions to the Head, which are validated using the same rules as Cardano mainnet (including Plutus script execution). Transactions are confirmed via a lightweight consensus protocol among the Head participants, achieving confirmation in as little as a network round trip.

Inside an open Head:

- Transactions follow the same eUTXO model as mainnet.
- Native tokens and NFTs work identically.
- Plutus validators execute with the same semantics.
- All participants must agree on each transaction (unanimous consensus).
- Throughput is limited only by network bandwidth and computational resources of the participants.

**4. Closing:**
Any participant can initiate closing the Head by posting a close transaction on Layer 1 with the latest agreed-upon state. A contestation period follows during which other participants can contest with a more recent state if the closer submitted an outdated one.

**5. Fanout:**
After the contestation period, a fanout transaction distributes the final UTXOs from the Head back to Layer 1, returning funds to their owners according to the final state.

### Security Model

Hydra's security rests on several properties:

- **Mainnet anchoring**: All funds committed to a Head are locked in scripts on Layer 1. The final state is always settled back to Layer 1, ensuring that participants can always recover their funds.
- **Contestation mechanism**: If a participant attempts to close the Head with a stale state (to cheat), any other participant can submit a more recent state during the contestation period, overriding the dishonest closure.
- **Unanimous consensus**: Inside an open Head, all participants must sign each transaction. This means a single dishonest participant can stall the Head (preventing new transactions) but cannot steal funds. If stalling occurs, any participant can close the Head and recover their funds on Layer 1.
- **No additional trust assumptions**: The security of a Hydra Head relies on the same cryptographic assumptions as the Cardano mainnet. No additional trusted parties, sequencers, or validators are introduced.

### Performance Characteristics

The performance of a Hydra Head is determined by the participants' hardware and network conditions, not by Layer 1 block times or throughput limits:

- **Latency**: Transaction confirmation can occur in milliseconds (one network round trip among participants for signing).
- **Throughput**: Benchmarks have demonstrated up to 1,000+ simple transactions per second in controlled environments, and the Doom gaming test reached 1.04 million TPS by leveraging the parallel nature of eUTXO.
- **Fees**: Transactions inside a Head do not pay Layer 1 fees. The only mainnet fees are for opening, committing, closing, and fanning out the Head.

### The Doom Benchmark (October 2024)

In October 2024, a team demonstrated Hydra's capabilities by running a modified version of the classic game Doom where each game action was recorded as a Cardano transaction inside a Hydra Head. The benchmark achieved 1.04 million transactions per second, showcasing the protocol's raw throughput potential. While this was a specialized test (single-player game actions are inherently non-contending), it demonstrated that the protocol's architecture can handle extreme transaction volumes.

### SundaeSwap Integration

SundaeSwap, one of Cardano's earliest decentralized exchanges, has integrated Hydra to improve its order processing. In this model:

- Users submit swap orders on Layer 1.
- A Hydra Head is used by the SundaeSwap scoopers (order processors) to batch and process orders with higher throughput and lower latency.
- The final results are settled back to Layer 1.

This hybrid approach leverages Hydra's speed for the computation-intensive order matching while maintaining Layer 1's security for final settlement.

### Current Limitations and Future Development

Hydra is an actively developed protocol with ongoing improvements:

- **Participant set**: Currently, the participant set is fixed at Head creation. Dynamic participant addition/removal during an open Head is planned for future versions.
- **Unanimous consensus**: The requirement for all participants to sign every transaction limits Head size to relatively small groups (practically, tens of participants rather than thousands). Research into relaxed consensus models is underway.
- **Head-to-Head communication**: Currently, each Head is independent. Future work includes protocols for routing transactions between Heads, enabling a network of interconnected state channels.
- **Incremental commits/decommits**: The ability to add or remove funds from an open Head without closing it is under active development, which will significantly improve usability.

### Hydra for Payments

One of the most straightforward use cases for Hydra is payment channels between parties that transact frequently. For example:

- A coffee shop and its regular customers could open a Head, enabling instant, fee-less payments throughout the day, with periodic settlement to Layer 1.
- A gaming platform could use Hydra Heads for in-game microtransactions.
- A supply chain network could use Hydra for high-frequency tracking updates among known participants.

## Common Misconceptions

**"Hydra will make Cardano do millions of TPS on mainnet."**
Hydra does not increase Layer 1 throughput. It provides a Layer 2 environment where small groups can transact at high speed. The 1 million TPS figure was achieved inside a single Hydra Head under specific conditions, not on the Cardano mainnet.

**"Hydra is like Ethereum rollups."**
Hydra state channels are fundamentally different from rollups. Rollups batch transactions and post proofs/data back to Layer 1, inheriting Layer 1 security for all users. Hydra Heads are interactive protocols requiring all participants to be online and cooperating. Each model has different trade-offs: rollups scale to more users but add complexity; state channels provide better latency for smaller groups.

**"Anyone can join a Hydra Head."**
Hydra Heads have a fixed, known set of participants defined at creation. They are not open-access like Layer 1. This makes them suitable for scenarios with known counterparties (business partners, game lobbies, payment channels) rather than open public markets.

**"If one participant goes offline, funds are lost."**
If a participant goes offline or becomes unresponsive, the Head can be closed by any remaining participant. Funds are returned to Layer 1 according to the last agreed-upon state. No funds are lost — the worst case is that the Head must be closed and funds settle back to mainnet.

## Comparison Points

| Feature               | Hydra (Cardano)           | Lightning (Bitcoin)      | Optimistic Rollups (Ethereum) |
| --------------------- | ------------------------- | ------------------------ | ----------------------------- |
| Type                  | Isomorphic state channels | Payment channels         | Rollup                        |
| Smart contracts in L2 | Full Plutus support       | No                       | Yes (EVM)                     |
| Participant model     | Fixed group, unanimous    | Pairwise channels        | Open access                   |
| Finality              | Instant (within Head)     | Instant (within channel) | 7-day challenge period        |
| Native multi-asset    | Yes                       | No                       | Depends on implementation     |
| Throughput            | Very high (per Head)      | Moderate (per channel)   | High (aggregated)             |
| Trust assumption      | Participants only         | Channel counterparty     | Sequencer + fraud proofs      |

## Sources

- Chakravarty, M., et al. (2020). "Hydra: Fast Isomorphic State Channels." IACR ePrint.
- Hydra Documentation: https://hydra.family
- Hydra GitHub Repository: https://github.com/cardano-scaling/hydra
- SundaeSwap Hydra Integration Announcements
- Hydra Doom Benchmark: https://doom.hydra.family

## Last Updated

2025-02-01
