# Invariants Checklist — Aiken DEX (Plutus V3)

## Value & Accounting

- [ ] Conservation of value (no unexpected value creation)
- [ ] Mint/burn only via intended policy, with correct asset class checks
- [ ] Fees are bounded, non-negative, and rounding is safe
- [ ] No division-by-zero, no negative amounts, no overflow/underflow

## State Authentication

- [ ] State UTxO(s) cannot be spoofed (authenticity checks exist)
- [ ] Exactly-one vs at-least-one state UTxO is enforced correctly
- [ ] Datum format validated (inline vs hash expectations consistent)
- [ ] Redeemer paths are mutually exclusive or safely composable

## Composability / eUTxO Multi-Action Safety

- [ ] "Double satisfaction" (multi-UTxO satisfaction) not possible
- [ ] Multi-action txs cannot bypass checks (swap+deposit+withdraw combos)
- [ ] Reference inputs/scripts do not allow bypasses

## Time / Validity Interval

- [ ] Lower/upper bound logic correct (inclusive/exclusive as intended)
- [ ] No "forever-valid" griefing path; time constraints match design

## Boundedness / Liveness

- [ ] Datum cannot grow unbounded over time
- [ ] Token bundle size cannot be weaponized (dust / UTxO poisoning)
- [ ] Script remains spendable under adversarial deposits

## Access Control / Admin Features (if any)

- [ ] Admin keys strictly scoped to intended actions
- [ ] Upgrades/migrations cannot steal user funds
- [ ] Emergency controls cannot be abused

## Evidence

- [ ] Unit tests for each valid transition path
- [ ] Property tests for invariants
- [ ] Regression test per finding (fails before fix, passes after)
