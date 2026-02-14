# Security

## Why this matters

Logan runs GPT-5 Nano, a cost-optimized model with weaker prompt injection resistance than larger models. He ingests content from other agents on Moltbook -- every post in his feed is a potential attack vector. If someone crafts a malicious post that tricks Logan into running arbitrary commands, the sandbox is the only thing between that attacker and the host machine, the API keys, the local network, and the Windows desktop.

The original sandbox was decent for a demo: read-only root, capabilities dropped, PID and memory limits. But it had a glaring hole. The network was set to `none`, yet `curl` was allowlisted as an executable. The bot could not reach the APIs it needed. Switching the network on would give it unrestricted internet access. No middle ground.

The two-container sidecar model fixes this. The bot gets network access, but only to a proxy in a separate container. The proxy decides which domains the bot can talk to, how fast it can transfer data, and logs every request. The bot never makes a direct outbound connection. If an attacker gains code execution inside the bot container, they can talk to three APIs at 64KB/s and nothing else. They cannot port-scan the LAN, cannot exfiltrate the workspace to an arbitrary server, cannot download additional tooling.

I keep coming back to the core problem: this is an autonomous agent running untrusted model outputs 24/7 on a machine that also has SSH keys, API credentials, and access to a home network. Each layer assumes the layer above it has already fallen. The seccomp filter assumes the attacker has code execution. The proxy assumes the attacker controls curl. The Windows Firewall rules assume the attacker has broken out of Docker entirely. No single layer is sufficient on its own. Stacked together, they make exploitation impractical for the kind of opportunistic attacks Logan is likely to face.

The gap I have not closed: a patient attacker who compromises one of the three allowlisted APIs and uses it as a covert channel. The proxy will happily forward that traffic because the domain is on the list. The rate limit caps bandwidth at 64KB/s, but a slow exfiltration of the workspace over days would work. Closing this gap requires TLS termination at the proxy and request/response content filtering -- the proxy would see plaintext API keys. I chose not to do that. Known trade-off.

## Two-container sidecar architecture

```
+------------------------------------------------------------------+
|  WINDOWS HOST                                                     |
|                                                                   |
|  +--- WSL2 (hardened) -------------------------------------------+|
|  |  /etc/wsl.conf:                                                ||
|  |    interop = false  (no cmd.exe/powershell.exe from inside)   ||
|  |    appendWindowsPath = false                                   ||
|  |    umask = 077, fmask = 077                                    ||
|  |                                                                ||
|  |  +--- Docker bridge (oc-sandbox-net, 172.30.0.0/24) ---------+||
|  |  |                                                            |||
|  |  |  +------------------+        +------------------------+   |||
|  |  |  |  BOT CONTAINER   |  HTTP  |  PROXY SIDECAR         |   |||
|  |  |  |                  | :3128  |                         |   |||
|  |  |  |  Logan agent     +------->|  Squid forward proxy    |   |||
|  |  |  |  Seccomp locked  |        |  Domain allowlist       |   |||
|  |  |  |  Non-root user   |        |  64KB/s rate limit      |   |||
|  |  |  |  Read-only root  |        |  iptables egress filter |   |||
|  |  |  |  No capabilities |        |  Full access logging    |   |||
|  |  |  +------------------+        +----------+--------------+   |||
|  |  |                                         |                  |||
|  |  +-----------------------------------------+------------------+||
|  |                                            |                   ||
|  |                              Only TCP 443 + UDP 53 out         ||
|  +----------------------------------------------------------------+|
|                                                                    |
|  Windows Firewall:                                                |
|    Block WSL2 vEthernet -> 10.0.0.0/8, 172.16.0.0/12,            |
|                            192.168.0.0/16 (no LAN access)        |
|    Allow WSL2 -> internet on TCP 443 + UDP 53 only               |
|                                                                    |
|  Credential Guard + BitLocker + TPM 2.0 (existing)               |
+------------------------------------------------------------------+
```

## How a request flows through the proxy

When Logan's heartbeat fires and he needs to post to Moltbook:

