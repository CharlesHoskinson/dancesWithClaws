# YubiHSM2 Security Architecture for dancesWithClaws

**Status:** Design approved — ready for implementation planning
**Date:** 2026-04-19
**Author:** Charles Hoskinson (with Claude)
**Supersedes:** `mostlySecure.md` (kept as intent reference)
**Companion repos reviewed:** `openclaw/openclaw`, `NVIDIA/NemoClaw`

---

## 1. Context

`dancesWithClaws` is a downstream fork of `openclaw/openclaw` (branch `custom`),
with Logan (the Moltbook Cardano-educator agent) riding on top. Upstream openclaw
operates under an explicit "trusted-operator" trust model: secrets live in
`~/.openclaw/openclaw.json` and `.env`, anyone with write access to that
filesystem is considered the operator. NVIDIA's NemoClaw (a sandbox/installer
wrapper for openclaw) inherits the same gap — its `credentials.json` is
plaintext 0600, explicitly flagged in its README as a known limitation.

This project already contains partial YubiHSM2 scaffolding in
`extensions/tee-vault/` (PKCS#11 via `graphene-pk11`, Windows Credential Manager
wired for PINs, `mostlySecure.md` as intent spec), but with material gaps:
stubbed `getHsmInfo`, no attestation verification, a non-concurrency-safe
session singleton, no PIN rate-limit/backoff, no key-rotation or backup-wrap
flow, and `integrations/openbao.ts` not wired through HSM wrap keys.

This spec pivots dancesWithClaws from "downstream fork that tracks openclaw" to
**"security-hardened reference implementation of an openclaw-compatible agent
framework, rooted in a YubiHSM2 hardware security module, with a Lean 4
mechanized specification of its critical protocol and authorization
invariants."**

## 2. Goals and non-goals

### 2.1 Goals

1. Defeat host-level credential theft. Provider API keys, channel tokens, and
   gateway secrets are sealed at rest under HSM-owned wrap keys; plaintext never
   touches disk post-install.
2. Defeat plugin-level credential theft. A compromised openclaw plugin cannot
   exfiltrate sealed secrets beyond its declared `sealCapabilities`, because the
   HSM enforces capability + domain intersection at the hardware boundary.
3. Provide a clean `SecurityRuntime` interface such that the HSM integration
   lands as an opt-in adapter, suitable for upstream contribution to
   `openclaw/openclaw` without forcing a YubiHSM dependency on all operators.
4. Provide a Lean 4 mechanization of the SCP03 protocol state machine, the
   authorization rule (capability + domain intersection), the audit-log
   hash-chain, and blueprint-apply convergence. Theorems are proved; test
   oracles are extracted from the Lean layer via `#eval`.
5. Provide a four-tier test stack (goldens, unit, property, simulator,
   real-device) with hermetic CI via an in-repo simulator that is itself checked
   against the Lean spec.

### 2.2 Non-goals (explicit YAGNI)

- **Dual-device backup with offline secondary YubiHSM2.** Recovery via wrap-key
  export is scoped; a second physical device is a follow-up spec.
- **Human-in-the-loop signing approvals.** A signing-approval hook is
  future-compatible (pluggable policy shim) but not implemented in v1.
- **Hardware-rooted operator identity / signed agent-output attestation.**
  Separate spec.
- **Cryptographic primitive mechanization in Lean.** AES-CMAC, AES-CTR, KDF
  derivations are treated as opaque correct primitives. Only the protocol using
  them is mechanized.
- **Upstream PR to openclaw/openclaw.** The `SecurityRuntime` contract is
  designed to be upstream-friendly; actually submitting it is follow-up work.
- **Mutation testing and adversarial fuzzing.** Follow-up spec.
- **PKCS#11 as primary transport.** See §4.2; legacy path kept behind a flag.
- **FIPS 140-3 mode.** YubiHSM2 FIPS is 140-2 L3 validated today; if operators
  want FIPS mode it is a single config switch (`fips_mode: true` in blueprint).

## 3. Threat model (tier B)

### 3.1 In scope

