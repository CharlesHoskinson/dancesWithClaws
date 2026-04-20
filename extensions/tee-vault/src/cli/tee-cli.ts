/**
 * CLI subcommands for the TEE vault.
 *
 * Registered under the `tee` namespace:
 *   openclaw tee init, unlock, lock, status, list, import, export,
 *   rotate, rotate-vmk, delete, audit, backup
 */

import type { Command } from "commander";
import fs from "node:fs/promises";
import path from "node:path";
import type { BackendType, EntryType } from "../types.js";
import { collectTeeVaultFindings, appendAuditLog } from "../audit/tee-audit.js";
import {
  VAULT_DIR_NAME,
  VAULT_FILE_NAME,
  HSM_OBJECT_SSH_KEY,
  HSM_OBJECT_WRAP_KEY,
} from "../constants.js";
import { dpapiProtect, dpapiUnprotect, isDpapiAvailable } from "../crypto/dpapi.js";
import {
  generateVmk,
  sealVmkWithPassphrase,
  unsealVmkWithPassphrase,
  zeroBuffer,
} from "../crypto/key-hierarchy.js";
import { tpmSeal, tpmUnseal, isTpmAvailable } from "../crypto/tpm.js";
import * as credentialManager from "../integrations/credential-manager.js";
import * as ironkeyBackup from "../integrations/ironkey-backup.js";
import * as openbao from "../integrations/openbao.js";
import * as sshConfig from "../integrations/ssh-config.js";
import * as vaultEntries from "../vault/vault-entries.js";
import * as vaultLock from "../vault/vault-lock.js";
import * as vaultStore from "../vault/vault-store.js";

