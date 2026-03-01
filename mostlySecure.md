# Mostly Secure: A Hardware-Backed Key Management Stack for Windows

A practical guide to protecting SSH keys and sensitive data using a YubiHSM 2,
OpenBao, PostgreSQL, and a Kingston IronKey for disaster recovery.

---

## Table of Contents

1. [The Problem](#the-problem)
2. [Stack Overview](#stack-overview)
3. [Concepts](#concepts)
4. [Hardware Components](#hardware-components)
5. [Software Components](#software-components)
6. [How the Pieces Fit Together](#how-the-pieces-fit-together)
7. [Setup: Step by Step](#setup-step-by-step)
8. [Daily Workflow](#daily-workflow)
9. [Disaster Recovery](#disaster-recovery)
10. [Threat Model: What This Protects Against](#threat-model-what-this-protects-against)
11. [What This Does NOT Protect Against](#what-this-does-not-protect-against)

---

## The Problem

Private keys stored as files on disk (PEM files, .ssh/id_rsa, etc.) have a
fundamental weakness: they are copyable. Anyone or anything that can read the
file --- malware, a stolen backup, a compromised OS --- has the key forever.
Revoking access after exfiltration is impossible because the attacker has their
own copy.

The goal is to move from **secrets you protect by hiding** to **secrets that
are physically non-extractable**.

```
BEFORE                              AFTER

  ~/.ssh/id_rsa                      YubiHSM 2
  ┌─────────────┐                    ┌─────────────┐
  │ -----BEGIN   │  cp → attacker    │  Key Slot 1  │  "Sign this" → signature
  │ RSA PRIVATE  │  has key forever  │  ██████████  │  "Give me key" → denied
  │ KEY-----     │                   │  (locked)    │
  └─────────────┘                    └─────────────┘
  File on disk.                      Hardware device.
  Copyable.                          Non-extractable.
```

---

## Stack Overview

```
┌──────────────────────────────────────────────────────────────────┐
│                        YOUR WINDOWS PC                           │
│                                                                  │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────────┐   │
│  │  SSH Client   │    │   OpenBao    │    │   PostgreSQL     │   │
│  │              │    │  (Key Mgmt)  │    │   + pgcrypto     │   │
│  └──────┬───────┘    └──────┬───────┘    └────────┬─────────┘   │
│         │                   │                     │              │
│         │         ┌─────────┴─────────┐           │              │
│         │         │    PKCS#11        │           │              │
│         └────────>│    Interface      │<──────────┘              │
│                   └─────────┬─────────┘                          │
│                             │                                    │
│  ┌──────────────────────────┴──────────────────────────────┐    │
│  │                  YubiHSM Connector                       │    │
│  │              (localhost daemon on :12345)                 │    │
│  └──────────────────────────┬──────────────────────────────┘    │
│                             │ USB                                │
│                   ┌─────────┴─────────┐                          │
│                   │    YubiHSM 2      │                          │
│                   │  ┌─────────────┐  │                          │
│                   │  │ SSH Keys    │  │                          │
│                   │  │ DB Keys     │  │                          │
│                   │  │ Wrap Key    │  │                          │
│                   │  └─────────────┘  │                          │
│                   └───────────────────┘                          │
│                     Always plugged in                            │
│                     USB-A Nano form factor                       │
└──────────────────────────────────────────────────────────────────┘

                    DISASTER RECOVERY (in a safe)

                   ┌───────────────────┐
                   │  Kingston IronKey  │
                   │  Keypad 200       │
                   │  ┌─────────────┐  │
                   │  │ Wrapped     │  │
                   │  │ Key Blobs   │  │
                   │  │ + Wrap Key  │  │
                   │  └─────────────┘  │
                   └───────────────────┘
                     FIPS 140-3 Level 3
                     Physical PIN keypad
                     Brute-force wipe
```

---

## Concepts

### Hardware Security Module (HSM)

An HSM is a dedicated physical device that generates, stores, and uses
cryptographic keys. The defining property is that **private keys can never be
read out of the device**. You send data in, the HSM performs the cryptographic
operation (sign, encrypt, decrypt), and sends the result back. The key itself
stays locked inside.

Think of it like a notary who will stamp documents for you but will never hand
over their stamp.

### PKCS#11

PKCS#11 is a standard API (also called "Cryptoki") that lets software talk to
cryptographic hardware. Instead of calling OpenSSL with a key file, your
application calls PKCS#11 functions, and the PKCS#11 driver routes the
operation to the HSM.

Most software that deals with crypto supports PKCS#11: OpenSSH, OpenSSL,
PostgreSQL, Java, .NET, and more.

```
Application                 PKCS#11 Driver              Hardware
     │                           │                          │
     │── C_Sign(data) ─────────>│                          │
     │                           │── USB command ─────────>│
     │                           │                          │── signs internally
     │                           │<── signature ───────────│
     │<── signature ────────────│                          │
```

### SCP03 (Secure Channel Protocol 03)

The protocol used between the host software and the YubiHSM 2 to establish an
authenticated, encrypted session. Both sides prove they know a shared auth key
via a challenge-response handshake. All subsequent communication is encrypted
and integrity-protected, even over USB.

```
Host                                YubiHSM 2
  │                                     │
  │── CreateSession(authKeyID) ───────>│
  │        host challenge               │
  │                                     │
  │<── card challenge + cryptogram ────│
  │        mutual auth                  │
  │                                     │
  │── VerifyCryptogram ──────────────>│
  │        proves host knows key        │
  │                                     │
  │<══ Encrypted session channel ═════>│
  │   All commands encrypted + MAC'd    │
```

### Key Wrapping

Key wrapping is a way to export a key from the HSM without ever exposing the
plaintext key material. The HSM encrypts the target key using a "wrap key"
(AES-CCM), producing an opaque blob. This blob can only be decrypted and
imported by an HSM that holds the same wrap key.

```
Inside HSM:
  Private Key ──┐
                 ├── AES-CCM encrypt ──→ Wrapped Blob (opaque, encrypted)
  Wrap Key ─────┘

Wrapped Blob is safe to store on disk, USB, cloud --- it's ciphertext.
Only an HSM with the matching Wrap Key can unwrap it.
```

### Virtualization-Based Security (VBS) & Credential Guard

A Windows feature that uses hardware virtualization (Intel VT-x / AMD-V) to
create an isolated memory region that even the Windows kernel cannot access.
LSASS credentials (NTLM hashes, Kerberos tickets) are moved into this
isolated container, preventing credential dumping attacks.

```
┌─────────────────────────────────────────┐
│              Windows OS                  │
│  ┌────────────┐    ┌─────────────────┐  │
│  │ User Apps  │    │ LSASS (normal)  │  │
│  │ Kernel     │    │ Limited secrets  │  │
│  └────────────┘    └─────────────────┘  │
│          ╳ cannot access                 │
│  ┌─────────────────────────────────────┐│
│  │    VBS Isolated Container           ││
│  │  ┌──────────────────────────────┐   ││
│  │  │ Credential Guard             │   ││
│  │  │ NTLM hashes, Kerberos TGTs  │   ││
│  │  └──────────────────────────────┘   ││
│  └─────────────────────────────────────┘│
└─────────────────────────────────────────┘
  Hardware enforced: even kernel-level
  malware cannot read isolated memory.
```

---

## Hardware Components

### YubiHSM 2 ($650)

- USB-A nano form factor --- stays plugged into your PC permanently
- Stores up to 256 key objects
- Supports RSA (2048-4096), ECC (P-256, P-384, curve25519), EdDSA, AES
- 16 concurrent authenticated sessions
- Role-based access control with granular capabilities per auth key
- Wrapped key export/import for backups
- No touch required --- designed for always-on programmatic use
- IP68 rated, crush resistant, no battery

**Role in our stack**: Stores all private keys. Performs all cryptographic
operations. Keys never exist outside this device in plaintext.

### Kingston IronKey Keypad 200 ($varies)

- FIPS 140-3 Level 3 certified
- XTS-AES 256-bit hardware encryption
- Physical alphanumeric keypad --- PIN entered on-device, not through the OS
- Brute force protection --- wipes after failed attempts
- BadUSB protection --- signed firmware
- OS independent --- keypad unlock works before the host OS sees the drive

**Role in our stack**: Offline disaster recovery storage. Holds wrapped
(encrypted) key blobs exported from the HSM, plus the raw wrap key material
needed to import them into a new HSM. The IronKey's physical PIN keypad and
brute-force wipe protect these files at rest.

---

## Software Components

### YubiHSM Connector + SDK

A localhost daemon that bridges USB communication to the YubiHSM 2. Runs on
`http://127.0.0.1:12345`. The PKCS#11 driver and yubihsm-shell CLI talk to the
connector, which talks to the device over USB.

```
yubihsm-shell ──→ yubihsm-connector (:12345) ──→ USB ──→ YubiHSM 2
PKCS#11 lib   ──↗
```

### OpenBao (Open Source Key Management)

Community fork of HashiCorp Vault under MPL 2.0. Manages secrets, access
policies, and audit logging. In our stack it serves as the central broker
between applications and the HSM.

- Auto-unseals using the YubiHSM via PKCS#11 (no manual unlock after reboot)
- Stores and retrieves encryption keys for database operations
- Enforces access policies (who/what can use which keys)
- Maintains an audit log of every key operation

### PostgreSQL + pgcrypto

Open source relational database with column-level encryption support. Data is
encrypted before storage using keys managed by OpenBao (which delegates the
actual crypto to the HSM).

### Windows Credential Guard

Isolates OS credentials in a VBS container. Prevents credential dumping even
if the OS kernel is compromised. Protects the HSM auth credential stored in
Windows Credential Manager.

### BitLocker

Full-disk encryption for the Windows volume. Protects data at rest if the
physical machine is stolen. Uses TPM for seamless unlock at boot.

---

## How the Pieces Fit Together

### Layer Diagram

```
Layer 5: Applications
         SSH Client, PostgreSQL, your scripts
              │
Layer 4: Key Management
         OpenBao --- policies, audit, access control
              │
Layer 3: Crypto Interface
         PKCS#11 --- standard API to hardware
              │
Layer 2: Hardware Security
         YubiHSM 2 --- keys live here, crypto happens here
              │
Layer 1: OS Hardening
         Credential Guard + BitLocker --- protects the layers above
              │
Layer 0: Hardware Root of Trust
         TPM 2.0 --- anchors BitLocker and Credential Guard
```

### Data Flow: SSH Authentication

```
You type: ssh hoskinson@20.245.79.3

  SSH Client
      │
      ├── 1. Connects to remote server
      │
      ├── 2. Server sends auth challenge
      │
      ├── 3. SSH client asks PKCS#11 driver to sign challenge
      │       (references key by HSM slot ID, not a file path)
      │
      ├── 4. PKCS#11 → yubihsm-connector → USB → YubiHSM 2
      │       HSM signs the challenge internally
      │       Private key NEVER enters host memory
      │
      ├── 5. Signature returned: HSM → connector → PKCS#11 → SSH
      │
      └── 6. SSH sends signature to server
              Server verifies against authorized_keys
              Session established
```

### Data Flow: Storing Encrypted Data

```
You say: "Store this file securely"

  Application
      │
      ├── 1. Requests encryption key from OpenBao
      │
      ├── 2. OpenBao checks access policy
      │       (is this caller authorized for this key?)
      │
      ├── 3. OpenBao asks HSM to encrypt the data via PKCS#11
      │       (or retrieves a data encryption key wrapped by the HSM)
      │
      ├── 4. HSM performs encryption on-chip
      │       Returns ciphertext
      │
      ├── 5. Ciphertext stored in PostgreSQL
      │
      └── 6. OpenBao logs the operation (audit trail)
```

### Data Flow: Boot Sequence

```
Power on
    │
    ├── 1. TPM unseals BitLocker → disk decrypted
    │
    ├── 2. Windows boots → Credential Guard active
    │
    ├── 3. You log in (Windows Hello: fingerprint + PIN)
    │       → Credential Manager unlocked
    │
    ├── 4. yubihsm-connector starts (daemon)
    │       → USB link to YubiHSM 2 established
    │
    ├── 5. OpenBao starts
    │       → Startup script reads HSM PIN from Credential Manager
    │       → Sets VAULT_HSM_PIN environment variable
    │       → OpenBao reads PIN from env, opens PKCS#11 session (SCP03)
    │       → OpenBao is unsealed and operational
    │
    ├── 6. ssh-agent loads PKCS#11 provider
    │       → HSM-backed SSH ready
    │
    └── 7. PostgreSQL starts
            → Connects to OpenBao for encryption keys
            → Ready to serve encrypted data

    You enter credentials ONCE (fingerprint + PIN at login).
    Everything else flows automatically.
```

---

## Setup: Step by Step

### Step 1: Install YubiHSM 2 Software

Download and install from Yubico:

- yubihsm-connector (the USB daemon)
- yubihsm-shell (CLI management tool)
- yubihsm-pkcs11.dll (PKCS#11 driver)

Start the connector:

```
yubihsm-connector -d
```

### Step 2: Initialize the YubiHSM 2

Connect via yubihsm-shell and change the default auth key:

```
yubihsm> connect
yubihsm> session open 1 password    ← default auth key, ID 1
yubihsm> put authkey 0 2 "admin" 1 all all <new-password>
yubihsm> session open 2 <new-password>
yubihsm> delete 0 1 authkey          ← remove default
```

You now have a single admin auth key with your own password.

### Step 3: Create Operational Auth Keys

Create separate auth keys with limited capabilities. The `put authkey`
syntax is: `put authkey <session> <id> <label> <domains> <capabilities>
<delegated-capabilities> <password>`.

```
# Auth key for SSH signing only
yubihsm> put authkey 0 10 "ssh-signer" 1 sign-ecdsa,sign-eddsa none <ssh-auth-password>

# Auth key for encryption operations
yubihsm> put authkey 0 11 "db-crypto" 1 encrypt-cbc,decrypt-cbc none <db-auth-password>

# Auth key for wrap/unwrap (backup operations only)
yubihsm> put authkey 0 12 "backup" 1 export-wrapped,import-wrapped none <backup-auth-password>
```

Each auth key gets its own password. Store these securely --- you will need
them when configuring the applications that use each key.

### Step 4: Generate SSH Key on the HSM

```
yubihsm> generate asymmetric 0 100 "ssh-key" 1 sign-eddsa ed25519
```

The private key is generated inside the HSM. It has never existed anywhere
else.

Extract the public key for deployment:

```
yubihsm> get pubkey 0 100
```

Convert to SSH format and add to `authorized_keys` on remote hosts.

### Step 5: Configure SSH to Use the HSM

In `~/.ssh/config`:

```
Host logan
    HostName 20.245.79.3
    User hoskinson
    PKCS11Provider C:\Program Files\Yubico\YubiHSM2\bin\yubihsm_pkcs11.dll
```

Or load into ssh-agent for the session:

```
ssh-add -s "C:\Program Files\Yubico\YubiHSM2\bin\yubihsm_pkcs11.dll"
```

### Step 6: Delete the Old PEM Key

Once SSH is confirmed working through the HSM:

```
del C:\Users\charl\.ssh\logan_key.pem
```

The PEM file no longer needs to exist.

### Step 7: Install and Configure OpenBao

Install OpenBao for Windows. Configure it to auto-unseal via the YubiHSM.

**Important**: Do NOT put the HSM auth password in the config file. OpenBao
reads it from the `VAULT_HSM_PIN` environment variable instead, keeping the
secret out of disk-resident config files.

Set the environment variable at boot via a startup script that reads from
Windows Credential Manager (see Step 9 for Credential Manager setup):

```powershell
# In a startup script that runs before OpenBao (as a scheduled task or service pre-start):
$cred = Get-StoredCredential -Target "YubiHSM-OpenBao"
[System.Environment]::SetEnvironmentVariable("VAULT_HSM_PIN", $cred.GetNetworkCredential().Password, "Process")
```

OpenBao seal configuration (`openbao.hcl`):

```hcl
seal "pkcs11" {
  lib          = "C:\\Program Files\\Yubico\\YubiHSM2\\bin\\yubihsm_pkcs11.dll"
  slot         = "0"
  # PIN is read from VAULT_HSM_PIN environment variable --- not stored here
  key_label    = "openbao-unseal"
  mechanism    = "0x1085"
  # 0x1085 = CKM_AES_CBC_PAD. Vault/OpenBao uses this to encrypt its
  # master key via the HSM. The YubiHSM 2 supports this mechanism when
  # the auth key has encrypt-cbc and decrypt-cbc capabilities.
}
```

Store the HSM auth password in Windows Credential Manager so the startup
script can retrieve it without any plaintext files:

```powershell
# Run once during setup (PowerShell as Administrator):
New-StoredCredential -Target "YubiHSM-OpenBao" -UserName "openbao" -Password "<hsm-auth-password>" -Persist LocalMachine
```

This way the password is protected by Credential Guard at rest and only
enters the environment briefly when OpenBao starts.

### Step 8: Install and Configure PostgreSQL

Install PostgreSQL, enable pgcrypto:

```sql
CREATE EXTENSION pgcrypto;
```

Application-level encryption uses keys retrieved from OpenBao at runtime.
OpenBao delegates key operations to the HSM via PKCS#11.

### Step 9: Enable Windows Hardening

- **BitLocker**: Encrypt the OS volume (Settings > Privacy & Security >
  Device encryption, or via Group Policy for BitLocker with TPM)
- **Credential Guard**: Enable via Group Policy (Computer Configuration >
  Administrative Templates > System > Device Guard > Turn On Virtualization
  Based Security)

### Step 10: Create Backup on IronKey

The backup strategy uses a **wrap key** to encrypt all other keys for export.
The wrap key itself cannot be self-wrapped (that would create a circular
dependency making restore impossible). Instead, we generate the wrap key from
known raw material, store that raw material on the IronKey, and use the wrap
key to export everything else.

```
# Generate 32 random bytes for a 256-bit AES wrap key (in PowerShell):
$bytes = New-Object byte[] 32
[System.Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
[System.IO.File]::WriteAllBytes("wrap-key-raw.bin", $bytes)
```

```
# Import the raw key material into the HSM as a wrap key
# Syntax: put wrapkey <session> <id> <label> <domains> <capabilities>
#         <delegated-capabilities> <algorithm> <key-file>
yubihsm> put wrapkey 0 200 "backup-wrap" 1 export-wrapped,import-wrapped all aes256-ccm-wrap wrap-key-raw.bin
```

The `delegated-capabilities` is set to `all` so this wrap key can wrap any
object type in the HSM regardless of its capabilities.

```
# Export each key as a wrapped blob
yubihsm> get wrapped 0 200 asymmetric 100 ssh-key-backup.wrap

# Unlock IronKey via physical keypad PIN
# Copy these files to the IronKey:
#   - wrap-key-raw.bin   (raw wrap key material --- this is the critical file)
#   - ssh-key-backup.wrap (wrapped SSH key blob)
#   - (any other wrapped key blobs)
#
# Then securely delete wrap-key-raw.bin from your PC:
# PowerShell: Remove-Item wrap-key-raw.bin -Force
#
# Lock IronKey, store in safe
```

**Why this works**: The raw wrap key on the IronKey is protected by the
IronKey's FIPS 140-3 Level 3 hardware encryption and physical PIN keypad.
The wrapped blobs are useless without the raw wrap key. To restore, you
import the raw key into a new HSM, then import the wrapped blobs.

### Step 11: Update MCP Server Config

Update `.claude.json` to remove the PEM file reference. SSH connections now
go through ssh-agent with the PKCS#11 provider loaded:

```json
{
  "mcpServers": {
    "ssh": {
      "type": "stdio",
      "command": "cmd",
      "args": [
        "/c",
        "npx",
        "-y",
        "@fangjunjie/ssh-mcp-server",
        "--host",
        "20.245.79.3",
        "--port",
        "22",
        "--username",
        "hoskinson"
      ]
    }
  }
}
```

SSH auth is handled by the agent, which uses the HSM. No key path needed.

---

## Daily Workflow

```
Morning:
  1. Power on PC
  2. Log in with fingerprint + PIN (Windows Hello)
  3. Everything auto-initializes:
     - BitLocker decrypts disk
     - Credential Guard activates
     - yubihsm-connector starts
     - OpenBao unseals via HSM
     - ssh-agent loads PKCS#11
  4. You're ready. No further auth needed.

Working:
  "SSH into logan"          → ssh-agent signs via HSM, transparent
  "Store this securely"     → OpenBao encrypts via HSM, writes to PostgreSQL
  "Retrieve that file"      → OpenBao decrypts via HSM, returns plaintext
  "Run this on the server"  → MCP SSH server uses agent, HSM-backed

End of day:
  Lock PC or shut down. HSM stays plugged in.
  Sessions are destroyed. Keys remain safe in hardware.
```

---

## Disaster Recovery

### Scenario: YubiHSM 2 Dies

```
1. Buy a new YubiHSM 2
2. Unlock IronKey with physical keypad PIN
3. Connect new HSM, change default auth key (same as Step 2)
4. Create operational auth keys (same as Step 3)
5. Import the raw wrap key from IronKey:
   yubihsm> put wrapkey 0 200 "backup-wrap" 1 export-wrapped,import-wrapped all aes256-ccm-wrap wrap-key-raw.bin
6. Import each wrapped key blob:
   yubihsm> put wrapped 0 200 ssh-key-backup.wrap
7. Verify restored keys:
   yubihsm> get pubkey 0 100
   (compare output with your known SSH public key fingerprint)
8. Reconfigure connector, OpenBao, ssh-agent
9. Test SSH connection to verify end-to-end
```

The raw wrap key (`wrap-key-raw.bin`) bootstraps the restore. Because it is
imported directly (not wrapped), there is no circular dependency. Once the
wrap key is in the new HSM, all wrapped blobs can be imported normally.

### Scenario: PC is Stolen

```
Attacker has:
  ✗ BitLocker-encrypted disk (can't read without TPM + your login)
  ✗ No YubiHSM 2 (you took it, or it's nano-sized and they missed it)
  ✗ Even if they have the HSM, no auth credential (protected by
    Credential Guard, which requires your login)

You do:
  1. New PC
  2. Plug in YubiHSM 2 (or restore from IronKey backup)
  3. Reinstall stack
  4. All keys intact
```

### Scenario: IronKey Lost

```
Not critical --- it's only the backup.
Create a new backup from the live HSM to a new IronKey:
  1. Generate a new wrap key (new raw material)
  2. Import into HSM, export all keys as wrapped blobs
  3. Copy raw wrap key + wrapped blobs to new IronKey
  4. Delete raw wrap key from PC

The old IronKey's contents are:
  - PIN-protected with brute-force wipe
  - Raw wrap key + wrapped blobs, but attacker needs BOTH
    the PIN and knowledge of the file format to use them
  - IronKey self-destructs after failed PIN attempts
```

---

## Threat Model: What This Protects Against

| Attack Vector               | Protection                                                                |
| --------------------------- | ------------------------------------------------------------------------- |
| Malware reads key files     | No key files on disk                                                      |
| Memory dumping (Mimikatz)   | Credential Guard isolates LSASS; HSM keys never in host memory            |
| Stolen/cloned disk          | BitLocker encryption; no plaintext keys to find                           |
| Compromised OS (root shell) | Attacker can use HSM while present, but cannot extract keys for later use |
| Physical laptop theft       | BitLocker + Credential Guard + HSM auth required                          |
| Backup exfiltration         | Backups contain only wrapped blobs, useless without HSM                   |
| USB sniffing                | SCP03 encrypts all HSM communication                                      |
| Insider with file access    | No files contain secrets                                                  |

---

## What This Does NOT Protect Against

- **Live session hijacking**: An attacker with real-time access to your
  logged-in machine can use the HSM to sign/encrypt while they have access.
  They can't take the keys, but they can use them in the moment.

- **Physical theft of HSM + auth credential**: If someone steals the YubiHSM
  and obtains the auth password (e.g., from a compromised Credential Manager),
  they can use the keys. Mitigate by noticing the theft and generating new
  keys.

- **You lose everything**: If the YubiHSM dies and the IronKey is also lost or
  destroyed, those keys are gone permanently. There is no recovery. This is by
  design --- the same property that prevents attackers from extracting keys
  also prevents you from recovering them without proper backups.

- **Rubber hose cryptanalysis**: No amount of hardware security helps if
  someone compels you to authenticate. This is a physical security / legal
  problem, not a technical one.

---

## Summary

```
┌─────────────────────────────────────────────────────────────┐
│                     SECURITY LAYERS                          │
│                                                              │
│  ┌─── Layer 4: Application ──────────────────────────────┐  │
│  │  SSH, PostgreSQL, OpenBao                              │  │
│  │  Never see plaintext keys. Use PKCS#11 references.     │  │
│  └────────────────────────────────────────────────────────┘  │
│  ┌─── Layer 3: Key Management ───────────────────────────┐  │
│  │  OpenBao                                               │  │
│  │  Policies, audit logging, access control.              │  │
│  └────────────────────────────────────────────────────────┘  │
│  ┌─── Layer 2: Hardware Crypto ──────────────────────────┐  │
│  │  YubiHSM 2                                             │  │
│  │  Keys generated and used on-chip. Non-extractable.     │  │
│  └────────────────────────────────────────────────────────┘  │
│  ┌─── Layer 1: OS Hardening ─────────────────────────────┐  │
│  │  Credential Guard + BitLocker                          │  │
│  │  Isolates credentials, encrypts disk at rest.          │  │
│  └────────────────────────────────────────────────────────┘  │
│  ┌─── Layer 0: Hardware Root of Trust ───────────────────┐  │
│  │  TPM 2.0                                               │  │
│  │  Anchors boot integrity and disk encryption.           │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌─── Offline Backup ───────────────────────────────────┐   │
│  │  Kingston IronKey Keypad 200                          │   │
│  │  FIPS 140-3 Level 3. Physical PIN. Brute-force wipe.  │   │
│  │  Holds wrapped key blobs. Break-glass recovery only.   │   │
│  └───────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

The core principle: **private keys exist only inside the YubiHSM 2**. Every
other component in the stack exists either to use those keys (applications via
PKCS#11), to manage access to them (OpenBao), or to protect the environment
around them (Credential Guard, BitLocker). The IronKey holds encrypted backups
for when hardware fails. At no point does a plaintext private key exist on
disk, in memory, or in transit.