| Adversary | Example | Defence |
|---|---|---|
| Host malware / infostealer | Credential-stealing malware reads `.env`, Credential Manager, browser-stored tokens | Private keys and wrap keys never exist in host RAM; provider API keys sealed under HSM wrap key, unsealed transiently and zeroized after use. |
| Compromised openclaw plugin | Malicious extension tries to exfiltrate provider keys or sign operator tokens | Per-plugin auth key with narrow capabilities + single domain; capability-intersection rule enforced by HSM; policy shim gates what can be signed. |
| Supply-chain tamper of `extensions/tee-vault` | Attacker modifies the tee-vault package | Wrap keys are held by admin auth key which is held by operator PIN; tampered tee-vault cannot mint new wrap keys or enlarge plugin auth-key capabilities. |
| USB-wire tamper between connector and HSM | Physical attacker intercepts USB | SCP03 AES-ENC + AES-MAC on every APDU after session open. |

### 3.2 Out of scope

| Adversary | Why out of scope |
|---|---|
| Compromised agent session (prompt-injected Logan) | Tier C deferred. The HSM signs what the TS driver sends; semantic "what should I sign" stays in agent-level guardrails. A signing-policy hook exists as a pluggable component for follow-up. |
| Physical attacker with unlimited time and lab equipment | YubiHSM2 is not Common Criteria EAL5+ and Yubico does not claim defence against high-assurance side-channel attacks. |
| Denial-of-service by unplug or session exhaustion | Outside the confidentiality/integrity remit. Availability is a best-effort property. |
| Supply-chain compromise of `dancesWithClaws` releases | Tier D deferred. Release-artifact signing is a follow-up spec. |

### 3.3 Required operator assumptions

- The operator physically controls the YubiHSM2 and the host it is plugged into.
- Admin auth-key PIN is chosen by the operator at enrollment; Yubico's default
  is replaced during `openclaw hsm init`.
- Windows Credential Manager is trusted to hold PINs at rest with DPAPI
  protection. DPAPI compromise is equivalent to host compromise (tier A
  adversary); PINs do not grant key extraction, only signing within capability.
- Operator drains the audit log per policy; a stuck audit log halts signing.

## 4. Architecture

### 4.1 Component view

```
┌───────────────────────────────────────────────────────────────────┐
│  dancesWithClaws host process (openclaw gateway + agents)         │
│                                                                   │
│  src/secrets/           → resolves via HsmSecretProvider          │
│  src/gateway/auth/      → verifies bearer via HsmTokenVerifier    │
│  packages/plugin-sdk/   → security-runtime: HsmSigner, HsmSealer  │
└────────────────────────────────────┼──────────────────────────────┘
                                     │  in-process TS API
                        ┌────────────▼────────────┐
                        │  @dancesWithClaws/yubihsm│  ← new package
                        │  ├─ session (SCP03)      │
                        │  ├─ commands             │
                        │  ├─ blueprint            │
                        │  ├─ attestation          │
                        │  └─ audit-log            │
                        └────────────┬────────────┘
                                     │  HTTP /connector/api
                        ┌────────────▼────────────┐
                        │   yubihsm-connector      │  (Yubico daemon)
                        └────────────┬────────────┘
                                     │  USB
                        ┌────────────▼────────────┐
                        │        YubiHSM2          │
                        └──────────────────────────┘
```

### 4.2 Transport decision

The existing tee-vault code uses PKCS#11 via `graphene-pk11` → yubihsm-connector.
PKCS#11 is adequate for classic signing but does not expose attestation
certificate generation, audit-log retrieval, device-info, template objects, or
wrap/unwrap with delegated capabilities. Paper-over-with-subprocess (calling
`yubihsm-shell`) is fragile and adds Python/shell-out dependencies.

**Chosen:** native TypeScript driver speaking the yubihsm-connector HTTP wire
protocol directly, with SCP03 session layer implemented in TS. The SCP03-DIY
risk is answered by Lean 4 mechanization (§6) and a test stack that replays
recorded wire vectors from real hardware (§7). The PKCS#11 path in
`extensions/tee-vault/src/crypto/yubihsm.ts` is kept behind a `legacy_pkcs11:
true` flag and marked deprecated.

### 4.3 Three new packages