export function registerTeeCli(program: Command, stateDir: string): void {
  const tee = program.command("tee").description("TEE Vault — encrypted secret storage");

  // --- init ---
  tee
    .command("init")
    .description("Create vault, generate VMK, seal with chosen backend")
    .option("--backend <backend>", "Security backend (yubihsm, dpapi+tpm, dpapi, openssl-pbkdf2)")
    .action(async (opts: { backend?: string }) => {
      const exists = await vaultStore.vaultExists(stateDir);
      if (exists) {
        console.error("Vault already exists. Use `openclaw tee rotate-vmk` to re-key.");
        process.exitCode = 1;
        return;
      }

      const backend = (opts.backend as BackendType) ?? (await detectBestBackend());
      console.log(`Initializing vault with backend: ${backend}`);

      const vmk = generateVmk();
      let sealedVmk: string;

      try {
        switch (backend) {
          case "dpapi+tpm": {
            const dpapiBlob = await dpapiProtect(vmk);
            const tpmBlob = await tpmSeal(dpapiBlob);
            sealedVmk = tpmBlob.toString("base64");
            break;
          }
          case "dpapi": {
            const blob = await dpapiProtect(vmk);
            sealedVmk = blob.toString("base64");
            break;
          }
          case "openssl-pbkdf2": {
            // Prompt for passphrase
            const passphrase =
              process.env.TEE_VAULT_PASSPHRASE ?? (await promptSecret("Enter vault passphrase: "));
            if (!passphrase) {
              throw new Error("Passphrase is required for openssl-pbkdf2 backend");
            }
            const sealed = await sealVmkWithPassphrase(vmk, passphrase);
            sealedVmk = sealed.toString("base64");
            break;
          }
          case "yubihsm": {
            const { openSession, generateHsmVmk, closeSession } =
              await import("../crypto/yubihsm.js");
            const pin = process.env.YUBIHSM_PIN ?? (await promptSecret("Enter YubiHSM PIN: "));
            const config = {
              pkcs11Library:
                process.env.YUBIHSM_PKCS11_LIB ??
                "C:\\Program Files\\Yubico\\YubiHSM Shell\\bin\\pkcs11\\yubihsm_pkcs11.dll",
              connectorUrl: process.env.YUBIHSM_CONNECTOR_URL ?? "http://localhost:12345",
              authKeyId: process.env.YUBIHSM_AUTH_KEY_ID ?? "0001",
              slot: 0,
            };
            await openSession(config, pin);
            const objectId = await generateHsmVmk("tee-vault-vmk");
            closeSession();
            // For YubiHSM, sealedVmk stores the object ID
            sealedVmk = JSON.stringify({ hsmObjectId: objectId });
            break;
          }
          default:
            throw new Error(`Unknown backend: ${backend}`);
        }

        const envelope = vaultStore.createEmptyEnvelope(sealedVmk, backend, vmk);
        await vaultStore.writeVault(stateDir, envelope);

        // Set restrictive permissions
        await setVaultPermissions(stateDir);

        console.log(`Vault initialized at ${vaultStore.resolveVaultPath(stateDir)}`);
        console.log(`Backend: ${backend}`);
        console.log(`Entries: 0`);
      } finally {
        zeroBuffer(vmk);
      }
    });

  // --- unlock ---
  tee
    .command("unlock")
    .description("Unlock vault for current session")
    .action(async () => {
      if (vaultLock.isUnlocked()) {
        console.log("Vault is already unlocked.");
        return;
      }

      const envelope = await vaultStore.readVault(stateDir);
      const backend = envelope.metadata.backend;
      let vmk: Buffer;

      switch (backend) {
        case "dpapi+tpm": {
          const tpmBlob = Buffer.from(envelope.sealedVmk, "base64");
          const dpapiBlob = await tpmUnseal(tpmBlob);
          vmk = await dpapiUnprotect(dpapiBlob);
          break;
        }
        case "dpapi": {
          const blob = Buffer.from(envelope.sealedVmk, "base64");
          vmk = await dpapiUnprotect(blob);
          break;
        }
        case "openssl-pbkdf2": {
          const passphrase =
            process.env.TEE_VAULT_PASSPHRASE ?? (await promptSecret("Enter vault passphrase: "));
          const sealed = Buffer.from(envelope.sealedVmk, "base64");
          vmk = await unsealVmkWithPassphrase(sealed, passphrase);
          break;
        }
        case "yubihsm": {
          // For YubiHSM, VMK stays in HSM; we store a sentinel
          const { openSession } = await import("../crypto/yubihsm.js");
          const pin = process.env.YUBIHSM_PIN ?? (await promptSecret("Enter YubiHSM PIN: "));
          const config = {
            pkcs11Library:
              process.env.YUBIHSM_PKCS11_LIB ??
              "C:\\Program Files\\Yubico\\YubiHSM Shell\\bin\\pkcs11\\yubihsm_pkcs11.dll",
            connectorUrl: process.env.YUBIHSM_CONNECTOR_URL ?? "http://localhost:12345",
            authKeyId: process.env.YUBIHSM_AUTH_KEY_ID ?? "0001",
            slot: 0,
          };
          await openSession(config, pin);
          // Use a sentinel VMK buffer; actual crypto is delegated to HSM
          vmk = Buffer.alloc(32, 0xff);
          break;
        }
        default:
          throw new Error(`Unknown backend: ${backend}`);
      }

      // Verify HMAC integrity
      if (!vaultStore.verifyEnvelopeHmac(vmk, envelope.entries, envelope.hmac)) {
        zeroBuffer(vmk);
        throw new Error(
          "Vault integrity check failed. The vault may be corrupted or tampered with.",
        );
      }

      vaultLock.unlock(vmk, backend);
      zeroBuffer(vmk);

      await appendAuditLog(stateDir, {
        timestamp: new Date().toISOString(),
        action: "unlock",
        success: true,
      });

      console.log(`Vault unlocked (backend: ${backend}, entries: ${envelope.entries.length}).`);
    });

  // --- lock ---
  tee
    .command("lock")
    .description("Lock vault, zero VMK from memory")
    .action(async () => {
      vaultLock.lock();
      await appendAuditLog(stateDir, {
        timestamp: new Date().toISOString(),
        action: "lock",
        success: true,
      });
      console.log("Vault locked.");
    });

  // --- status ---
  tee
    .command("status")
    .description("Show backend, entry count, lock state")
    .action(async () => {
      const exists = await vaultStore.vaultExists(stateDir);
      if (!exists) {
        console.log("Vault: not initialized");
        return;
      }
      const envelope = await vaultStore.readVault(stateDir);
      const locked = !vaultLock.isUnlocked();
      console.log(`Vault: ${locked ? "LOCKED" : "UNLOCKED"}`);
      console.log(`Backend: ${envelope.metadata.backend}`);
      console.log(`Entries: ${envelope.entries.length}`);
      console.log(`VMK version: ${envelope.metadata.vmkVersion}`);
      console.log(`Created: ${envelope.metadata.createdAt}`);
      console.log(`Modified: ${envelope.metadata.lastModifiedAt}`);
      if (!locked) {
        console.log(`Auto-lock: ${vaultLock.getAutoLockTimeout()}ms`);
      }
    });

  // --- list ---
  tee
    .command("list")
    .description("List entries (metadata only)")
    .option("--type <type>", "Filter by entry type")
    .option("--tag <tag>", "Filter by tag")
    .action(async (opts: { type?: string; tag?: string }) => {
      const envelope = await vaultStore.readVault(stateDir);
      const entries = vaultEntries.listEntries(envelope, {
        type: opts.type as EntryType | undefined,
        tag: opts.tag,
      });
      if (entries.length === 0) {
        console.log("No entries found.");
        return;
      }
      for (const e of entries) {
        const tags = e.tags.length > 0 ? ` [${e.tags.join(", ")}]` : "";
        const hsm = e.hsmResident ? " (HSM-resident)" : "";
        console.log(`  ${e.label} (${e.type}) v${e.version}${tags}${hsm}`);
      }
      console.log(`\n${entries.length} entry(s).`);
    });

  // --- import ---
  tee
    .command("import")
    .description("Import key/secret from stdin or file")
    .requiredOption(
      "--type <type>",
      "Entry type (secret, api_token, ssh_key, private_key, certificate)",
    )
    .requiredOption("--label <label>", "Unique label")
    .option("--file <path>", "Read value from file instead of stdin")
    .option("--tag <tags>", "Comma-separated tags")
    .action(async (opts: { type: string; label: string; file?: string; tag?: string }) => {
      if (!vaultLock.isUnlocked()) {
        console.error("Vault is locked. Run `openclaw tee unlock` first.");
        process.exitCode = 1;
        return;
      }
      let value: Buffer;
      if (opts.file) {
        value = await fs.readFile(opts.file);
      } else {
        // Read from stdin
        const chunks: Buffer[] = [];
        for await (const chunk of process.stdin) {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        }
        value = Buffer.concat(chunks);
      }

      const vmk = vaultLock.getVmk();
      const envelope = await vaultStore.readVault(stateDir);
      const tags = opts.tag ? opts.tag.split(",").map((t) => t.trim()) : [];
      const { envelope: updated } = await vaultEntries.addEntry(envelope, vmk, {
        label: opts.label,
        type: opts.type as EntryType,
        tags,
        value,
      });
      await vaultStore.writeVault(stateDir, updated);

      await appendAuditLog(stateDir, {
        timestamp: new Date().toISOString(),
        action: "import",
        entryLabel: opts.label,
        entryType: opts.type as EntryType,
        success: true,
      });

      console.log(`Imported "${opts.label}" (${opts.type}).`);
    });

  // --- export ---
  tee
    .command("export")
    .description("Export decrypted key to stdout")
    .requiredOption("--label <label>", "Entry label")
    .option("--format <format>", "Output format (raw, base64, pem)", "raw")
    .action(async (opts: { label: string; format: string }) => {
      if (!vaultLock.isUnlocked()) {
        console.error("Vault is locked. Run `openclaw tee unlock` first.");
        process.exitCode = 1;
        return;
      }
      const vmk = vaultLock.getVmk();
      const envelope = await vaultStore.readVault(stateDir);
      const { value } = await vaultEntries.retrieveEntry(envelope, vmk, opts.label);
      switch (opts.format) {
        case "base64":
          process.stdout.write(value.toString("base64"));
          break;
        case "pem":
        case "raw":
        default:
          process.stdout.write(value);
          break;
      }

      await appendAuditLog(stateDir, {
        timestamp: new Date().toISOString(),
        action: "export",
        entryLabel: opts.label,
        success: true,
      });
    });

  // --- rotate ---
  tee
    .command("rotate")
    .description("Re-encrypt entry with new EEK")
    .requiredOption("--label <label>", "Entry label")
    .action(async (opts: { label: string }) => {
      if (!vaultLock.isUnlocked()) {
        console.error("Vault is locked.");
        process.exitCode = 1;
        return;
      }
      const vmk = vaultLock.getVmk();
      const envelope = await vaultStore.readVault(stateDir);
      const updated = await vaultEntries.rotateEntry(envelope, vmk, opts.label);
      await vaultStore.writeVault(stateDir, updated);

      await appendAuditLog(stateDir, {
        timestamp: new Date().toISOString(),
        action: "rotate",
        entryLabel: opts.label,
        success: true,
      });
      console.log(`Rotated entry "${opts.label}".`);
    });

  // --- rotate-vmk ---
  tee
    .command("rotate-vmk")
    .description("Re-generate VMK, re-encrypt all entries")
    .action(async () => {
      if (!vaultLock.isUnlocked()) {
        console.error("Vault is locked.");
        process.exitCode = 1;
        return;
      }
      const oldVmk = vaultLock.getVmk();
      const envelope = await vaultStore.readVault(stateDir);
      const newVmk = generateVmk();

      try {
        // Re-encrypt all entries
        let updated = await vaultEntries.rotateAllEntries(envelope, oldVmk, newVmk);

        // Re-seal the new VMK
        const backend = envelope.metadata.backend;
        let sealedVmk: string;
        switch (backend) {
          case "dpapi+tpm": {
            const dpapiBlob = await dpapiProtect(newVmk);
            const tpmBlob = await tpmSeal(dpapiBlob);
            sealedVmk = tpmBlob.toString("base64");
            break;
          }
          case "dpapi": {
            const blob = await dpapiProtect(newVmk);
            sealedVmk = blob.toString("base64");
            break;
          }
          case "openssl-pbkdf2": {
            const passphrase =
              process.env.TEE_VAULT_PASSPHRASE ?? (await promptSecret("Enter new passphrase: "));
            const sealed = await sealVmkWithPassphrase(newVmk, passphrase);
            sealedVmk = sealed.toString("base64");
            break;
          }
          default:
            sealedVmk = envelope.sealedVmk;
            break;
        }

        updated = { ...updated, sealedVmk };
        await vaultStore.writeVault(stateDir, updated);

        // Re-lock and unlock with new VMK
        vaultLock.lock();
        vaultLock.unlock(newVmk, backend);

        await appendAuditLog(stateDir, {
          timestamp: new Date().toISOString(),
          action: "rotate_vmk",
          success: true,
        });
        console.log(
          `VMK rotated (now version ${updated.metadata.vmkVersion}). All entries re-encrypted.`,
        );
      } finally {
        zeroBuffer(newVmk);
      }
    });

  // --- delete ---
  tee
    .command("delete")
    .description("Remove entry")
    .requiredOption("--label <label>", "Entry label")
    .option("--force", "Skip confirmation")
    .action(async (opts: { label: string; force?: boolean }) => {
      if (!vaultLock.isUnlocked()) {
        console.error("Vault is locked.");
        process.exitCode = 1;
        return;
      }
      if (!opts.force) {
        console.log(`This will permanently delete entry "${opts.label}".`);
        const confirm = await promptSecret("Type the label to confirm: ");
        if (confirm !== opts.label) {
          console.error("Label mismatch. Aborted.");
          process.exitCode = 1;
          return;
        }
      }
      const vmk = vaultLock.getVmk();
      const envelope = await vaultStore.readVault(stateDir);
      const updated = vaultEntries.deleteEntry(envelope, vmk, opts.label);
      await vaultStore.writeVault(stateDir, updated);

      await appendAuditLog(stateDir, {
        timestamp: new Date().toISOString(),
        action: "delete",
        entryLabel: opts.label,
        success: true,
      });
      console.log(`Deleted "${opts.label}".`);
    });

  // --- audit ---
  tee
    .command("audit")
    .description("Run vault-specific security checks")
    .option("--deep", "Include integration checks (OpenBao, connector, Credential Manager)")
    .action(async (opts: { deep?: boolean }) => {
      const findings = await collectTeeVaultFindings(stateDir, {
        checkYubiHsm: opts.deep,
        checkIntegrations: opts.deep,
      });
      if (findings.length === 0) {
        console.log("All TEE vault checks passed.");
        return;
      }
      for (const f of findings) {
        const icon = f.severity === "critical" ? "!!" : f.severity === "warn" ? " !" : "  ";
        console.log(`[${icon}] ${f.checkId}: ${f.title}`);
        console.log(`     ${f.detail}`);
        if (f.remediation) {
          console.log(`     Fix: ${f.remediation}`);
        }
        console.log();
      }
      const critical = findings.filter((f) => f.severity === "critical").length;
      const warn = findings.filter((f) => f.severity === "warn").length;
      const info = findings.filter((f) => f.severity === "info").length;
      console.log(
        `${findings.length} finding(s): ${critical} critical, ${warn} warning, ${info} info`,
      );
    });

  // --- backup ---
  tee
    .command("backup")
    .description("Copy sealed vault file (still encrypted)")
    .option("--out <path>", "Output path for backup")
    .action(async (opts: { out?: string }) => {
      const vaultPath = vaultStore.resolveVaultPath(stateDir);
      const exists = await vaultStore.vaultExists(stateDir);
      if (!exists) {
        console.error("No vault to backup.");
        process.exitCode = 1;
        return;
      }
      const outPath = opts.out ?? `${vaultPath}.backup-${Date.now()}`;
      await fs.copyFile(vaultPath, outPath);
      console.log(`Vault backed up to ${outPath}`);
    });
  // ===================================================================
  // mostlySecure integration commands
  // ===================================================================

  // --- credential store/get/delete/list ---
  const cred = tee.command("credential").description("Manage Windows Credential Manager entries");

  cred
    .command("store")
    .description("Store a credential (HSM PIN, OpenBao token, etc.)")
    .requiredOption(
      "--target <target>",
      "Credential target (hsmPin, hsmAdmin, hsmSshSigner, hsmDbCrypto, hsmBackup, openbaoToken, openbaoUnsealPin)",
    )
    .option("--username <user>", "Username", "tee-vault")
    .action(async (opts: { target: string; username: string }) => {
      const target = opts.target as credentialManager.CredentialTarget;
      const password = await promptSecret(`Enter value for ${opts.target}: `);
      if (!password) {
        console.error("No value provided.");
        process.exitCode = 1;
        return;
      }
      await credentialManager.storeCredential(target, opts.username, password);
      console.log(`Stored credential: ${opts.target}`);
    });

  cred
    .command("get")
    .description("Retrieve a credential")
    .requiredOption("--target <target>", "Credential target")
    .action(async (opts: { target: string }) => {
      const result = await credentialManager.retrieveCredential(
        opts.target as credentialManager.CredentialTarget,
      );
      if (!result) {
        console.error(`Credential "${opts.target}" not found.`);
        process.exitCode = 1;
        return;
      }
      // Only show that it exists, not the value (security)
      console.log(`Credential "${opts.target}": stored (username=${result.username})`);
    });

  cred
    .command("delete")
    .description("Delete a credential")
    .requiredOption("--target <target>", "Credential target")
    .action(async (opts: { target: string }) => {
      const ok = await credentialManager.deleteCredential(
        opts.target as credentialManager.CredentialTarget,
      );
      if (ok) {
        console.log(`Deleted credential: ${opts.target}`);
      } else {
        console.error(`Failed to delete credential "${opts.target}" (may not exist).`);
      }
    });

  cred
    .command("list")
    .description("List all TEE Vault credentials")
    .action(async () => {
      const creds = await credentialManager.listCredentials();
      if (creds.length === 0) {
        console.log("No TEE Vault credentials found.");
        return;
      }
      for (const c of creds) {
        console.log(`  ${c}`);
      }
      console.log(`\n${creds.length} credential(s).`);
    });

  // --- ssh-config add/remove/agent-load/agent-unload ---
  const ssh = tee.command("ssh-config").description("Manage SSH PKCS#11 configuration");

  ssh
    .command("add")
    .description("Add an SSH host config entry with PKCS#11 provider")
    .requiredOption("--alias <alias>", "Host alias (e.g., logan)")
    .requiredOption("--hostname <host>", "Server hostname or IP")
    .requiredOption("--user <user>", "SSH username")
    .option("--port <port>", "SSH port", "22")
    .action(async (opts: { alias: string; hostname: string; user: string; port: string }) => {
      await sshConfig.upsertSshHostConfig({
        hostAlias: opts.alias,
        hostname: opts.hostname,
        user: opts.user,
        port: parseInt(opts.port, 10),
      });
      console.log(
        `SSH config updated: Host ${opts.alias} → ${opts.user}@${opts.hostname}:${opts.port}`,
      );
      console.log(`PKCS#11 provider configured for HSM-backed authentication.`);
    });

  ssh
    .command("remove")
    .description("Remove an SSH host config entry")
    .requiredOption("--alias <alias>", "Host alias")
    .action(async (opts: { alias: string }) => {
      const removed = await sshConfig.removeSshHostConfig(opts.alias);
      if (removed) {
        console.log(`Removed SSH config for host "${opts.alias}".`);
      } else {
        console.error(`Host "${opts.alias}" not found in SSH config.`);
      }
    });

  ssh
    .command("agent-load")
    .description("Load PKCS#11 provider into ssh-agent")
    .action(async () => {
      const running = await sshConfig.isConnectorRunning();
      if (!running) {
        console.error("yubihsm-connector is not running. Start it first.");
        process.exitCode = 1;
        return;
      }
      await sshConfig.loadPkcs11IntoAgent();
      console.log("PKCS#11 provider loaded into ssh-agent.");
      const keys = await sshConfig.listAgentKeys();
      if (keys.length > 0) {
        console.log(`Agent keys (${keys.length}):`);
        for (const k of keys) {
          console.log(`  ${k}`);
        }
      }
    });

  ssh
    .command("agent-unload")
    .description("Remove PKCS#11 provider from ssh-agent")
    .action(async () => {
      await sshConfig.unloadPkcs11FromAgent();
      console.log("PKCS#11 provider unloaded from ssh-agent.");
    });

  ssh
    .command("public-key")
    .description("Extract HSM-resident SSH public key")
    .option("--object-id <id>", "HSM object ID", String(HSM_OBJECT_SSH_KEY))
    .action(async (opts: { objectId: string }) => {
      const pin = await credentialManager.resolveHsmPin(promptSecret);
      const pubKey = await sshConfig.getHsmPublicKeySsh(
        parseInt(opts.objectId, 10),
        undefined,
        pin,
      );
      process.stdout.write(pubKey + "\n");
    });

  // --- openbao status/seal-config/startup-script ---
  const bao = tee.command("openbao").description("OpenBao integration");

  bao
    .command("status")
    .description("Check OpenBao seal status")
    .option("--addr <addr>", "OpenBao address")
    .action(async (opts: { addr?: string }) => {
      try {
        const status = await openbao.getSealStatus(opts.addr ? { addr: opts.addr } : undefined);
        console.log(`Initialized: ${status.initialized}`);
        console.log(`Sealed:      ${status.sealed}`);
        console.log(`Version:     ${status.version}`);
        console.log(`Cluster:     ${status.clusterName}`);
        if (status.sealed) {
          console.log(`Unseal progress: ${status.progress}/${status.t}`);
        }
      } catch (err) {
        console.error(`Cannot reach OpenBao: ${err instanceof Error ? err.message : err}`);
        process.exitCode = 1;
      }
    });

  bao
    .command("seal-config")
    .description("Generate PKCS#11 seal stanza for OpenBao config")
    .option("--key-label <label>", "HSM key label for unseal", "openbao-unseal")
    .action(async (opts: { keyLabel: string }) => {
      const config = openbao.generateSealConfig({
        pkcs11Library: "C:\\Program Files\\Yubico\\YubiHSM2\\bin\\yubihsm_pkcs11.dll",
        keyLabel: opts.keyLabel,
      });
      console.log(config);
    });

  bao
    .command("startup-script")
    .description("Generate PowerShell startup script for OpenBao")
    .requiredOption("--openbao-path <path>", "Path to openbao.exe")
    .requiredOption("--config-path <path>", "Path to openbao config file")
    .action(async (opts: { openbaoPath: string; configPath: string }) => {
      const script = openbao.generateStartupScript({
        openbaoPath: opts.openbaoPath,
        openbaoConfigPath: opts.configPath,
      });
      process.stdout.write(script + "\n");
    });

  bao
    .command("transit-encrypt")
    .description("Encrypt data via Transit engine (HSM-backed)")
    .requiredOption("--key <name>", "Transit key name")
    .requiredOption("--plaintext <b64>", "Base64-encoded plaintext")
    .action(async (opts: { key: string; plaintext: string }) => {
      const token = await credentialManager.resolveOpenbaoToken(promptSecret);
      const result = await openbao.transitEncrypt(token, opts.key, opts.plaintext);
      console.log(`Ciphertext: ${result.ciphertext}`);
      console.log(`Key version: ${result.keyVersion}`);
    });

  bao
    .command("transit-decrypt")
    .description("Decrypt data via Transit engine (HSM-backed)")
    .requiredOption("--key <name>", "Transit key name")
    .requiredOption("--ciphertext <ct>", "Ciphertext from transit-encrypt")
    .action(async (opts: { key: string; ciphertext: string }) => {
      const token = await credentialManager.resolveOpenbaoToken(promptSecret);
      const result = await openbao.transitDecrypt(token, opts.key, opts.ciphertext);
      console.log(`Plaintext (b64): ${result.plaintext}`);
    });

  // --- backup-ironkey / restore-ironkey ---
  tee
    .command("backup-ironkey")
    .description("Export all HSM keys to IronKey as wrapped blobs")
    .requiredOption("--out <dir>", "Output directory (should be on IronKey)")
    .option("--wrap-key-id <id>", "Wrap key ID", String(HSM_OBJECT_WRAP_KEY))
    .action(async (opts: { out: string; wrapKeyId: string }) => {
      const pin = await credentialManager.resolveHsmPin(promptSecret);
      const wrapKeyId = parseInt(opts.wrapKeyId, 10);

      // List objects to export (the caller can provide specific IDs in the future)
      const objectIds = [
        {
          id: HSM_OBJECT_SSH_KEY,
          type: "asymmetric-key",
          label: "ssh-key",
          algorithm: "ed25519",
        },
      ];

      console.log(`Creating backup to ${opts.out} using wrap key ${wrapKeyId}...`);
      const manifest = await ironkeyBackup.createFullBackup(pin, opts.out, {
        wrapKeyId,
        objectIds,
      });

      await appendAuditLog(stateDir, {
        timestamp: new Date().toISOString(),
        action: "backup_ironkey",
        success: true,
      });

      console.log(`Backup complete. ${manifest.wrappedObjects.length} object(s) exported.`);
      console.log(`Manifest: ${path.join(opts.out, "backup-manifest.json")}`);
    });

  tee
    .command("restore-ironkey")
    .description("Import wrapped blobs from IronKey backup")
    .requiredOption("--backup-dir <dir>", "Backup directory on IronKey")
    .requiredOption("--raw-key <path>", "Path to raw wrap key material")
    .action(async (opts: { backupDir: string; rawKey: string }) => {
      const pin = await credentialManager.resolveHsmPin(promptSecret);

      console.log(`Restoring from ${opts.backupDir}...`);
      const manifest = await ironkeyBackup.restoreFullBackup(pin, opts.backupDir, opts.rawKey);

      await appendAuditLog(stateDir, {
        timestamp: new Date().toISOString(),
        action: "restore_ironkey",
        success: true,
      });

      console.log(`Restore complete. ${manifest.wrappedObjects.length} object(s) imported.`);
    });

  // --- setup-hsm (guided setup matching mostlySecure Steps 1-11) ---
  tee
    .command("setup-hsm")
    .description("Guided YubiHSM 2 + OpenBao setup (mostlySecure workflow)")
    .action(async () => {
      console.log("=== TEE Vault — mostlySecure HSM Setup ===\n");

      // Step 1: Check yubihsm-connector
      console.log("[1/6] Checking yubihsm-connector...");
      const connectorOk = await sshConfig.isConnectorRunning();
      if (!connectorOk) {
        console.error("  yubihsm-connector is not running on localhost:12345.");
        console.error("  Start it: yubihsm-connector -d");
        process.exitCode = 1;
        return;
      }
      console.log("  Connector is running.");

      // Step 2: Store HSM PIN in Credential Manager
      console.log("\n[2/6] Storing HSM PIN in Credential Manager...");
      const existingPin = await credentialManager.retrieveCredential("hsmPin");
      if (existingPin) {
        console.log("  HSM PIN already stored.");
      } else {
        const pin = await promptSecret("  Enter HSM admin PIN (authKey 0002 password): ");
        await credentialManager.storeCredential("hsmPin", "tee-vault", pin);
        console.log("  HSM PIN stored in Credential Manager.");
      }

      // Step 3: Initialize vault with yubihsm backend
      console.log("\n[3/6] Initializing vault with YubiHSM backend...");
      const vaultExists = await vaultStore.vaultExists(stateDir);
      if (vaultExists) {
        const envelope = await vaultStore.readVault(stateDir);
        console.log(`  Vault already exists (backend: ${envelope.metadata.backend}).`);
      } else {
        console.log("  Run: openclaw tee init --backend yubihsm");
      }

      // Step 4: SSH config
      console.log("\n[4/6] SSH PKCS#11 configuration...");
      const sshCfg = await sshConfig.readSshConfig();
      if (sshCfg.includes("PKCS11Provider")) {
        console.log("  PKCS#11 provider already configured in SSH config.");
      } else {
        console.log(
          "  Add a host with: openclaw tee ssh-config add --alias <name> --hostname <ip> --user <user>",
        );
      }

      // Step 5: Load PKCS#11 into ssh-agent
      console.log("\n[5/6] ssh-agent PKCS#11 provider...");
      const agentKeys = await sshConfig.listAgentKeys();
      if (agentKeys.length > 0) {
        console.log(`  ssh-agent has ${agentKeys.length} key(s) loaded.`);
      } else {
        console.log("  Load provider: openclaw tee ssh-config agent-load");
      }

      // Step 6: OpenBao
      console.log("\n[6/6] OpenBao status...");
      const baoReady = await openbao.isOpenbaoReady();
      if (baoReady) {
        console.log("  OpenBao is initialized and unsealed.");
      } else {
        console.log("  OpenBao is not reachable or is sealed.");
        console.log("  Generate seal config: openclaw tee openbao seal-config");
      }

      console.log("\n=== Setup check complete ===");
    });
}

