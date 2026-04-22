---
topic: YubiHSM 2 + TEE-Vault end-to-end workflow for Logan
date: 2026-04-21
status: research-complete
recommendation: Wire wrapper script now, build agent_env_prepare hook medium-term
confidence: 0.80
---

# HSM / TEE-Vault Workflow Research — Logan

## Current State (what works today)

- **CLI surface:** `openclaw tee init | unlock | lock | status | list | import | export | rotate | rotate-vmk | delete | audit | backup`, plus `tee credential store/get/delete/list`, `tee ssh-config …`, `tee openbao …`.
- **Vault file:** `~/.openclaw/tee-vault/vault.enc` (AES-GCM envelope, per-entry EEK derived via HKDF-SHA256 from VMK; HMAC integrity).
- **YubiHSM backend defaults** (`extensions/tee-vault/src/constants.ts:28–31`):
  - PKCS#11 DLL: `C:\Program Files\Yubico\YubiHSM Shell\bin\pkcs11\yubihsm_pkcs11.dll`
  - Connector: `http://localhost:12345`
  - Slot: `0`
- **VMK lives in HSM**: 256-bit AES key generated inside the device (non-extractable). Only the object ID is stored in `vault.enc` as `sealedVmk`.
- **Entry types:** `secret | api_token | ssh_key | private_key | certificate`. Right type for `MOLTBOOK_API_KEY` = `api_token`.
- **Session auto-lock** wired via plugin `session_end` hook.
- **Audit logging** wired via `after_tool_call`.

## Bootstrap Sequence (HSM plugged in, connector running)

```bash
# 1. Cache HSM PIN in Windows Credential Manager
openclaw tee credential store --target hsmPin

# 2. Initialize the vault with the HSM backend
openclaw tee init --backend yubihsm

# 3. Unlock
openclaw tee unlock

# 4. Import MOLTBOOK_API_KEY (pipe-stdin form)
echo "$MOLTBOOK_API_KEY" | openclaw tee import \
  --label moltbook_api_key \
  --type api_token \
  --tag production,cardano

# (Optional) same for OPENAI_API_KEY if we keep OpenAI embeddings
```

Prerequisites: `yubihsm-connector` daemon running on host at `localhost:12345`, YubiHSM 2 USB device plugged in, `graphene-pk11` resolvable at runtime, PKCS#11 DLL at default path.

## Runtime Flow

The YubiHSM USB device and connector live on the **host**. The Docker sandbox has no `--device`, no PKCS#11, no Credential Manager access. Therefore secrets MUST be decrypted outside the sandbox and injected via `docker run --env`.

```
host boots →
  Windows Task Scheduler task →
    PowerShell: resolve PIN from Credential Manager →
    openclaw tee unlock →
    openclaw tee export --label moltbook_api_key →
    export env →
    openclaw agent start logan
      →  src/agents/sandbox/docker.ts passes --env MOLTBOOK_API_KEY=<plaintext>
      →  sandbox container sees it via process.env
```

## Gaps Against What Logan Needs

1. **No `agent_env_prepare` / `agent_spawn_pre` plugin hook.** The spawn path (`src/agents/sandbox/docker.ts:368–376`, `src/agents/acp-spawn.ts`) reads env only from host `process.env` + `openclaw.json.env.vars`. It never consults the vault.
2. **No daemon auto-unlock on boot.** `openclaw tee unlock` requires a PIN source; in a headless service it will hang on the prompt unless PIN is in Credential Manager _and_ resolver runs with access to that store.
3. **No `--pin-from-source` flag.** Service context without a TTY blocks indefinitely if the prompt fires.
4. **No `openclaw tee health-check`.** No single command to probe "can I unlock, retrieve a test secret, and re-lock" — useful as a startup gate.
5. **`credentialManager.resolveHsmPin()` prompts if Credential Manager lookup fails.** Needs a non-interactive mode for services.

## Near-Term (wrapper-based) Integration

File: `scripts/launch-logan-with-vault.ps1` (new, ~25 lines)