```
packages/
├─ yubihsm/                         ← new, publishable, zero openclaw-core deps
├─ yubihsm-sim/                     ← new, dev-dep only
└─ security-runtime-hsm/            ← new, upstream-candidate adapter
```

`extensions/tee-vault/` becomes a consumer of `@dancesWithClaws/yubihsm` rather
than the owner of the HSM code.

### 4.4 Components

#### (a) `yubihsm/session` — SCP03 secure channel

Pure-functional `Scp03Session` class. No I/O. Parameterised by `HsmTransport`
(HTTP in prod, in-memory simulator in tests). State machine:
`INIT → AUTHENTICATED → SECURE_CHANNEL → CLOSED`. Every step is deterministic
given `(state, message)`. GlobalPlatform SCP03 with AES-128 session keys derived
from the auth key's ENC + MAC pair.

**Key invariants enforced in the type system and proved in Lean:**
- R-MAC counter strictly monotone within a session.
- Commands rejected before authentication complete.
- Session object is the only way to produce a signed APDU — there is no
  constructor for a signed APDU outside `Scp03Session`.

#### (b) `yubihsm/commands` — typed command layer

One function per HSM command the framework uses:

- `generateAsymmetricKey(session, spec)` — returns `{ objectId, attestationCert }`
- `signEcdsa(session, keyId, digest)` / `signEddsa` / `signPkcs1`
- `wrapData(session, wrapKeyId, plaintext)` / `unwrapData`
- `getLogEntries(session, sinceIndex)`
- `signAttestationCertificate(session, targetKeyId, issuerKeyId)`
- `getDeviceInfo(session)`
- `putAuthenticationKey(session, spec)`
- `deleteObject(session, objectId, type)`
- `blinkDevice(session, secs)`

Each takes typed request, returns typed response, throws typed error. Error
type is a discriminated union: `HSM_UNAVAILABLE | HSM_DETACHED | AUTH_FAIL |
CAPABILITY_DENIED | AUDIT_FULL | INVALID_ARGUMENT | WIRE_ERROR |
CHAIN_BREAK`.

#### (c) `yubihsm/blueprint` — declarative provisioning

A YAML file at repo root captures the intended device state. Example:

```yaml
version: 1
device:
  serial_pin: cred:TeeVault-YubiHSM-Serial
  min_firmware: "2.4.0"
  fips_mode: false
domains:
  1: { label: "core-sign",      purpose: "gateway-auth + release-sign" }
  2: { label: "plugin-tokens",  purpose: "provider-api-key-wrap" }
  3: { label: "logan",          purpose: "agent-specific" }
auth_keys:
  - id: 0x0002
    role: admin
    domains: [1,2,3]
    delegated_capabilities:
      [generate-asymmetric-key, put-authentication-key, delete-object,
       export-wrapped, import-wrapped, get-log-entries]
    credential_ref: cred:TeeVault-YubiHSM-Admin
  - id: 0x000A
    role: gateway-signer
    domains: [1]
    capabilities: [sign-ecdsa]
    credential_ref: cred:TeeVault-YubiHSM-SSHSigner
  - id: 0x000B
    role: plugin-sealer
    domains: [2]
    capabilities: [wrap-data, unwrap-data]
    credential_ref: cred:TeeVault-YubiHSM-DBCrypto
wrap_keys:
  - id: 0x00C8
    domains: [2]
    algorithm: aes256-ccm-wrap
    delegated_capabilities: [exportable-under-wrap, sign-ecdsa]
policies:
  audit:
    drain_every: 30s
    permanent_force_audit: true
  sessions:
    pool_size: 4
    idle_timeout: 60s
```

Three CLI verbs:

- `openclaw hsm plan` — show the ordered commands that would reconcile the
  device to the blueprint, without executing.
- `openclaw hsm apply` — execute the plan. Idempotent.
- `openclaw hsm diff` — report drift between device and blueprint.

Blueprint schema validated by `ajv` at CLI entry. PINs resolved lazily from
Credential Manager; absence causes a scoped prompt, never a silent fail.

#### (d) `yubihsm/attestation`

