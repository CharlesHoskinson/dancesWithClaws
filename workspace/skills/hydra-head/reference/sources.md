# Hydra Documentation Sources

This file documents the sources used to build the Hydra Head skills. Keep this updated when:

- hydra-node releases new versions with changed behavior
- hydra.family documentation is updated
- New features are added to the skills

## Primary Sources

### hydra.family Official Documentation

Base URL: https://hydra.family/head-protocol/

| Section         | URL                                                                             | Last Verified |
| --------------- | ------------------------------------------------------------------------------- | ------------- |
| Getting Started | https://hydra.family/head-protocol/docs/getting-started                         | 2024-01       |
| Configuration   | https://hydra.family/head-protocol/docs/getting-started/quickstart/with-cardano | 2024-01       |
| Operating Hydra | https://hydra.family/head-protocol/docs/how-to/operating-hydra                  | 2024-01       |
| Troubleshooting | https://hydra.family/head-protocol/docs/how-to/operating-hydra#common-issues    | 2024-01       |
| API Reference   | https://hydra.family/head-protocol/docs/api-reference                           | 2024-01       |

### GitHub Repository

- **Main repo**: https://github.com/input-output-hk/hydra
- **Release notes**: https://github.com/input-output-hk/hydra/releases
- **Scripts tx ids**: Published in release notes for each network

## Version Compatibility

| hydra-node Version | Skills Version | Notes                    |
| ------------------ | -------------- | ------------------------ |
| 0.20.x             | Current        | Deposit/decommit support |
| 0.19.x             | Compatible     | Mirror nodes introduced  |
| 0.18.x             | Compatible     | Basic functionality      |

## Key Concepts Referenced

### From "Operating Hydra"

- Cardano vs Hydra key separation
- Contestation period configuration
- Deposit period handling
- Peer connectivity requirements
- Scripts tx id per network

### From "Common Issues"

- "No head observed" → network/scripts/key issues
- "Head doesn't progress" → peer/hydra-key issues
- "Peer out of sync" → snapshot side-loading fix
- Mirror node behavior (SnapshotAlreadySigned)

## Scripts Transaction IDs

> **Important**: Always get current scripts tx ids from the latest hydra-node release notes.

These are examples and may be outdated:

```
Preview:  (check release notes)
Preprod:  (check release notes)
Mainnet:  (check release notes)
```

## Updating This File

When hydra-node releases a new version:

1. Check release notes for breaking changes
2. Verify scripts tx ids for each network
3. Test skills against new version
4. Update version compatibility table
5. Update "Last Verified" dates

## Related Skills

- `hydra-head` - Operational best practices
- `hydra-head-operator` - Execution skill (manual invoke)
- `hydra-head-troubleshooter` - Decision tree for issues