```powershell
$ErrorActionPreference = "Stop"

# Resolve PIN from Credential Manager (non-interactive)
$env:YUBIHSM_PIN = (Get-StoredCredential -Target 'TeeVault-YubiHSM-PIN').GetNetworkCredential().Password

# Unlock vault
& openclaw tee unlock --quiet

# Retrieve secrets into env for this process only
$env:MOLTBOOK_API_KEY = (& openclaw tee export --label moltbook_api_key --format raw)

# (Only if still using OpenAI embeddings — remove after mxbai-embed-large migration)
# $env:OPENAI_API_KEY = (& openclaw tee export --label openai_api_key --format raw)

# Spawn Logan
& openclaw agent start logan
```

Then: Windows Task Scheduler runs this on boot. No `.bashrc` dependency.

## Medium-Term (native) Integration

Add a plugin hook `agent_env_prepare` in OpenClaw. Semantics:

- Fires in `acp-spawn.ts` after `applyConfigEnvVars()` and before sandbox creation.
- Iterates over `openclaw.json.env.vars` entries whose value is a vault reference (e.g., `"vault://moltbook_api_key"`).
- Calls `vault_retrieve` through the tee-vault plugin (non-sandboxed by construction).
- Replaces the placeholder in the outgoing `--env` list with the decrypted value.
- Clears references after sandbox spawn.

Config pattern:

```json
"env": {
  "vars": {
    "MOLTBOOK_API_KEY": "vault://moltbook_api_key"
  }
}
```

With `agent_env_prepare` wired, the wrapper script becomes optional.

## Failure & Recovery

| Failure                | Recovery                                                     |
| ---------------------- | ------------------------------------------------------------ |
| HSM unplugged mid-run  | Plug back in, re-run `openclaw tee unlock`                   |
| Connector not running  | `yubihsm-connector -d`                                       |
| Wrong PIN              | `openclaw tee credential delete --target hsmPin`, re-store   |
| Vault HMAC mismatch    | Restore from `openclaw tee backup`                           |
| PIN forgotten          | No recovery without backup + old PIN; no mnemonic path today |
| Entry version mismatch | `openclaw tee rotate --label X`                              |

Backup strategy: `openclaw tee backup --out vault.enc.<date>` on a schedule.

## Sandbox Security Note

Plaintext secret flows through `docker run --env`. Sandbox can in principle dump `/proc/self/environ`. Mitigations already in place:

- `capDrop: ALL`, `readOnlyRoot: true`, seccomp profile
- No write to host FS → can't exfiltrate
- Proxy egress allowlist → can't POST to evil.com
- Audit log records every vault retrieval

Acceptable for a single-tenant trust boundary.

## Recommendation

**Short-term (this iteration):** Build the wrapper script. Migrate `MOLTBOOK_API_KEY` into the vault. Keep `~/.bashrc` only as a temporary fallback until the wrapper is verified.

**Medium-term:** Add `agent_env_prepare` hook to `src/agents/acp-spawn.ts` and teach `openclaw.json` to accept `vault://` URIs. Remove the wrapper.

**Long-term:** Put Cardano signing/payment keys in the HSM if/when Logan signs anything on-chain. Add non-interactive `--pin-from-source` flag and `openclaw tee health-check` CLI. Consider remote attestation hooks.

## CLI File Citations

- `extensions/tee-vault/src/cli/tee-cli.ts` (init/unlock/lock/status/list/import/export/rotate/…)
- `extensions/tee-vault/src/crypto/yubihsm.ts` (PKCS#11)
- `extensions/tee-vault/src/integrations/credential-manager.ts` (PIN storage)
- `extensions/tee-vault/src/vault/vault-entries.ts` (EEK derivation, AES-GCM)
- `extensions/tee-vault/src/vault/vault-lock.ts` (VMK unwrap)
- `extensions/tee-vault/src/constants.ts` (defaults)

## Open Questions

- Does OpenClaw daemon service context (Windows) currently have access to the user's Credential Manager? (May need Task Scheduler run "as the user" not as SYSTEM.)
- Should OPENAI_API_KEY stay vaulted if we swap to mxbai-embed-large? (If yes → zero OpenAI dependency, drop the vault entry.)