On every asymmetric key generation, call `signAttestationCertificate` against
Yubico's factory attestation key. Verify X.509 chain to Yubico root CA (cert
embedded in the package). Persist `attestation.json` per key id at
`~/.openclaw/hsm-attestations/<serial>/<keyId>.json`. Surface:

- `openclaw hsm verify <keyId>` — re-verifies chain offline from persisted cert.
- `openclaw hsm attestation export <keyId>` — emits PEM bundle for third-party
  verification.

#### (e) `yubihsm/audit-log`

Worker process (in-process singleton, not a plugin) that every `drain_every`
interval:

1. Opens a dedicated session with an auth key holding `get-log-entries` cap.
2. Calls `getLogEntries` for entries since last-persisted index.
3. Verifies that each new entry's `previous_digest` equals the last persisted
   entry's digest.
4. Appends to `~/.openclaw/hsm-audit/YYYY-MM.log` (JSONL, append-only, 0600).
5. On chain-break: emits `HSM_AUDIT_CHAIN_BREAK` event, halts signing, requires
   operator ack via `openclaw hsm audit reconcile` before signing resumes.

The 62-entry circular buffer means the drain interval must be tuned to
per-second command rate. Default 30s is safe under 2 signs/sec. Sustained loads
above ~2 signs/sec should drop the interval to 5s (configurable per-blueprint).

#### (f) `security-runtime-hsm` — the upstream-friendly adapter

Implements a minimal interface that could plausibly land upstream in
`packages/plugin-sdk/src/security-runtime.ts`:

```ts
export interface SecurityRuntime {
  sealSecret(
    ref: SecretRef,
    plaintext: Uint8Array,
    context: SealContext,
  ): Promise<SealedSecret>;
  unsealSecret(
    sealed: SealedSecret,
    context: SealContext,
  ): Promise<Uint8Array>;
  sign(
    keyRef: KeyRef,
    message: Uint8Array,
    context: SignContext,
  ): Promise<Signature>;
  verifyOperatorToken(token: string): Promise<OperatorIdentity>;
  attestKey(keyRef: KeyRef): Promise<X509Certificate>;
}
```

`SealContext` and `SignContext` carry `{ pluginId, purpose, domain }` — the
fields the capability + domain intersection rule uses. Two implementations:
the existing filesystem behaviour (unchanged) and
`@dancesWithClaws/security-runtime-hsm`. Operator picks via `openclaw.json`:

```json
{ "security_runtime": { "provider": "hsm", "package":
  "@dancesWithClaws/security-runtime-hsm" } }
```

Contract is upstreamable without dragging YubiHSM code into openclaw core.

#### (g) Per-plugin auth keys

`openclaw.plugin.json` gains two optional fields:

```json
{
  "id": "anthropic",
  "sealCapabilities": ["wrap-data", "unwrap-data"],
  "sealDomain": "plugin-tokens"
}
```

Plugin install (`openclaw plugin install anthropic`) triggers:

1. Resolve domain id from blueprint alias → domain-id int.
2. Mint an auth key with exactly `sealCapabilities`, single domain, no
   delegated capabilities.
3. Store its PIN via Credential Manager under a scoped label.
4. Record mapping in `hsm-provisioning.json` (non-secret metadata).

Plugin code never receives admin PIN. Capability intersection makes "malicious
plugin steals another plugin's sealed provider keys" a non-op: the plugin's
auth key has no access to other domains.

### 4.5 Data flow — provider API key at runtime

```
Install:
  openclaw plugin install anthropic
    → mint auth_key(0x00B0, domain=2, caps=[wrap-data,unwrap-data])
    → store PIN via Credential Manager label `TeeVault-Plugin-anthropic`
    → record { pluginId, authKeyId, wrapKeyId } in hsm-provisioning.json
  openclaw secret put anthropic.api_key <value>
    → open session with 0x00B0 → wrapData(0x00C8, <value>) → sealed blob
    → persist sealed blob in ~/.openclaw/sealed-secrets/anthropic.api_key.sealed

First use at agent runtime:
  agent imports anthropic provider, needs ANTHROPIC_API_KEY
    → src/secrets/resolve.ts calls HsmSecretProvider.unseal(ref)
       ↳ Scp03Session.open(0x00B0, pin)
       ↳ unwrapData(0x00C8, sealed) → plaintext
       ↳ session.close()
    → plaintext handed to provider SDK via transient `Uint8Array`
    → zeroized on provider SDK teardown
```