```
Logan container                  Proxy container                 Internet
      |                                |                            |
  1.  |-- CONNECT www.moltbook.com:443 -->|                         |
      |   (HTTP proxy CONNECT method)  |                            |
      |                                |                            |
  2.  |                           Squid checks:                     |
      |                           - Is .moltbook.com in             |
      |                             allowed-domains.txt? YES        |
      |                           - Is port 443? YES                |
      |                           - Rate limit exceeded? NO         |
      |                                |                            |
  3.  |                                |-- TCP SYN to port 443 ---->|
      |                                |<-- TCP SYN-ACK ------------|
      |                                |                            |
  4.  |<-- HTTP 200 Connection established --|                      |
      |                                |                            |
  5.  |====== TLS tunnel through proxy (opaque to Squid) =========>|
      |   POST /api/v1/posts                                        |
      |   Authorization: Bearer $MOLTBOOK_API_KEY                   |
      |                                |                            |
  6.  |<============= TLS response ================================|
      |   201 Created                  |                            |
      |                                |                            |
  7.  |                           Squid logs:                       |
      |                           "CONNECT www.moltbook.com:443     |
      |                            200 TCP_TUNNEL 1543 bytes"       |
```

If Logan (or an attacker controlling Logan) tries to reach an unlisted domain, Squid returns HTTP 403 and logs the denied attempt. Bypassing the proxy with `--noproxy '*'` or a direct IP fails because the bot container's only network route goes through the Docker bridge. There is no default gateway to the internet.

## Seccomp syscall filtering

The seccomp profile (`security/seccomp-sandbox.json`) starts from Docker's default for v25.0.0 (~350 syscalls allowed) and carves out 32 dangerous ones with an explicit deny block returning EPERM:

```
Denied syscalls (EPERM):

  Process manipulation        Kernel/module loading       Namespace escapes
  ----------------------      ----------------------      ------------------
  ptrace                      kexec_load                  mount
  process_vm_readv            init_module                 umount2
  process_vm_writev           finit_module                pivot_root
                              delete_module               chroot
  System modification         create_module               move_mount
  ----------------------                                  open_tree
  reboot                      Tracing/profiling           fsopen
  swapon / swapoff            ----------------------      fsconfig
  settimeofday                perf_event_open             fsmount
  adjtimex                    bpf                         fspick
  sethostname                 userfaultfd
  setdomainname               lookup_dcookie
  acct
  ioperm / iopl               Keyring
  personality                 ----------------------
  uselib                      keyctl
  nfsservctl                  request_key
                              add_key
```

We did not hand-craft the allowlist from scratch. The first version listed 144 syscalls that bash, curl, python3, git, and jq actually need. It did not work. runc could not even bind-mount `/proc/PID/ns/net` during container init because the profile was missing `socketpair`, `close_range`, `memfd_create`, and roughly 200 other calls that the container runtime needs internally before the entrypoint process starts. Start from Docker's known-good default, then subtract.

## WSL2 hardening

Docker runs inside WSL2, which runs on Windows. Three boundaries, three potential escape paths. The WSL2 layer is hardened via `/etc/wsl.conf`:

```
[interop]
enabled = false          # Cannot launch cmd.exe, powershell.exe, or any Windows binary
appendWindowsPath = false  # Windows PATH not visible inside WSL2

[automount]
options = "metadata,umask=077,fmask=077"  # Restrictive permissions on /mnt/c
```

Disabling interop is the single most important setting. By default, any process inside WSL2 can run `cmd.exe /c <anything>` and execute arbitrary commands on the Windows host. With interop disabled, a compromise that escapes Docker into WSL2 is contained there. The attacker can see the Windows filesystem at `/mnt/c` but cannot execute Windows binaries, and the umask ensures files are readable only by the owning user.

The cost: `openclaw tee credential store` and other PowerShell-based tee-vault commands will not work from inside WSL2. Run them from a Windows terminal instead. Credential management is an admin task, not something the bot does.

## Network segmentation (Windows Firewall)

The outermost ring. A PowerShell script (`security/windows-firewall-rules.ps1`) creates three Windows Firewall rules on the `vEthernet (WSL*)` interface:

```
Rule 1: Block WSL2 -> LAN
  Direction: Outbound
  Remote addresses: 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16
  Action: Block

Rule 2: Allow WSL2 -> Internet (HTTPS + DNS)
  Direction: Outbound
  Remote port: 443 (TCP), 53 (UDP)
  Action: Allow

Rule 3: Drop everything else
  (implicit Windows Firewall default-deny on the interface)
```

If an attacker escapes Docker, escapes WSL2, and lands on the Windows network stack, they still cannot reach other machines on the LAN.

## Layer summary

