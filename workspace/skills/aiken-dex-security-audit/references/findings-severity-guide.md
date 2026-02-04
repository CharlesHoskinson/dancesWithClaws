# Severity Guide (DEX / DeFi)

## Critical

- Direct theft of user funds or pool reserves
- Infinite mint / arbitrary burn of valuable assets
- Permanent loss / irrecoverable stuck funds
- Bypass of core auth leading to catastrophic state transitions

## High

- Theft possible with additional assumptions or timing
- Major protocol DoS that blocks swaps/liquidity reliably
- Significant accounting break that enables unfair extraction

## Medium

- DoS or griefing that is real but costs attacker meaningfully
- Edge-case accounting errors with limited impact
- Misconfiguration risk that could lead to loss if deployed wrong

## Low / Info

- Best-practice gaps, readability, missing checks that don't appear exploitable
- Minor inefficiencies or non-critical validations