Disk state after install: sealed blobs only. Process memory holds plaintext for
the duration of the provider SDK's use.

## 5. Error handling and availability

| Condition | Behaviour |
|---|---|
| yubihsm-connector unreachable | Fast-fail `HSM_UNAVAILABLE`; secrets unresolvable; gateway refuses new sessions, in-flight agents continue with already-unsealed material until teardown. |
| Session pool exhausted | Bounded queue with backpressure; `hsm_session_pool_queue_depth` metric exported. |
| Audit log >50/62 | Warn and accelerate drain interval. |
| Chain break during drain | Halt signing, emit security event, require `openclaw hsm audit reconcile`. No silent recovery. |
| Device unplug | Invalidate sessions, reject in-flight signs with `HSM_DETACHED`, exponential reconnect with jitter. |
| PIN failure | Backoff: 1s, 2s, 4s, 8s, 16s, cap 60s. After 5 consecutive failures the auth key is marked `PIN_LOCKED` in-process; operator must `openclaw hsm unlock <authKeyId>` after resolving. HSM has its own internal counter; this is a software-level throttle on top. |

## 6. Lean 4 specification

### 6.1 Scope — tier B

The Lean layer mechanizes:

- SCP03 session FSM and the message-numbering invariants.
- Capability + domain intersection as a decidable predicate.
- Authorization semantics: which commands succeed in which state with which
  auth key against which target.
- Audit-log hash-chain and its tamper-evidence property.
- Blueprint-apply idempotence and convergence.

Crypto primitives (AES-CMAC, AES-CTR, KDF) are Lean opaque constants with
postulated properties (correctness and collision-resistance). Deep mechanization
of primitives is explicitly out of scope.

### 6.2 Layout

```
lean/
├─ lakefile.toml
├─ lean-toolchain                      -- pinned Lean 4 version
└─ Yubihsm/
   ├─ Algorithm.lean                   -- enums for algorithm ids, curves, wrap modes
   ├─ Capability.lean                  -- 64-bit bitmap as Finset Nat; intersection lemmas
   ├─ Domain.lean                      -- 16-bit domain set; overlap predicate
   ├─ Object.lean                      -- Object = { id, type, caps, domains, delegatedCaps }
   ├─ Scp03.lean                       -- session state, INIT/AUTH/SEC/CLOSED; step relation
   ├─ Auth.lean                        -- canAuthorize : AuthKey → Command → Object → Prop
   ├─ Command.lean                     -- inductive Command; effect : Command → Store → Store
   ├─ Store.lean                       -- finite map ObjectId → Object + next-log-entry state
   ├─ AuditLog.lean                    -- hash-chain; tamper-evidence theorem
   ├─ Blueprint.lean                   -- BlueprintSpec, apply, diff; convergence theorem
   ├─ Theorems.lean                    -- the five headline theorems
   └─ Extract.lean                     -- #eval dumps of test oracles to JSON
```

### 6.3 Headline theorems

1. `scp03_no_replay` — no two accepted responses in a single session share an
   R-MAC counter value; across sessions, counter spaces are disjoint by
   session id.
2. `cap_intersection_is_authority` — `step(s, cmd, target) = Accept` iff
   `cmd.requiredCaps ⊆ (authKey.effectiveCaps ∩ target.caps)` and
   `authKey.domains ∩ target.domains ≠ ∅` and `s = SECURE_CHANNEL`.
3. `no_capability_escalation` — the only inference rule for "auth key K exists
   with caps C" is either (a) K is the admin root, or (b) K was minted via
   `putAuthenticationKey` from a key whose delegated caps ⊇ C. Induction on
   store history shows every non-root auth key's caps are a subset of the root
   admin's delegated caps.
4. `audit_chain_tamper_evident` — any permutation, deletion, or insertion in
   the exported log (other than suffix extension) breaks the host-side verifier
   with overwhelming probability (conditional on hash collision resistance).
