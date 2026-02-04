# Cardano Engineering Principles (Skill Pack Shared Notes)

- **Never assume CLI syntax**: run `cardano-cli --help` and `cardano-cli <era> --help` to confirm flags.
- **Never hardcode protocol params**: fetch params from the target network right before building transactions.
- **Prefer `transaction build` (online)** for convenience; use `build-raw` + offline signing for cold-key ops.
- **Treat signing keys as radioactive**: keep payment.skey / stake.skey off internet boxes when possible.
- **Test on Preprod/Preview first** before Mainnet, especially script spends.
- **Keep outputs deterministic**: always record tx body, witness set, scripts, datum/redeemer, and pparams used.