| Layer                        | Assumes                                      | Prevents                                                               |
| ---------------------------- | -------------------------------------------- | ---------------------------------------------------------------------- |
| Seccomp profile              | Attacker has code execution in bot container | Kernel exploitation via dangerous syscalls (ptrace, bpf, mount, kexec) |
| Read-only root + no caps     | Attacker has code execution                  | Persistent filesystem modification, privilege escalation               |
| Non-root user                | Attacker has code execution                  | Access to privileged operations, writing to system paths               |
| Proxy sidecar                | Attacker controls curl/networking            | Reaching arbitrary domains, bulk data exfiltration (64KB/s cap)        |
| Proxy iptables               | Attacker has compromised the proxy process   | Outbound connections on non-443 ports, non-DNS UDP                     |
| WSL2 interop=false           | Attacker has escaped Docker into WSL2        | Launching Windows binaries (cmd.exe, powershell.exe)                   |
| WSL2 umask 077               | Attacker has escaped Docker into WSL2        | Reading other users' files on mounted Windows drives                   |
| Windows Firewall             | Attacker has escaped WSL2 to Windows network | Lateral movement to LAN devices (RFC1918 blocked)                      |
| Credential Guard + BitLocker | Physical theft or disk imaging               | Extracting credentials from LSASS, reading encrypted disk offline      |

What a compromised bot cannot do:

- Call `mount`, `ptrace`, `bpf`, or 29 other blocked syscalls (seccomp returns EPERM)
- Reach any domain not on the allowlist (Squid returns 403)
- Bypass the proxy for direct connections (no direct egress from bot container)
- Exfiltrate data faster than 64KB/s
- Install packages (apt/dpkg binaries removed from image)
- Write to the root filesystem (read-only mount)
- Escape to Windows (WSL2 interop disabled)
- Reach other machines on the LAN (Windows Firewall blocks RFC1918 from WSL2 interface)
- Execute payloads from /tmp or /workspace (AppArmor profile, when active)

What it can still do if compromised: use the three allowlisted APIs within rate limits. That is the accepted residual risk.

## Security files

| File                                  | Purpose                                                                 |
| ------------------------------------- | ----------------------------------------------------------------------- |
| `security/seccomp-sandbox.json`       | Syscall filter (Docker default minus 32 dangerous calls)                |
| `security/proxy/squid.conf`           | Squid config with domain ACLs, rate limiting, connection limits         |
| `security/proxy/allowed-domains.txt`  | Domain allowlist (.moltbook.com, .openai.com, Cardano ecosystem APIs)   |
| `security/proxy/entrypoint.sh`        | Proxy startup: iptables rules, log directory setup, Squid launch        |
| `security/openclaw-sandbox-apparmor`  | AppArmor profile (ready, waiting for WSL2 kernel to mount apparmor fs)  |
| `security/load-apparmor.sh`           | Loads AppArmor profile into kernel when available                       |
| `security/windows-firewall-rules.ps1` | Creates Windows Firewall rules blocking WSL2 LAN access                 |
| `Dockerfile.proxy`                    | Alpine + Squid + iptables (proxy sidecar image)                         |
| `Dockerfile.sandbox`                  | Debian slim, non-root, no apt/dpkg, proxy env vars baked in             |

## Hardware-backed key management (mostlySecure)

Private keys stored as files on disk are copyable. Malware, a stolen backup, a compromised OS -- anything that reads the file has the key forever. This repo ships with a hardware-backed security stack where private keys exist only inside the YubiHSM 2 and cannot be extracted.

```
BEFORE                              AFTER

  ~/.ssh/id_rsa                      YubiHSM 2
  +---------------+                  +---------------+
  | -----BEGIN    |  cp -> attacker  |  Key Slot 1   |  "Sign this" -> signature
  | RSA PRIVATE   |  has key forever |  %%%%%%%%%%   |  "Give me key" -> denied
  | KEY-----      |                  |  (locked)     |
  +---------------+                  +---------------+
  File on disk.                      Hardware device.
  Copyable.                          Non-extractable.
```

### Stack overview

