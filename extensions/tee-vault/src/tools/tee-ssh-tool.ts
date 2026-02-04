/**
 * ssh_keygen, ssh_sign, and ssh_public_key agent tools.
 */

import { Type } from "@sinclair/typebox";
import type { OpenClawPluginApi } from "../../../../src/plugins/types.js";
import type { SshKeyAlgorithm } from "../types.js";
import { appendAuditLog } from "../audit/tee-audit.js";
import * as opensslBridge from "../crypto/openssl-bridge.js";
import * as yubiHsm from "../crypto/yubihsm.js";
import * as vaultEntries from "../vault/vault-entries.js";
import * as vaultLock from "../vault/vault-lock.js";
import * as vaultStore from "../vault/vault-store.js";

export function createSshKeygenTool(api: OpenClawPluginApi, stateDir: string) {
  return {
    name: "ssh_keygen",
    description:
      "Generate an SSH key pair. The private key is stored in the vault; " +
      "the public key is returned. When using YubiHSM backend, the key can " +
      "be generated inside the HSM (never exported).",
    parameters: Type.Object({
      label: Type.String({ description: "Label for the SSH key entry" }),
      algorithm: Type.Optional(
        Type.Unsafe<SshKeyAlgorithm>({
          type: "string",
          enum: ["ed25519", "ecdsa-p256", "ecdsa-p384", "rsa-2048", "rsa-4096"],
          description: "Key algorithm (default: ed25519)",
        }),
      ),
      comment: Type.Optional(Type.String({ description: "SSH key comment" })),
      hsmResident: Type.Optional(
        Type.Boolean({
          description: "Generate key inside YubiHSM (never exported)",
        }),
      ),
      tags: Type.Optional(Type.Array(Type.String())),
    }),
    async execute(_id: string, params: Record<string, unknown>) {
      const label = (typeof params.label === "string" ? params.label : "").trim();
      const algorithm = (typeof params.algorithm === "string" ? params.algorithm : "ed25519") as SshKeyAlgorithm;
      const comment = typeof params.comment === "string" ? params.comment : undefined;
      const hsmResident = Boolean(params.hsmResident);
      const tags = Array.isArray(params.tags) ? params.tags.map(String) : [];

      if (!label) {
        throw new Error("label is required");
      }
      if (!vaultLock.isUnlocked()) {
        throw new Error("Vault is locked. Run `openclaw tee unlock` first.");
      }

      const vmk = vaultLock.getVmk();
      let envelope = await vaultStore.readVault(stateDir);
      let publicKey: string;

      if (hsmResident && vaultLock.getBackend() === "yubihsm") {
        // Generate key inside YubiHSM
        let result: { objectId: number; publicKey: Buffer };
        switch (algorithm) {
          case "ed25519":
            result = await yubiHsm.generateHsmEd25519Key(label);
            break;
          case "ecdsa-p256":
            result = await yubiHsm.generateHsmEcdsaKey(label, "P-256");
            break;
          case "ecdsa-p384":
            result = await yubiHsm.generateHsmEcdsaKey(label, "P-384");
            break;
          case "rsa-2048":
            result = await yubiHsm.generateHsmRsaKey(label, 2048);
            break;
          case "rsa-4096":
            result = await yubiHsm.generateHsmRsaKey(label, 4096);
            break;
        }
        publicKey = result.publicKey.toString("base64");
        const { envelope: updated } = await vaultEntries.addEntry(envelope, vmk, {
          label,
          type: "ssh_key",
          tags: [...tags, `algorithm:${algorithm}`, "hsm-resident"],
          value: Buffer.alloc(0),
          hsmResident: true,
          hsmObjectId: result.objectId,
        });
        envelope = updated;
      } else {
        // Generate key in software
        const keyPair = await opensslBridge.generateSshKeyPair(algorithm, comment);
        publicKey = keyPair.publicKey;
        const { envelope: updated } = await vaultEntries.addEntry(envelope, vmk, {
          label,
          type: "ssh_key",
          tags: [...tags, `algorithm:${algorithm}`],
          value: Buffer.from(keyPair.privateKey, "utf8"),
        });
        envelope = updated;
      }

      await vaultStore.writeVault(stateDir, envelope);
      await appendAuditLog(stateDir, {
        timestamp: new Date().toISOString(),
        action: "ssh_keygen",
        entryLabel: label,
        entryType: "ssh_key",
        tool: "ssh_keygen",
        success: true,
      });

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              status: "generated",
              label,
              algorithm,
              hsmResident,
              publicKey,
            }),
          },
        ],
      };
    },
  };
}

export function createSshSignTool(api: OpenClawPluginApi, stateDir: string) {
  return {
    name: "ssh_sign",
    description:
      "Sign data with a vault SSH key. The private key never leaves memory " +
      "(or never leaves the HSM for HSM-resident keys).",
    parameters: Type.Object({
      label: Type.String({ description: "Label of the SSH key to sign with" }),
      data: Type.String({ description: "Base64-encoded data to sign" }),
    }),
    async execute(_id: string, params: Record<string, unknown>) {
      const label = (typeof params.label === "string" ? params.label : "").trim();
      const dataB64 = typeof params.data === "string" ? params.data : "";

      if (!label) {
        throw new Error("label is required");
      }
      if (!dataB64) {
        throw new Error("data is required");
      }
      if (!vaultLock.isUnlocked()) {
        throw new Error("Vault is locked. Run `openclaw tee unlock` first.");
      }

      const vmk = vaultLock.getVmk();
      const envelope = await vaultStore.readVault(stateDir);
      const entry = envelope.entries.find((e) => e.label === label);
      if (!entry) {
        throw new Error(`Entry "${label}" not found`);
      }
      if (entry.type !== "ssh_key") {
        throw new Error(`Entry "${label}" is not an SSH key`);
      }

      const data = Buffer.from(dataB64, "base64");
      let signature: Buffer;

      if (entry.hsmResident && entry.hsmObjectId != null) {
        // Sign on the HSM
        const algorithm =
          entry.tags.find((t) => t.startsWith("algorithm:"))?.split(":")[1] ?? "ed25519";
        const mechanism =
          algorithm === "ed25519" ? "EDDSA" : algorithm.startsWith("ecdsa") ? "ECDSA" : "RSA_PKCS";
        signature = await yubiHsm.hsmSign(entry.hsmObjectId, data, mechanism);
      } else {
        // Decrypt the private key and sign in software
        const { value: privateKeyBuf } = await vaultEntries.retrieveEntry(envelope, vmk, label);
        try {
          const algorithm =
            (entry.tags
              .find((t) => t.startsWith("algorithm:"))
              ?.split(":")[1] as SshKeyAlgorithm) ?? "ed25519";
          signature = await opensslBridge.opensslSign(
            privateKeyBuf.toString("utf8"),
            data,
            algorithm,
          );
        } finally {
          privateKeyBuf.fill(0);
        }
      }

      await appendAuditLog(stateDir, {
        timestamp: new Date().toISOString(),
        action: "ssh_sign",
        entryLabel: label,
        entryType: "ssh_key",
        tool: "ssh_sign",
        success: true,
      });

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              label,
              signature: signature.toString("base64"),
            }),
          },
        ],
      };
    },
  };
}
