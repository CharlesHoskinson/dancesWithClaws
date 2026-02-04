# Minimal Exploit Transaction Shapes (Template)

Purpose: standardize how we describe "the smallest transaction that breaks the invariant."
Fill one of these per finding (F-###).

---

## Finding ID: F-###

### Title

<short title>

### Goal

What the attacker wants (steal funds, mint infinite, bypass fee, brick pool, etc.)

### Preconditions

- Existing UTxOs required:
  - UTxO-A: <address> <value> <datum?>
  - UTxO-B: ...
- Parameters assumed:
  - <policy id / script hash / config>

### Transaction Skeleton

#### Inputs (consumed)

1. Input: <tx#ix>
   - Address: <pubkey | script>
   - Value: <assets>
   - Datum: <inline | hash | none>
   - Script? <yes/no> — if yes: which validator
   - Redeemer: <redeemer variant + key fields>

2. ...

#### Reference Inputs (read-only)

- Ref-1: <tx#ix> — used for <ref script | datum | config>

#### Mint / Burn

- Minted:
  - - <policy.asset> : <amount>
- Burned:
  - - <policy.asset> : <amount>
- Redeemer for mint policy: <...>

#### Outputs (created)

1. Output:
   - Address: <pubkey | script>
   - Value: <assets>
   - Datum: <inline | hash | none>

2. ...

#### Required Signers

- <key hash list> (or "none")

#### Validity Interval

- lower bound: <slot/time> (or none)
- upper bound: <slot/time> (or none)

#### Withdrawals / Certificates (if relevant)

- Withdrawals: <stake address -> amount>
- Certificates: <...>

#### Fees / Collateral (if relevant)

- Fee: <lovelace>
- Collateral inputs: <...>

### Why this passes today (root cause)

Explain precisely which check(s) are missing/incorrect and how the tx structure exploits it.

### What invariant it violates

Reference the invariant ID from `invariants-checklist.md` or your report.

### Expected outcome

What the chain state looks like after (who gained what, what got bricked, etc.)

### Regression Test Plan (Aiken)

- Test name: `test_f_###_<short>`
- Setup:
- Assertion:
- Failure mode before fix:
