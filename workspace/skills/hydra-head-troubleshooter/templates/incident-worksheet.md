# Hydra incident worksheet (copy/paste into a ticket)

## Symptom

- [ ] No head observed from chain
- [ ] Head does not make progress
- [ ] Peer out of sync / stuck snapshots
- [ ] Connectivity flaps / etcd quorum issues
- [ ] Other:

## Environment

- Network: mainnet / preprod / preview / devnet
- hydra-node version:
- Cardano connectivity: node socket / blockfrost
- scripts tx id:

## Peers

- Node A advertise:
- Node B advertise:
- Node C advertise:
- Peer mesh complete? Y/N

## Evidence

- Logs A (time window):
- Logs B:
- Logs C:
- Keywords found:
  - PeerConnected: Y/N
  - AckSn: Y/N
  - LogicOutcome errors: Y/N
  - SnapshotAlreadySigned: Y/N

## Fix attempted

- [ ] corrected network flags / magic
- [ ] ensured cardano-node ready before hydra-node start
- [ ] updated scripts tx id
- [ ] corrected cardano/hydra verification keys
- [ ] snapshot side-load performed (GET /snapshot + POST /snapshot)
- [ ] adjusted mirror node counts / etcd quorum
