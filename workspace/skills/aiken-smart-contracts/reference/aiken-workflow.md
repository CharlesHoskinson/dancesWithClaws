# Aiken workflow (practical)

```bash
aiken --version
aiken build
```

Common artifact flow:

- Build the project
- Generate a blueprint (if your project uses one)
- Convert blueprint to a script format the CLI can consume

```bash
# Example (verify subcommands in your Aiken version)
aiken blueprint convert <your-blueprint.json> -o validator.plutus
```

Then use `validator.plutus` with `cardano-cli` script transaction commands.
