/**
 * Security audit check collectors and audit log writer.
 */

import fs from "node:fs/promises";
import path from "node:path";
import type { AuditLogEntry } from "../types.js";
import {
  VAULT_DIR_NAME,
  VAULT_FILE_NAME,
  AUDIT_LOG_FILE_NAME,
  VMK_ROTATION_WARNING_DAYS,
} from "../constants.js";
import * as vaultLock from "../vault/vault-lock.js";
import * as vaultStore from "../vault/vault-store.js";

export interface SecurityAuditFinding {
  checkId: string;
  severity: "info" | "warn" | "critical";
  title: string;
  detail: string;
  remediation?: string;
}

/** Append an entry to the audit JSONL log. */
export async function appendAuditLog(stateDir: string, entry: AuditLogEntry): Promise<void> {
  const auditDir = path.join(stateDir, VAULT_DIR_NAME);
  await fs.mkdir(auditDir, { recursive: true });
  const logPath = path.join(auditDir, AUDIT_LOG_FILE_NAME);
  const line = JSON.stringify(entry) + "\n";
  await fs.appendFile(logPath, line, "utf8");
}

/** Collect container hardening audit findings. */
export async function collectContainerHardeningFindings(
  configPath: string,
): Promise<SecurityAuditFinding[]> {
  const findings: SecurityAuditFinding[] = [];

  let config: Record<string, unknown>;
  try {
    const raw = await fs.readFile(configPath, "utf8");
    config = JSON.parse(raw);
  } catch {
    findings.push({
      checkId: "tee.config_unreadable",
      severity: "critical",
      title: "Cannot read openclaw.json",
      detail: `Failed to read or parse ${configPath}.`,
    });
    return findings;
  }

  // Navigate to sandbox.docker config
  const agents = config.agents as Record<string, unknown> | undefined;
  const list = (agents?.list as Array<Record<string, unknown>>) ?? [];
  const agent = list[0];
  const sandbox = agent?.sandbox as Record<string, unknown> | undefined;
  const docker = sandbox?.docker as Record<string, unknown> | undefined;

  // tee.seccomp_not_configured
  if (!docker?.seccompProfile) {
    findings.push({
      checkId: "tee.seccomp_not_configured",
      severity: "critical",
      title: "Seccomp profile not configured",
      detail:
        "No seccomp profile set in sandbox.docker config. The container can invoke any syscall.",
      remediation:
        'Add "seccompProfile": "./security/seccomp-sandbox.json" to sandbox.docker in openclaw.json.',
    });
  }

  // tee.apparmor_not_configured
  if (!docker?.apparmorProfile) {
    findings.push({
      checkId: "tee.apparmor_not_configured",
      severity: "warn",
      title: "AppArmor profile not configured",
      detail:
        "No AppArmor profile set in sandbox.docker config. File and capability restrictions are not enforced.",
      remediation: 'Add "apparmorProfile": "openclaw-sandbox" to sandbox.docker in openclaw.json.',
    });
  }

  // tee.sandbox_network_direct
  const network = docker?.network as string | undefined;
  if (network && network !== "openclaw-isolated" && network !== "none") {
    findings.push({
      checkId: "tee.sandbox_network_direct",
      severity: "critical",
      title: "Sandbox has direct network access",
      detail: `Sandbox network is "${network}". Expected "openclaw-isolated" (proxy-only) or "none".`,
      remediation:
        'Set sandbox.docker.network to "openclaw-isolated" and route traffic through the proxy sidecar.',
    });
  }

  // tee.proxy_not_running
  try {
    const { execFile } = await import("node:child_process");
    const { promisify } = await import("node:util");
    const execFileAsync = promisify(execFile);
    const { stdout } = await execFileAsync(
      "docker",
      [
        "ps",
        "--filter",
        "name=openclaw-proxy",
        "--filter",
        "status=running",
        "--format",
        "{{.Names}}",
      ],
      { timeout: 10_000, encoding: "utf8" },
    );
    if (!stdout.trim().includes("openclaw-proxy")) {
      findings.push({
        checkId: "tee.proxy_not_running",
        severity: "critical",
        title: "Proxy sidecar not running",
        detail:
          "The openclaw-proxy container is not running. Bot traffic is not being filtered or logged.",
        remediation: "Run: docker compose up -d openclaw-proxy",
      });
    }
  } catch {
    findings.push({
      checkId: "tee.proxy_not_running",
      severity: "critical",
      title: "Cannot check proxy sidecar status",
      detail: "Failed to query Docker for proxy container status.",
      remediation: "Ensure Docker is running and the proxy container is started.",
    });
  }

  // tee.proxy_allowlist_too_broad
  try {
    const configDir = path.dirname(configPath);
    const allowlistPath = path.join(configDir, "security", "proxy", "allowed-domains.txt");
    const allowlist = await fs.readFile(allowlistPath, "utf8");
    const domains = allowlist.split("\n").filter((l) => l.trim().length > 0);
    if (domains.length > 10) {
      findings.push({
        checkId: "tee.proxy_allowlist_too_broad",
        severity: "warn",
        title: "Proxy allowlist has too many domains",
        detail: `${domains.length} domains in allowlist. A broad allowlist increases exfiltration risk.`,
        remediation: "Review security/proxy/allowed-domains.txt and remove unnecessary domains.",
      });
    }
  } catch {
    // allowlist file not found; skip (proxy_not_running will catch this)
  }

  // tee.wsl_interop_enabled
  if (process.platform === "linux") {
    try {
      const wslConf = await fs.readFile("/etc/wsl.conf", "utf8");
      const interopMatch = wslConf.match(/^\s*enabled\s*=\s*(.+)$/m);
      // Check if we're in WSL and interop is not explicitly disabled
      const procVersion = await fs.readFile("/proc/version", "utf8").catch(() => "");
      if (procVersion.toLowerCase().includes("microsoft")) {
        if (!interopMatch || interopMatch[1].trim().toLowerCase() !== "false") {
          findings.push({
            checkId: "tee.wsl_interop_enabled",
            severity: "critical",
            title: "WSL2 interop is enabled",
            detail:
              "Windows executable interop is not disabled. A compromised container could escape to Windows via cmd.exe/powershell.exe.",
            remediation: "Set [interop] enabled=false in /etc/wsl.conf and restart WSL.",
          });
        }
      }
    } catch {
      // Not in WSL or can't read config; skip
    }
  }

  // tee.sandbox_runs_as_root
  if (!docker?.user) {
    findings.push({
      checkId: "tee.sandbox_runs_as_root",
      severity: "warn",
      title: "Sandbox container runs as root",
      detail:
        'No "user" set in sandbox.docker config. The container process runs as root inside the container.',
      remediation:
        'Add "user": "sandboxuser" to sandbox.docker and ensure the Dockerfile creates this user.',
    });
  }

  // tee.firewall_rules_missing
  if (process.platform === "win32") {
    try {
      const { execFile } = await import("node:child_process");
      const { promisify } = await import("node:util");
      const execFileAsync = promisify(execFile);
      const { stdout } = await execFileAsync(
        "powershell.exe",
        [
          "-NoProfile",
          "-Command",
          "Get-NetFirewallRule -DisplayName 'OpenClaw*' | Measure-Object | Select-Object -ExpandProperty Count",
        ],
        { timeout: 10_000, encoding: "utf8", windowsHide: true },
      );
      const count = parseInt(stdout.trim(), 10);
      if (isNaN(count) || count < 3) {
        findings.push({
          checkId: "tee.firewall_rules_missing",
          severity: "warn",
          title: "Windows Firewall rules not configured",
          detail: `Expected at least 3 OpenClaw firewall rules, found ${isNaN(count) ? 0 : count}.`,
          remediation: "Run security/windows-firewall-rules.ps1 as Administrator.",
        });
      }
    } catch {
      findings.push({
        checkId: "tee.firewall_rules_missing",
        severity: "warn",
        title: "Cannot verify Windows Firewall rules",
        detail: "Failed to query Windows Firewall for OpenClaw rules.",
        remediation: "Run security/windows-firewall-rules.ps1 as Administrator.",
      });
    }
  }

  return findings;
}

