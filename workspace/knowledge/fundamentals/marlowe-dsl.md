# Marlowe Domain-Specific Language

## Overview

Marlowe is a domain-specific language (DSL) designed for creating and executing financial contracts on the Cardano blockchain. Unlike general-purpose smart contract languages such as Plutus or Solidity, Marlowe is intentionally restricted in scope — it is purpose-built for financial agreements and is designed to be accessible to non-programmers, including business analysts, legal professionals, and finance practitioners.

Developed by Input Output Global (IOG) in collaboration with academic researchers, Marlowe draws on decades of research in financial contract modeling, particularly the work of Simon Peyton Jones and Jean-Marc Eber on composing contracts. The language provides strong safety guarantees by construction: contracts cannot hold assets indefinitely, they always terminate, and their behavior can be analyzed and simulated before deployment.

## Key Facts

- **Target audience**: Business analysts, financial professionals, and domain experts who need to create financial agreements without deep programming knowledge.
- **Safety by design**: Marlowe contracts are guaranteed to terminate. They cannot hold assets indefinitely — all funds are eventually returned to their owners if the contract is not completed.
- **Composable primitives**: All Marlowe contracts are built from a small set of combinators: Close, Pay, If, When, Let, and Assert. This simplicity enables formal analysis.
- **Marlowe Playground**: A web-based IDE that allows users to write, simulate, and analyze Marlowe contracts using visual blocks, JavaScript, or Haskell. Contracts can be tested exhaustively before deployment.
- **Runs on Plutus**: Marlowe contracts are compiled to Plutus validator scripts for on-chain execution, inheriting all of Cardano's security properties.
- **More restrictive than Plutus**: By design, Marlowe cannot express every possible smart contract. This restriction is a feature — it enables formal verification and static analysis that would be impossible in a Turing-complete language.

## Technical Details

### Core Contract Constructs

Every Marlowe contract is built from six fundamental constructs:

1. **Close**: The simplest contract — it does nothing and terminates. Any remaining funds in the contract are distributed back to their owners. Every Marlowe contract eventually reduces to Close.

2. **Pay**: Transfers funds from one participant's account within the contract to either another participant's account or to an external address. For example: "Pay Alice 100 ADA from Bob's account."

3. **If**: A conditional branch that evaluates a boolean observation and continues with one of two sub-contracts. For example: "If the price is above X, do contract A; otherwise, do contract B."

4. **When**: Waits for one or more possible actions to occur within a timeout period. If no action occurs before the timeout, a fallback contract is executed. Actions include:
   - **Deposit**: A participant deposits funds into the contract.
   - **Choice**: A participant makes a choice from a range of options (used for voting, selecting outcomes, or providing oracle data).
   - **Notify**: A notification that an observed condition has become true.

5. **Let**: Binds a value expression to a name for use later in the contract. This allows intermediate calculations to be named and reused.

6. **Assert**: Checks that a condition holds and records a warning if it does not. The contract continues regardless, but the assertion failure is logged for analysis.

### Contract Lifecycle

A typical Marlowe contract lifecycle follows these steps:

1. **Design**: The contract is written in Marlowe using the Playground, a text editor, or programmatically via Haskell or JavaScript.
2. **Simulation**: The Playground allows step-by-step simulation of the contract with different inputs, showing exactly what happens under each scenario.
3. **Static Analysis**: The Marlowe analyzer checks for potential issues such as unreachable code, negative payments, or partial payments (when an account has insufficient funds).
4. **Deployment**: The contract is compiled to a Plutus validator and deployed to Cardano mainnet as a UTXO with the contract state as the datum.
5. **Execution**: Participants interact with the contract by submitting transactions that advance the contract state (deposits, choices, notifications).
6. **Completion**: The contract reaches a Close state, and all remaining funds are distributed.

### State Model

A Marlowe contract maintains state consisting of:

- **Accounts**: A mapping of participant-token pairs to balances. Each participant can have funds in multiple token types.
- **Choices**: A record of choices made by participants during the contract execution.
- **Bound values**: Named values bound by Let expressions.
- **Minimum slot**: The earliest slot at which the next action can occur.

This state is stored as the datum of the UTXO holding the contract. Each transaction transforms the state according to the contract logic.

### Use Cases

Marlowe is well-suited for a variety of financial contract types:

- **Escrow**: Multi-party agreements where funds are held until conditions are met, with dispute resolution mechanisms.
- **Token swaps**: Atomic exchanges of tokens between parties with timeout-based cancellation.
- **Covered calls and options**: Financial derivatives where one party pays a premium for the right (not obligation) to buy or sell at a specified price.
- **Loans and lending**: Contracts where one party provides funds and another repays with interest over time.
- **Coupon bonds**: Fixed-income instruments with periodic interest payments and principal repayment.
- **Contracts for difference (CFDs)**: Agreements to exchange the difference in value of an asset between the contract opening and closing.

