# Troubleshooter quick probes

## Collect facts (run on each node)

```bash
hydra-node --version || true
hydra-node --help | sed -n '1,80p'
hydra-node run --help | sed -n '1,200p' || true

# last logs (example; adjust to your service manager)
# docker: docker logs --tail=300 hydra-node
# systemd: journalctl -u hydra-node -n 300 --no-pager
```

## Log keywords to grep for

- Peer connectivity: `PeerConnected`
- Snapshot ack phase: `AckSn`
- Errors around logic: `LogicOutcome`
- Mirror nodes: `SnapshotAlreadySigned` (harmless in mirror setups)

## Metrics (if enabled)

```bash
curl http://localhost:<MONITORING_PORT>/metrics | grep -E 'hydra_head_peers_connected|hydra_head_confirmed_tx'
```
