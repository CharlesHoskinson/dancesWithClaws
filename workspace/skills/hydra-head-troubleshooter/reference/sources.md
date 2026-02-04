# Hydra Troubleshooter Documentation Sources

This file documents the sources for the troubleshooting decision tree.

## Primary Source

### hydra.family "Operating Hydra" - Common Issues Section

URL: https://hydra.family/head-protocol/docs/how-to/operating-hydra#common-issues

Last verified: 2024-01

## Issue Mappings

| Skill Section            | Source Section                        | Notes                          |
| ------------------------ | ------------------------------------- | ------------------------------ |
| A) No head observed      | Common Issues - Network/Scripts       | Direct mapping                 |
| B) Head doesn't progress | Common Issues - Connectivity          | Direct mapping                 |
| C) Peer out of sync      | Common Issues - Snapshot side-loading | Direct mapping                 |
| D) Mirror nodes          | Operating Hydra - HA section          | SnapshotAlreadySigned handling |

## Log Patterns

Derived from:

- hydra-node JSON log output format
- hydra.family monitoring documentation
- Practical debugging experience

| Pattern           | Source                                 |
| ----------------- | -------------------------------------- |
| PeerConnected     | hydra-node network layer logs          |
| AckSn             | Hydra protocol snapshot acknowledgment |
| LogicOutcome      | Head state machine transitions         |
| SnapshotConfirmed | Consensus completion                   |

## API Endpoints Referenced

From API Reference: https://hydra.family/head-protocol/docs/api-reference

| Endpoint       | Purpose            |
| -------------- | ------------------ |
| GET /health    | Node health check  |
| GET /peers     | Connected peers    |
| GET /status    | Head status        |
| GET /snapshot  | Current snapshot   |
| POST /snapshot | Side-load snapshot |

## Metrics Referenced

From Prometheus metrics exposed on monitoring port:

- `hydra_head_peers_connected` - Connected peer count
- Various snapshot and transaction metrics

## Updating This File

When troubleshooting patterns change:

1. Verify against latest hydra.family docs
2. Test decision tree steps with current hydra-node
3. Update log patterns if format changes
4. Add new issues as they're documented
