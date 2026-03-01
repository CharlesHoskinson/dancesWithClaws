/**
 * Security audit check collectors and audit log writer.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { VAULT_DIR_NAME, VAULT_FILE_NAME, AUDIT_LOG_FILE_NAME, VMK_ROTATION_WARNING_DAYS, DEFAULT_AUTO_LOCK_TIMEOUT_MS } from "../constants.js";
import * as vaultStore from "../vault/vault-store.js";
import * as vaultLock from "../vault/vault-lock.js";
import type { AuditLogEntry } from "../types.js";

export interface SecurityAuditFinding {
  checkId: string;
  severity: "info" | "warn" | "critical";
  title: string;
  detail: string;
  remediation?: string;
}

/** Append an entry to the audit JSONL log. */
export async function appendAuditLog(
  stateDir: string,
  entry: AuditLogEntry,
): Promise<void> {
  const auditDir = path.join(stateDir, VAULT_DIR_NAME);
  await fs.mkdir(auditDir, { recursive: true });
  const logPath = path.join(auditDir, AUDIT_LOG_FILE_NAME);
  const line = JSON.stringify(entry) + "\n";
  await fs.appendFile(logPath, line, "utf8");
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
        detail: "Using openssl-pbkdf2 backend when DPAPI is available. DPAPI provides stronger platform-bound protection.",
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
        ["-NoProfile", "-Command",
          "Get-CimInstance -ClassName Win32_DeviceGuard -Namespace root\\Microsoft\\Windows\\DeviceGuard | Select-Object -ExpandProperty SecurityServicesRunning"],
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
          detail: "Backend is yubihsm but the device is not connected or the connector is not running.",
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
        detail: "Auth key ID 0001 is the factory default. An attacker with physical access could authenticate.",
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
          detail: "Backend is dpapi+tpm but TPM 2.0 is not detected. Sealing may not be platform-bound.",
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
            detail: "No YubiHSM PIN credential found. The startup script and CLI commands will not be able to auto-authenticate.",
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
          detail: "No PKCS11Provider directive found in ~/.ssh/config. HSM-backed SSH authentication is not configured.",
          remediation: "Run: openclaw tee ssh-config add --alias <host> --hostname <ip> --user <user>",
        });
      }
    } catch {
      // skip
    }
  }

  return findings;
}