5. `blueprint_converges` — `apply(apply(s, b), b) = apply(s, b)` and
   `diff(apply(s, b), b) = ∅`.

### 6.4 Extraction of test oracles

`Yubihsm/Extract.lean` uses `#eval` to serialize truth tables and traces to
`lean/extracted/*.json`:

- `capability-intersection.json` — for a set of representative auth-key × target
  × command triples, whether `canAuthorize` returns true.
- `scp03-traces.json` — randomized traces with an acceptance flag per step.
- `blueprint-fixtures.json` — pairs `(storeBefore, blueprint, storeAfter)`.

TypeScript property tests replay these directly. Divergence between Lean and TS
flags a bug in one or the other.

## 7. Testing

Five layers, running in CI in order:

| Layer | Tool | Runs | Catches |
|---|---|---|---|
| T0 Wire goldens | Recorded APDUs vs `Scp03Session` | Every PR | Wire-format regressions |
| T1 Unit | Vitest | Every PR | Per-module logic bugs |
| T2 Property | fast-check + Lean-extracted oracles | Every PR | Spec-conformance drift |
| T3 Simulator integration | `@dancesWithClaws/yubihsm-sim` | Every PR | Pool/backpressure, audit drain, chain break, fault injection |
| T4 Real device | Self-hosted Windows runner + physical YubiHSM2 | Nightly + release | Firmware behaviour, attestation chain, performance budget |

Performance budget (checked in T4): sign throughput ≥ 14 ops/s ECDSA-P256,
session open < 200ms, blueprint apply on a fresh device < 5s for the reference
blueprint.

The simulator is a small Node HTTP server implementing the connector's
`/connector/api` endpoint for the subset of commands the framework uses. Its
object store enforces the Lean capability rule. It is checked against the Lean
spec by running T2 property traces against both simulator and Lean oracles.

## 8. Repository layout changes

```
packages/
├─ yubihsm/                         ← new, publishable, zero openclaw-core deps
├─ yubihsm-sim/                     ← new, dev-dep only
└─ security-runtime-hsm/            ← new, upstream-candidate
lean/                               ← new top-level
extensions/tee-vault/               ← refactored: imports @dancesWithClaws/yubihsm
docs/security/
├─ THREAT-MODEL-HSM.md              ← new; complements existing THREAT-MODEL-ATLAS.md
├─ BLUEPRINT.md                     ← new; schema + ops guide
├─ ATTESTATION.md                   ← new; chain verification + key-provenance
└─ ENROLLMENT.md                    ← new; from-unboxed walkthrough
hsm-blueprint.yaml                  ← new; example at repo root
```

No changes to `src/gateway/` public surface; `src/secrets/resolve.ts` gains an
`hsm:` scheme handler. `packages/plugin-sdk/src/security-runtime.ts` gains the
runtime-provider loader.

## 9. Phasing (by deliverable gate, not time)

Each phase has a pass/fail acceptance gate. Phases 1–3 are the critical path; 4–7 can land in any order once their prerequisites pass.

| Phase | Deliverable | Gate |
|---|---|---|
| P1 | `packages/yubihsm` + `packages/yubihsm-sim` skeletons; blueprint schema + `plan/apply/diff` CLI | T0/T1/T3 green against simulator; `openclaw hsm diff` reports zero delta after `apply` on a fresh in-memory sim |
| P2 | Lean 4 mechanization for theorems 1, 2, 5; extraction pipeline `Extract.lean → lean/extracted/*.json`; T2 wired | `lake build` succeeds; zero `sorry` in those three theorems; T2 property tests replay extracted oracles and pass |
| P3 | Lean theorems 3, 4; audit-log drain worker; attestation component | Zero `sorry` across all five theorems; audit-chain-break fault-injection test in T3 halts signing and requires reconcile; attestation CLI verifies a sim-generated cert chain |
| P4 | `security-runtime-hsm` adapter; `src/secrets/` hsm-scheme handler; per-plugin auth-key provisioning | Adversarial test in `tests/adversarial/` where a mock compromised plugin cannot unseal another plugin's sealed secret |
| P5 | T4 real-device CI on self-hosted Windows runner; performance budget gate | Nightly job green; sign throughput ≥ 14 ops/s ECDSA-P256; session open < 200ms; blueprint apply on fresh device < 5s |
| P6 | Refactor `extensions/tee-vault` to consume `@dancesWithClaws/yubihsm`; mark PKCS#11 path legacy | Existing tee-vault test suite green with new backend; PKCS#11 path reachable only with `legacy_pkcs11: true` flag |
| P7 | `THREAT-MODEL-HSM.md`, `BLUEPRINT.md`, `ATTESTATION.md`, `ENROLLMENT.md`; `mostlySecure.md` updated to point at this spec | All four docs present; cross-links validated; markdownlint passes |