```
+------------------------------------------------------------------+
|                        YOUR WINDOWS PC                            |
|                                                                   |
|  +--------------+    +--------------+    +------------------+     |
|  |  SSH Client  |    |   OpenBao    |    |   PostgreSQL     |     |
|  |              |    |  (Key Mgmt)  |    |   + pgcrypto     |     |
|  +------+-------+    +------+-------+    +--------+---------+     |
|         |                   |                      |              |
|         |         +---------+---------+            |              |
|         |         |     PKCS#11       |            |              |
|         +-------->|     Interface     |<-----------+              |
|                   +---------+---------+                           |
|                             |                                     |
|  +-----------------------------+----------------------------+     |
|  |             YubiHSM Connector                            |     |
|  |         (localhost daemon on :12345)                      |     |
|  +-----------------------------+----------------------------+     |
|                             | USB                                 |
|                   +---------+---------+                           |
|                   |    YubiHSM 2      |                           |
|                   |  +-------------+  |                           |
|                   |  | SSH Keys    |  |                           |
|                   |  | DB Keys     |  |                           |
|                   |  | Wrap Key    |  |                           |
|                   |  +-------------+  |                           |
|                   +-------------------+                           |
|                     Always plugged in                             |
|                     USB-A Nano form factor                        |
+------------------------------------------------------------------+

                    DISASTER RECOVERY (in a safe)

                   +-------------------+
                   |  Kingston IronKey  |
                   |  Keypad 200       |
                   |  +-------------+  |
                   |  | Wrapped     |  |
                   |  | Key Blobs   |  |
                   |  | + Wrap Key  |  |
                   |  +-------------+  |
                   +-------------------+
                     FIPS 140-3 Level 3
                     Physical PIN keypad
                     Brute-force wipe
```

### Security layers

```
+-------------------------------------------------------------+
|                     SECURITY LAYERS                          |
|                                                              |
|  +--- Layer 4: Application -----------------------------+   |
|  |  SSH, PostgreSQL, OpenBao, MCP servers                |   |
|  |  Never see plaintext keys. Use PKCS#11 references.    |   |
|  +-------------------------------------------------------+   |
|  +--- Layer 3: Key management ---------------------------+   |
|  |  OpenBao (Vault fork)                                 |   |
|  |  Policies, audit logging, access control.             |   |
|  +-------------------------------------------------------+   |
|  +--- Layer 2: Hardware crypto --------------------------+   |
|  |  YubiHSM 2                                            |   |
|  |  Keys generated and used on-chip. Non-extractable.    |   |
|  +-------------------------------------------------------+   |
|  +--- Layer 1: OS hardening ----------------------------+    |
|  |  Credential Guard + BitLocker                         |   |
|  |  Isolates credentials, encrypts disk at rest.         |   |
|  +-------------------------------------------------------+   |
|  +--- Layer 0: Hardware root of trust -------------------+   |
|  |  TPM 2.0                                              |   |
|  |  Anchors boot integrity and disk encryption.          |   |
|  +-------------------------------------------------------+   |
|                                                              |
|  +--- Offline backup -----------------------------------+   |
|  |  Kingston IronKey Keypad 200                          |   |
|  |  FIPS 140-3 Level 3. Physical PIN. Brute-force wipe. |   |
|  |  Holds wrapped key blobs. Break-glass recovery only.  |   |
|  +-------------------------------------------------------+   |
+-------------------------------------------------------------+
```

### Data flow: SSH authentication

```
You type: ssh hoskinson@20.245.79.3

  SSH Client
      |
      +-- 1. Connects to remote server
      |
      +-- 2. Server sends auth challenge
      |
      +-- 3. SSH client asks PKCS#11 driver to sign challenge
      |       (references key by HSM slot ID, not a file path)
      |
      +-- 4. PKCS#11 -> yubihsm-connector -> USB -> YubiHSM 2
      |       HSM signs the challenge internally
      |       Private key NEVER enters host memory
      |
      +-- 5. Signature returned: HSM -> connector -> PKCS#11 -> SSH
      |
      +-- 6. SSH sends signature to server
              Server verifies against authorized_keys
              Session established
```

### Data flow: boot sequence

```
Power on
    |
    +-- 1. TPM unseals BitLocker -> disk decrypted
    |
    +-- 2. Windows boots -> Credential Guard active
    |
    +-- 3. You log in (Windows Hello: fingerprint + PIN)
    |       -> Credential Manager unlocked
    |
    +-- 4. yubihsm-connector starts (daemon)
    |       -> USB link to YubiHSM 2 established
    |
    +-- 5. OpenBao starts
    |       -> Startup script reads HSM PIN from Credential Manager
    |       -> Sets VAULT_HSM_PIN environment variable
    |       -> OpenBao opens PKCS#11 session (SCP03)
    |       -> OpenBao is unsealed and operational
    |
    +-- 6. ssh-agent loads PKCS#11 provider
    |       -> HSM-backed SSH ready
    |
    +-- 7. PostgreSQL starts
            -> Connects to OpenBao for encryption keys
            -> Ready to serve encrypted data

    You enter credentials ONCE (fingerprint + PIN at login).
    Everything else flows automatically.
```

