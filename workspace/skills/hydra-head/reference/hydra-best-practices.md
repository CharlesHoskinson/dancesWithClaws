# Hydra Head references (hydra.family-aligned)

## Minimal command probes

```bash
hydra-node --help | sed -n '1,80p'
hydra-node run --help | sed -n '1,160p' || true
```

## Key generation

**Cardano keys**

```bash
cardano-cli address key-gen       --verification-key-file cardano.vk       --signing-key-file cardano.sk
```

**Hydra keys**

```bash
hydra-node gen-hydra-key --output-file hydra
# produces hydra.sk and hydra.vk
```

## Cardano connectivity modes

**Direct to cardano-node**

```bash
hydra-node run       --testnet-magic <MAGIC>       --node-socket <PATH_TO_NODE_SOCKET>       ...
```

**Blockfrost**

```bash
hydra-node run       --blockfrost blockfrost-project.txt       ...
```

Note: when using Blockfrost, the underlying network is inferred; don't also pass `--mainnet` / `--testnet-magic`.

## Operational checklist (from docs)

- Ensure cardano-node is ready before hydra-node starts (socket open; ledger reconstructed)
- Verify scripts transaction id for preview/preprod/mainnet
- Ensure your `--cardano-signing-key` matches the verification key used in Init
- Verify peers are connected (`PeerConnected` seen) and hydra keys match expectations (`AckSn` received)