### Safety Guarantees

Marlowe provides several guarantees that general-purpose languages cannot:

- **Termination**: Every Marlowe contract is guaranteed to terminate. The When construct requires a timeout, ensuring that contracts cannot wait forever.
- **No asset trapping**: When a contract terminates (reaches Close), all funds held within the contract are automatically returned to their owners. There is no mechanism by which funds can be permanently locked.
- **Bounded lifetime**: Because every When has a timeout, the maximum lifetime of a contract can be calculated statically.
- **Analyzable**: The restricted nature of the language means that all possible execution paths can be enumerated and analyzed before deployment.
- **No reentrancy**: The step-based execution model and absence of external calls eliminate reentrancy vulnerabilities entirely.

### Marlowe Playground

The Marlowe Playground is a web-based development environment that supports three modes of contract authoring:

- **Blockly**: A visual drag-and-drop interface where contracts are assembled from blocks representing the core constructs. This mode is aimed at users with no programming experience.
- **JavaScript**: Contracts can be written as JavaScript programs that generate Marlowe contract descriptions. This leverages JavaScript's familiarity for web developers.
- **Haskell**: For developers comfortable with functional programming, contracts can be written directly in Haskell using Marlowe's embedded DSL.
- **Marlowe**: Direct editing of the Marlowe DSL syntax, which is a simple, JSON-like notation.

All modes allow simulation, where users can step through the contract providing inputs and observing state changes, and static analysis, which checks for potential issues.

### Relationship to Plutus

Marlowe runs on top of Plutus — the Marlowe interpreter is itself a Plutus validator script. When a Marlowe contract is deployed, the contract description and its current state are stored as the datum of a UTXO locked by the Marlowe validator. Each interaction with the contract is a Cardano transaction that provides inputs (deposits, choices) as the redeemer, and the Marlowe validator checks that the state transition is valid according to the contract description.

This architecture means Marlowe inherits all of Cardano's security properties (eUTXO determinism, native multi-asset support, etc.) while providing a higher-level abstraction for financial contracts.

## Common Misconceptions

**"Marlowe is a replacement for Plutus."**
Marlowe is not a replacement but a complement to Plutus. It is a higher-level DSL designed for a specific domain (financial contracts). For applications outside this domain — games, DAOs, complex DeFi protocols with custom logic — Plutus (or Aiken, Helios, etc.) remains the appropriate choice. Marlowe trades generality for safety guarantees and accessibility.

**"Marlowe contracts can do everything Solidity contracts can."**
Marlowe is intentionally more restrictive than general-purpose smart contract languages. It cannot express arbitrary computation, recursive contracts, or unbounded loops. These restrictions are what enable its safety guarantees. For applications requiring more flexibility, developers should use Plutus directly.

**"You need to know Haskell to use Marlowe."**
Marlowe can be authored using visual blocks (Blockly), JavaScript, or direct Marlowe syntax, none of which require Haskell knowledge. The Haskell mode is available for those who prefer it but is not required.

**"Marlowe is only for simple contracts."**
While individual Marlowe constructs are simple, they can be composed to create sophisticated financial agreements including multi-party escrows, options contracts, bonds with coupon payments, and contracts for difference. The simplicity of the primitives does not limit the complexity of the compositions.

## Comparison Points

| Feature                | Marlowe                        | Plutus                   | Solidity                 |
| ---------------------- | ------------------------------ | ------------------------ | ------------------------ |
| Target audience        | Business/finance professionals | Developers               | Developers               |
| Language type          | Domain-specific (financial)    | General-purpose          | General-purpose          |
| Guaranteed termination | Yes                            | No                       | No                       |
| No asset trapping      | Yes (by construction)          | Developer responsibility | Developer responsibility |
| Static analysis        | Full path enumeration          | Partial                  | Partial                  |
| Visual authoring       | Yes (Blockly)                  | No                       | No                       |
| Turing complete        | No                             | Yes                      | Yes                      |
| Expressiveness         | Financial contracts            | Arbitrary logic          | Arbitrary logic          |

## Sources

- Lamela Seijas, P., & Thompson, S. (2018). "Marlowe: Financial Contracts on Blockchain." ISoLA 2018.
- Marlowe Documentation: https://docs.marlowe.iohk.io
- Marlowe Playground: https://play.marlowe.iohk.io
- Peyton Jones, S., & Eber, J. M. (2003). "Composing Contracts: An Adventure in Financial Engineering."
- Cardano Documentation: https://docs.cardano.org

## Last Updated

2025-02-01