/** Collect TEE vault security audit findings. */
export async function collectTeeVaultFindings(
  stateDir: string,
  opts?: {
    checkYubiHsm?: boolean;
    checkIntegrations?: boolean;
    yubiHsmConfig?: { connectorUrl?: string; authKeyId?: string };
  },
): Promise<SecurityAuditFinding[]> {
  const findings: SecurityAuditFinding[] = [];
  const vaultDir = path.join(stateDir, VAULT_DIR_NAME);
  const vaultPath = path.join(vaultDir, VAULT_FILE_NAME);

  // tee.vault_not_initialized
  const exists = await vaultStore.vaultExists(stateDir);
  if (!exists) {
    findings.push({
      checkId: "tee.vault_not_initialized",
      severity: "warn",
      title: "TEE vault not initialized",
      detail: `No vault file found at ${vaultPath}. The TEE vault plugin is loaded but no vault has been created.`,
      remediation: "Run `openclaw tee init` to create a vault.",
    });
    return findings;
  }

  // tee.vault_permissions_too_open (Windows)
  if (process.platform === "win32") {
    try {
      const { inspectWindowsAcl } = await import("../../../../src/security/windows-acl.js");
      const acl = await inspectWindowsAcl(vaultDir);
      if (acl.ok && (acl.untrustedWorld.length > 0 || acl.untrustedGroup.length > 0)) {
        findings.push({
          checkId: "tee.vault_permissions_too_open",
          severity: "critical",
          title: "Vault directory has world/group access",
          detail: `${vaultDir} is accessible by untrusted principals. Vault keys and encrypted data may be exposed.`,
          remediation: `Run: icacls "${vaultDir}" /inheritance:r /grant:r "%USERNAME%:(OI)(CI)F" /grant:r "SYSTEM:(OI)(CI)F"`,
        });
      }
    } catch {
      // windows-acl not available; skip
    }
  } else {
    try {
      const stat = await fs.stat(vaultDir);
      const mode = stat.mode & 0o777;
      if (mode & 0o077) {
        findings.push({
          checkId: "tee.vault_permissions_too_open",
          severity: "critical",
          title: "Vault directory has group/world access",
          detail: `${vaultDir} has mode ${mode.toString(8)}. Only the owner should have access.`,
          remediation: `Run: chmod 700 "${vaultDir}"`,
        });
      }
    } catch {
      // stat failed
    }
  }

  // Read the vault envelope for remaining checks
  let envelope;
  try {
    envelope = await vaultStore.readVault(stateDir);
  } catch {
    findings.push({
      checkId: "tee.vault_corrupted",
      severity: "critical",
      title: "Vault file is corrupted or unreadable",
      detail: `Failed to parse ${vaultPath}.`,
    });
    return findings;
  }

  // tee.vault_backend_weak
  if (envelope.metadata.backend === "openssl-pbkdf2") {
    const hasDpapi = process.platform === "win32";
    if (hasDpapi) {
      findings.push({
        checkId: "tee.vault_backend_weak",
        severity: "warn",
        title: "Vault using portable backend on Windows",
        detail:
          "Using openssl-pbkdf2 backend when DPAPI is available. DPAPI provides stronger platform-bound protection.",
        remediation: "Re-initialize vault with `openclaw tee init --backend dpapi`.",
      });
    }
  }

  // tee.vault_vmk_age
  const created = new Date(envelope.metadata.createdAt);
  const ageDays = (Date.now() - created.getTime()) / (1000 * 60 * 60 * 24);
  if (ageDays > VMK_ROTATION_WARNING_DAYS) {
    findings.push({
      checkId: "tee.vault_vmk_age",
      severity: "info",
      title: "VMK has not been rotated recently",
      detail: `VMK was created ${Math.floor(ageDays)} days ago (version ${envelope.metadata.vmkVersion}). Consider rotating.`,
      remediation: "Run `openclaw tee rotate-vmk` to re-generate the vault master key.",
    });
  }

  // tee.vault_no_auto_lock
  if (vaultLock.getAutoLockTimeout() === 0) {
    findings.push({
      checkId: "tee.vault_no_auto_lock",
      severity: "warn",
      title: "Auto-lock is disabled",
      detail: "The vault will remain unlocked indefinitely. Set autoLockTimeoutMs > 0.",
    });
  }

  // tee.vault_audit_log_disabled
  const auditLogPath = path.join(vaultDir, AUDIT_LOG_FILE_NAME);
  try {
    await fs.access(auditLogPath);
  } catch {
    findings.push({
      checkId: "tee.vault_audit_log_disabled",
      severity: "warn",
      title: "Audit log not found",
      detail: `No audit log at ${auditLogPath}. Operations are not being recorded.`,
    });
  }

  // tee.credential_guard_disabled (Windows VBS check)
  if (process.platform === "win32") {
    try {
      const { execFile } = await import("node:child_process");
      const { promisify } = await import("node:util");
      const execFileAsync = promisify(execFile);
      const { stdout } = await execFileAsync(
        "powershell.exe",
        [
          "-NoProfile",
          "-Command",
          "Get-CimInstance -ClassName Win32_DeviceGuard -Namespace root\\Microsoft\\Windows\\DeviceGuard | Select-Object -ExpandProperty SecurityServicesRunning",
        ],
        { timeout: 10_000, encoding: "utf8", windowsHide: true },
      );
      const services = stdout.trim().split(/\s+/).map(Number);
      // 1 = Credential Guard
      if (!services.includes(1)) {
        findings.push({
          checkId: "tee.credential_guard_disabled",
          severity: "info",
          title: "Credential Guard not running",
          detail: "VBS may be enabled but Credential Guard is not active.",
        });
      }
    } catch {
      // Can't check; skip
    }
  }

  // YubiHSM-specific checks
  if (opts?.checkYubiHsm && envelope.metadata.backend === "yubihsm") {
    // tee.yubihsm_not_connected
    try {
      const { isYubiHsmAvailable } = await import("../crypto/yubihsm.js");
      const available = await isYubiHsmAvailable();
      if (!available) {
        findings.push({
          checkId: "tee.yubihsm_not_connected",
          severity: "warn",
          title: "YubiHSM 2 not detected",
          detail:
            "Backend is yubihsm but the device is not connected or the connector is not running.",
        });
      }
    } catch {
      findings.push({
        checkId: "tee.yubihsm_not_connected",
        severity: "warn",
        title: "YubiHSM 2 check failed",
        detail: "Could not verify YubiHSM connectivity. Ensure yubihsm-connector is running.",
      });
    }

    // tee.yubihsm_default_pin
    if (opts.yubiHsmConfig?.authKeyId === "0001") {
      findings.push({
        checkId: "tee.yubihsm_default_pin",
        severity: "critical",
        title: "Using default YubiHSM auth key",
        detail:
          "Auth key ID 0001 is the factory default. An attacker with physical access could authenticate.",
        remediation: "Create a new auth key on the YubiHSM and update your configuration.",
      });
    }

    // tee.yubihsm_connector_remote
    const connUrl = opts.yubiHsmConfig?.connectorUrl ?? "";
    if (connUrl && !connUrl.includes("localhost") && !connUrl.includes("127.0.0.1")) {
      findings.push({
        checkId: "tee.yubihsm_connector_remote",
        severity: "critical",
        title: "YubiHSM connector is not localhost",
        detail: `Connector URL "${connUrl}" points to a remote host. PKCS#11 traffic may be intercepted.`,
        remediation: "Run yubihsm-connector on localhost only.",
      });
    }
  }

  // tee.vault_tpm_unavailable
  if (envelope.metadata.backend === "dpapi+tpm") {
    try {
      const { isTpmAvailable } = await import("../crypto/tpm.js");
      const available = await isTpmAvailable();
      if (!available) {
        findings.push({
          checkId: "tee.vault_tpm_unavailable",
          severity: "info",
          title: "TPM not available",
          detail:
            "Backend is dpapi+tpm but TPM 2.0 is not detected. Sealing may not be platform-bound.",
        });
      }
    } catch {
      // skip
    }
  }

  // --- mostlySecure integration checks ---

  // tee.connector_not_running
  if (opts?.checkIntegrations) {
    try {
      const { isConnectorRunning } = await import("../integrations/ssh-config.js");
      const running = await isConnectorRunning();
      if (!running) {
        findings.push({
          checkId: "tee.connector_not_running",
          severity: "warn",
          title: "yubihsm-connector is not running",
          detail: "The YubiHSM connector service is not reachable on localhost:12345.",
          remediation: "Start connector: yubihsm-connector -d",
        });
      }
    } catch {
      // skip
    }

    // tee.openbao_not_ready
    try {
      const { isOpenbaoReady } = await import("../integrations/openbao.js");
      const ready = await isOpenbaoReady();
      if (!ready) {
        findings.push({
          checkId: "tee.openbao_not_ready",
          severity: "warn",
          title: "OpenBao is not reachable or is sealed",
          detail: "OpenBao is not responding on http://127.0.0.1:8200 or is in sealed state.",
          remediation: "Start OpenBao and ensure auto-unseal via PKCS#11 is configured.",
        });
      }
    } catch {
      // skip
    }

    // tee.credential_manager_empty
    if (process.platform === "win32") {
      try {
        const { listCredentials } = await import("../integrations/credential-manager.js");
        const creds = await listCredentials();
        const hasPinCred = creds.some((c) => c.includes("YubiHSM-PIN"));
        if (!hasPinCred) {
          findings.push({
            checkId: "tee.credential_manager_empty",
            severity: "warn",
            title: "HSM PIN not stored in Credential Manager",
            detail:
              "No YubiHSM PIN credential found. The startup script and CLI commands will not be able to auto-authenticate.",
            remediation: "Run: openclaw tee credential store --target hsmPin",
          });
        }
      } catch {
        // skip
      }
    }

    // tee.ssh_pkcs11_not_configured
    try {
      const { readSshConfig } = await import("../integrations/ssh-config.js");
      const config = await readSshConfig();
      if (!config.includes("PKCS11Provider")) {
        findings.push({
          checkId: "tee.ssh_pkcs11_not_configured",
          severity: "info",
          title: "SSH config has no PKCS#11 provider",
          detail:
            "No PKCS11Provider directive found in ~/.ssh/config. HSM-backed SSH authentication is not configured.",
          remediation:
            "Run: openclaw tee ssh-config add --alias <host> --hostname <ip> --user <user>",
        });
      }
    } catch {
      // skip
    }
  }

  return findings;
}
