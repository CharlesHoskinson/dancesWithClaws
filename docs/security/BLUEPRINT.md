# YubiHSM2 Blueprint — Declarative Provisioning

A `hsm-blueprint.yaml` at the repo root captures the intended state of a
YubiHSM2 device (or the bundled simulator). The `@dancesWithClaws/yubihsm`
package parses and reconciles this file against a live device, so operator
provisioning is idempotent and auditable.

Companion spec: `docs/superpowers/specs/2026-04-19-yubihsm2-security-architecture-design.md`.

## Schema

Top-level keys (all required unless marked optional):

- `version` — literal `1`.
- `device.min_firmware` — minimum acceptable firmware version (SemVer string).
- `device.serial_pin` _(optional)_ — Credential Manager ref for device serial PIN.
- `device.fips_mode` _(optional, default `false`)_ — require FIPS submode.
- `domains` — map of 1-based domain id → `{ label, purpose }`.
- `auth_keys[]` — each entry:
  - `id` (1..0xFFFE)
  - `role` — human-readable label written to the device.
  - `domains[]` — integer ids this key may operate on.
  - `capabilities[]` — capabilities granted to the key itself.
  - `delegated_capabilities[]` _(optional, default `[]`)_ — capabilities the
    key may delegate when creating new objects.
  - `credential_ref` — `cred:<name>` identifier looked up in the host's
    Credential Manager at apply time.
- `wrap_keys[]` — AES-CCM wrap keys:
  - `id`, `domains[]`, `algorithm` (`aes128-ccm-wrap` | `aes192-ccm-wrap` | `aes256-ccm-wrap`)
  - `delegated_capabilities[]` — which capabilities may be exported under this
    wrap key.
- `policies.audit.drain_every` — duration string (`Ns` | `Nm` | `Nh` | `Nms`).
- `policies.audit.permanent_force_audit` — if `true`, the device refuses
  commands when the audit log fills (safer default; lower throughput).
- `policies.sessions.pool_size` — concurrent SCP03 sessions the driver pool
  may hold open.
- `policies.sessions.idle_timeout` — duration string.

Unknown capability strings fail validation at parse time; the reconciler
never issues a command the device would reject as unsupported.

## Capabilities recognized

`generate-asymmetric-key`, `put-authentication-key`, `sign-ecdsa`,
`sign-eddsa`, `sign-pkcs`, `wrap-data`, `unwrap-data`, `export-wrapped`,
`import-wrapped`, `exportable-under-wrap`, `get-log-entries`,
`delete-asymmetric-key`, `sign-attestation-certificate`.

The list maps 1:1 to the `Capability` enum in
`packages/yubihsm/src/types/capability.ts`. New names extend the map in
`packages/yubihsm/src/blueprint/schema.ts`.

## Reconcile loop

```
parse(blueprint) ─► plan(session, bp) ─► apply(session, plan) ─► diff(session, bp)
                                                                        │
                                                                        └─► empty ⇒ converged
```

- `plan` reads the device via `LIST_OBJECTS`, compares against the desired
  set, and returns `{ create, update, delete }`.
- `apply` executes the create/delete steps in order. For auth keys it calls
  `PUT_AUTHENTICATION_KEY`; credential material comes from the host's
  Credential Manager via `resolveCredential(ref)`.
- `diff` is `plan` exposed under a name that signals "no mutation".

Bootstrap auth keys (the one used to open the admin session) are passed in
via `preserveAuthKeyIds` so they are not flagged for deletion when absent
from the blueprint.

## CLI (Task 19 — pending)

The `openclaw hsm plan|apply|diff` verbs wrap the reconcile functions with
ergonomic defaults:

- Blueprint path: `hsm-blueprint.yaml` at repo root (override via
  `--blueprint`).
- Connector URL: `HSM_CONNECTOR_URL` env var (default
  `http://localhost:12345`).
- Admin credentials: resolved from Windows Credential Manager via
  `extensions/tee-vault/src/integrations/credential-manager.ts`.

## Testing locally

The in-repo simulator is a complete wire-compatible replacement for the
real connector. It runs entirely in Node, without hardware or
`yubihsm-connector`:

```ts
import { createSimulator, storeBackedHandler, createStore } from "@dancesWithClaws/yubihsm-sim";

const store = createStore();
const sim = createSimulator(storeBackedHandler(store));
const port = await sim.start();
// point your driver / CLI at http://127.0.0.1:<port>
```

Tests under `packages/yubihsm/tests/blueprint/` show the full
parse → plan → apply → diff cycle running against the simulator.