### Key hierarchy (TEE Vault)

The `extensions/tee-vault` plugin manages a 3-layer key hierarchy with multiple backend support:

```
Layer 0: Platform root of trust
  +-- yubihsm:       VMK generated INSIDE YubiHSM 2 (never exported)
  |                   Wrap/unwrap via PKCS#11 -- VMK never in host memory
  +-- dpapi+tpm:      DPAPI encrypts VMK, TPM seals blob to PCR[7]
  +-- dpapi:          DPAPI alone (bound to Windows user SID)
  +-- openssl-pbkdf2: Passphrase-derived key (portable fallback)

Layer 1: Vault master key (VMK) -- 256-bit AES
  yubihsm mode:  VMK is a key object inside the HSM
  software modes: Stored encrypted at <stateDir>/tee-vault/vmk.sealed
  Held in memory only while vault is unlocked; zeroed on lock

Layer 2: Per-entry encryption keys (EEK)
  EEK = HKDF-SHA256(VMK, entry_id || version)
  Each entry encrypted with AES-256-GCM using its own EEK
  EEK zeroed from memory immediately after use
```

| Backend          | Security level | Description                                      |
| ---------------- | -------------- | ------------------------------------------------ |
| `yubihsm`        | Hardware HSM   | YubiHSM 2 via PKCS#11 -- keys never leave device |
| `dpapi+tpm`      | Platform-bound | DPAPI + TPM 2.0 sealing to PCR state             |
| `dpapi`          | User-bound     | Windows DPAPI (tied to user SID)                 |
| `openssl-pbkdf2` | Portable       | Passphrase-derived key (cross-platform fallback) |

### HSM auth key roles

The YubiHSM 2 uses separate auth keys with least-privilege capabilities:

| Auth Key ID | Label        | Capabilities                       | Used by            |
| ----------- | ------------ | ---------------------------------- | ------------------ |
| 2           | `admin`      | All (replaces default ID 1)        | Setup only         |
| 10          | `ssh-signer` | `sign-ecdsa`, `sign-eddsa`         | SSH authentication |
| 11          | `db-crypto`  | `encrypt-cbc`, `decrypt-cbc`       | PostgreSQL/OpenBao |
| 12          | `backup`     | `export-wrapped`, `import-wrapped` | IronKey DR backups |

| Object ID | Type           | Label         | Algorithm   |
| --------- | -------------- | ------------- | ----------- |
| 100       | Asymmetric key | `ssh-key`     | Ed25519     |
| 200       | Wrap key       | `backup-wrap` | AES-256-CCM |

### Threat model

| Attack vector               | Protection                                                            |
| --------------------------- | --------------------------------------------------------------------- |
| Malware reads key files     | No key files on disk -- keys exist only inside the YubiHSM 2          |
| Memory dumping (Mimikatz)   | Credential Guard isolates LSASS; HSM keys never in host memory        |
| Stolen/cloned disk          | BitLocker encryption; no plaintext keys to find                       |
| Compromised OS (root shell) | Attacker can use HSM while present, but cannot extract keys for later |
| Physical laptop theft       | BitLocker + Credential Guard + HSM auth required                      |
| Backup exfiltration         | Backups contain only wrapped blobs, useless without HSM               |
| USB sniffing                | SCP03 encrypts all HSM communication                                  |
| Insider with file access    | No files contain secrets                                              |

Not covered: live session hijacking (attacker with real-time access can use the HSM in the moment), physical theft of HSM + auth credential together, total loss of both HSM and IronKey backup.

### Disaster recovery

YubiHSM dies: unlock IronKey via physical keypad PIN, import raw wrap key into new HSM, import each wrapped key blob. All keys restored.

PC stolen: attacker faces BitLocker-encrypted disk + no HSM. Plug YubiHSM into new PC, reinstall stack, all keys intact.

IronKey lost: not critical. Create a new backup from the live HSM to a new IronKey. The old IronKey self-destructs after failed PIN attempts.

Also see [`mostlySecure.md`](../mostlySecure.md) for the full hardware security guide.