## 10. Risks and mitigations

| Risk | Mitigation |
|---|---|
| SCP03 DIY bug (silent crypto error) | Lean mechanization of session FSM + replay; T0 goldens against real hardware; T2 property traces. |
| yubihsm-connector wire format changes in a firmware update | Min-firmware pin in blueprint; T4 nightly against real device catches drift; dual-test against both current and pinned connector binary. |
| Audit-log overflow under burst load | Drain interval tunable; blueprint can set `permanent_force_audit: false` for throughput-critical deployments (with explicit operator ack that it reduces audit coverage). |
| 16-session limit bottlenecks under many-plugin load | Session pool with LRU reuse; each plugin uses its own pool slot only for the duration of a sign/seal. Budget: at 73ms per P-256 sign, 16 sessions = 219 sign/s ceiling, well above practical agent rate. |
| Lean proofs stall the delivery | Theorems 1, 2, 5 are P1/P2 gate; 3, 4 slip into a P3 extension without blocking shipping the runtime. |
| Operator loses device | Documented in `ENROLLMENT.md`; recovery requires wrap-key-export backup flow; explicit scope note that dual-device backup is a follow-up spec. |

## 11. Relationship to prior work in the repo

- `mostlySecure.md` is kept as the intent-layer document. This spec is the
  authoritative architectural answer to it. `mostlySecure.md` gets a pointer at
  the top once this spec lands.
- `extensions/tee-vault/src/crypto/yubihsm.ts` (the PKCS#11 path) is kept as a
  `legacy_pkcs11: true` opt-in for operators who already have a PKCS#11
  workflow. New installs default to the native driver.
- The existing backend priority chain
  (`yubihsm → dpapi+tpm → dpapi → openssl-pbkdf2`) is preserved — the YubiHSM
  backend becomes the new native driver; the others are unchanged fallbacks
  for operators without hardware.
- `security/audit/` existing deepscan hooks gain an HSM health probe.

## 12. Open questions (deferred)

- Whether the per-plugin auth-key minting flow should require physical touch /
  confirmation via a paired YubiKey (not YubiHSM) as an out-of-band approver.
  Deferred to a threat-tier-C follow-up spec.
- Whether the sealed-secret blob format should be a standard (PKCS#7, CMS,
  custom length-prefixed) — currently proposed as a custom length-prefixed
  binary with a versioned header; decision in P1.
- Whether the simulator should be published separately or kept internal.
  Leaning toward publishing (it is independently useful to others adopting
  YubiHSM2).

## 13. Success criteria

1. Lean 4 `#check` passes for all five headline theorems; no `sorry`.
2. T0–T3 tests green on every PR without hardware attached.
3. T4 real-device suite green nightly on the self-hosted runner.
4. Running `openclaw hsm apply` on a fresh YubiHSM2 against the reference
   blueprint results in a device state that `openclaw hsm diff` reports as
   zero-delta.
5. Running `openclaw plugin install anthropic` on a provisioned device mints
   a scoped auth key visible in the device; subsequent
   `openclaw secret put anthropic.api_key` seals under the configured wrap
   key; agent startup unseals successfully; `openclaw hsm audit tail`
   shows both operations in a verified chain.
6. A compromised mock plugin (test fixture) cannot unseal another plugin's
   sealed secret — proven by a `tests/adversarial/` test case.
7. `docs/security/THREAT-MODEL-HSM.md` lands and cross-links to
   `THREAT-MODEL-ATLAS.md`.
