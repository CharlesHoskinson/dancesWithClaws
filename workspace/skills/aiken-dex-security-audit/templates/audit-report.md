# Security Audit Report — <DEX NAME> (Aiken / Plutus V3)

## Scope

- Repo: <url/path>
- Commit: <sha>
- In-scope scripts:
  - <script> — <purpose>
- Out-of-scope:
  - <stuff>

## Assumptions

- <explicit assumptions>
- Trusted roles / keys: <none | describe>
- Oracles: <none | describe>

## System Model

### Assets

- <policy.asset> — <role>

### State UTxOs

- <state utxo name> — address: <...>, datum: <...>, value: <...>

### State Machine (Transitions)

- <transition name>
  - Inputs:
  - Outputs:
  - Mint/Burn:
  - Required signers:
  - Validity interval:

## Invariants (Testable)

- INV-001: <statement>
  - How attacker tries to break it:
  - Evidence/tests:

## Threat Model

- Attacker capabilities (eUTxO):
- Attack surfaces:
- Economic / griefing vectors:

## Findings Summary Table

|    ID | Title   | Severity                     | Likelihood     | Impact | Affected      | Exploit Sketch | Fix     | Test Added |
| ----: | ------- | ---------------------------- | -------------- | ------ | ------------- | -------------- | ------- | ---------- |
| F-001 | <title> | <Critical/High/Med/Low/Info> | <High/Med/Low> | <...>  | <files:lines> | <tx shape ref> | <patch> | <test>     |

## Detailed Findings

### F-001 — <title>

- Severity: <...>
- Root cause:
- Exploitability:
- Minimal exploit tx shape:
  - See: `templates/tx-shapes.md` filled as `F-001`
- Recommended fix:
- Regression test:

## Execution Budget / DoS Review

- Hot paths:
- Griefing vectors:
- Recommendations:

## Deployment Checklist

- Script hash verification:
- Parameter locking strategy:
- Monitoring hooks:
- Emergency procedures:

## Known-Unknowns / Gaps

- <what couldn't be verified and why>
