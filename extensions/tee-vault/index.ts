/**
 * TEE Vault plugin entry point.
 *
 * Registers tools, CLI commands, hooks, and audit checks.
 */

import path from "node:path";
import type { OpenClawPluginApi } from "../../src/plugins/types.js";
import { appendAuditLog } from "./src/audit/tee-audit.js";
import { registerTeeCli } from "./src/cli/tee-cli.js";
import { DEFAULT_AUTO_LOCK_TIMEOUT_MS } from "./src/constants.js";
import { createTeeCryptoTool } from "./src/tools/tee-crypto-tool.js";
import { createSshKeygenTool, createSshSignTool } from "./src/tools/tee-ssh-tool.js";
import { createVaultStoreTool, createVaultRetrieveTool } from "./src/tools/tee-vault-tool.js";
import * as vaultLock from "./src/vault/vault-lock.js";

const teeVaultPlugin = {
  id: "tee-vault",
  name: "TEE Vault",
  description: "Hardware-backed encrypted vault for secrets, SSH keys, and private keys",

  register(api: OpenClawPluginApi) {
    const stateDir = resolveStateDir(api);

    // Apply config
    const autoLock =
      typeof api.pluginConfig?.autoLockTimeoutMs === "number"
        ? api.pluginConfig.autoLockTimeoutMs
        : DEFAULT_AUTO_LOCK_TIMEOUT_MS;
    vaultLock.setAutoLockTimeout(autoLock);

    // --- Register Tools ---
    api.registerTool(
      (ctx) => {
        if (ctx.sandboxed) {
          return null;
        }
        return createVaultStoreTool(api, stateDir);
      },
      { name: "vault_store" },
    );

    api.registerTool(
      (ctx) => {
        if (ctx.sandboxed) {
          return null;
        }
        return createVaultRetrieveTool(api, stateDir);
      },
      { name: "vault_retrieve" },
    );

    api.registerTool(
      (ctx) => {
        if (ctx.sandboxed) {
          return null;
        }
        return createSshKeygenTool(api, stateDir);
      },
      { name: "ssh_keygen" },
    );

    api.registerTool(
      (ctx) => {
        if (ctx.sandboxed) {
          return null;
        }
        return createSshSignTool(api, stateDir);
      },
      { name: "ssh_sign" },
    );

    api.registerTool(
      (ctx) => {
        if (ctx.sandboxed) {
          return null;
        }
        return createTeeCryptoTool(api, stateDir);
      },
      { name: "tee_crypto" },
    );

    // --- Register CLI ---
    api.registerCli(
      ({ program }) => {
        registerTeeCli(program, stateDir);
      },
      { commands: ["tee"] },
    );

    // --- Register Hooks ---

    // session_end: auto-lock the vault
    api.on("session_end", async () => {
      if (vaultLock.isUnlocked()) {
        vaultLock.lock();
        api.logger.info("TEE vault auto-locked on session end.");
      }
    });

    // after_tool_call: append audit log for vault tools
    api.on("after_tool_call", async (event) => {
      const vaultTools = new Set([
        "vault_store",
        "vault_retrieve",
        "ssh_keygen",
        "ssh_sign",
        "tee_crypto",
      ]);
      if (vaultTools.has(event.toolName)) {
        const auditEnabled = api.pluginConfig?.auditLogEnabled !== false;
        if (auditEnabled) {
          await appendAuditLog(stateDir, {
            timestamp: new Date().toISOString(),
            action: `tool:${event.toolName}`,
            tool: event.toolName,
            success: !event.error,
            error: event.error,
          }).catch(() => {
            // Best-effort audit logging
          });
        }
      }
    });

    // --- Register Audit Checks ---
    // The audit system will call collectTeeVaultFindings via the security audit
    // deep scan. We register it as a hook on gateway_start for lazy init.
    api.on("gateway_start", async () => {
      api.logger.info(`TEE vault plugin active. State dir: ${stateDir}`);

      // Check yubihsm-connector health on startup (non-blocking)
      try {
        const { isConnectorRunning } = await import("./src/integrations/ssh-config.js");
        const running = await isConnectorRunning();
        if (running) {
          api.logger.info("yubihsm-connector is reachable.");
        }
      } catch {
        // Best-effort
      }

      // Check OpenBao health on startup (non-blocking)
      try {
        const { isOpenbaoReady } = await import("./src/integrations/openbao.js");
        const ready = await isOpenbaoReady();
        if (ready) {
          api.logger.info("OpenBao is initialized and unsealed.");
        }
      } catch {
        // Best-effort
      }
    });
  },
};

function resolveStateDir(api: OpenClawPluginApi): string {
  // Use the runtime state directory or fall back to config
  if (typeof api.pluginConfig?.stateDir === "string" && api.pluginConfig.stateDir) {
    return api.pluginConfig.stateDir;
  }
  // Default: use the workspace or agent state dir
  const configDir = api.config?.stateDir;
  if (typeof configDir === "string" && configDir) {
    return configDir;
  }
  // Fallback
  return path.join(process.env.APPDATA ?? process.env.HOME ?? ".", "openclaw");
}

export default teeVaultPlugin;