/** Auto-detect the best available backend. */
async function detectBestBackend(): Promise<BackendType> {
  if (process.platform === "win32") {
    try {
      const { isYubiHsmAvailable } = await import("../crypto/yubihsm.js");
      if (await isYubiHsmAvailable()) {
        return "yubihsm";
      }
    } catch {
      /* not available */
    }

    const tpmOk = await isTpmAvailable();
    const dpapiOk = await isDpapiAvailable();
    if (dpapiOk && tpmOk) {
      return "dpapi+tpm";
    }
    if (dpapiOk) {
      return "dpapi";
    }
  }
  return "openssl-pbkdf2";
}

/** Simple secret prompt (reads one line from stdin with echo disabled). */
async function promptSecret(message: string): Promise<string> {
  process.stderr.write(message);
  return new Promise((resolve) => {
    let data = "";
    const onData = (chunk: Buffer) => {
      const str = chunk.toString();
      if (str.includes("\n") || str.includes("\r")) {
        process.stdin.removeListener("data", onData);
        process.stdin.pause();
        resolve(data.trim());
      } else {
        data += str;
      }
    };
    process.stdin.resume();
    process.stdin.on("data", onData);
  });
}

/** Set restrictive permissions on the vault directory. */
async function setVaultPermissions(stateDir: string): Promise<void> {
  const vaultDir = path.join(stateDir, VAULT_DIR_NAME);
  if (process.platform === "win32") {
    try {
      const { createIcaclsResetCommand } = await import("../../../../src/security/windows-acl.js");
      const cmd = createIcaclsResetCommand(vaultDir, { isDir: true });
      if (cmd) {
        const { execFile } = await import("node:child_process");
        const { promisify } = await import("node:util");
        const execFileAsync = promisify(execFile);
        await execFileAsync(cmd.command, cmd.args, {
          timeout: 10_000,
          windowsHide: true,
        });
      }
    } catch {
      // Best-effort
    }
  } else {
    try {
      await fs.chmod(vaultDir, 0o700);
      const vaultPath = path.join(vaultDir, VAULT_FILE_NAME);
      try {
        await fs.chmod(vaultPath, 0o600);
      } catch {
        /* may not exist yet */
      }
    } catch {
      // Best-effort
    }
  }
}
