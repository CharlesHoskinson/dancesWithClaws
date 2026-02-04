/**
 * tee_crypto tool: generic encrypt/decrypt/sign/verify using vault keys.
 */

import { Type } from "@sinclair/typebox";
import { createSign, createVerify } from "node:crypto";
import type { OpenClawPluginApi } from "../../../../src/plugins/types.js";
import type { CryptoOperation } from "../types.js";
import { appendAuditLog } from "../audit/tee-audit.js";
import {
  aesGcmEncrypt,
  aesGcmDecrypt,
  deriveEntryKey,
  zeroBuffer,
} from "../crypto/key-hierarchy.js";
import * as vaultEntries from "../vault/vault-entries.js";
import * as vaultLock from "../vault/vault-lock.js";
import * as vaultStore from "../vault/vault-store.js";

export function createTeeCryptoTool(api: OpenClawPluginApi, stateDir: string) {
  return {
    name: "tee_crypto",
    description:
      "Encrypt, decrypt, sign, or verify data using vault keys. " +
      "Supports AES-256-GCM encryption and RSA/ECDSA/Ed25519 signing.",
    parameters: Type.Object({
      operation: Type.Unsafe<CryptoOperation>({
        type: "string",
        enum: ["encrypt", "decrypt", "sign", "verify"],
        description: "Cryptographic operation to perform",
      }),
      label: Type.String({ description: "Label of the vault key to use" }),
      data: Type.String({ description: "Base64-encoded input data" }),
      signature: Type.Optional(
        Type.String({
          description: "Base64-encoded signature (for verify operation)",
        }),
      ),
    }),
    async execute(_id: string, params: Record<string, unknown>) {
      const operation = (
        typeof params.operation === "string" ? params.operation : ""
      ) as CryptoOperation;
      const label = (typeof params.label === "string" ? params.label : "").trim();
      const dataB64 = typeof params.data === "string" ? params.data : "";
      const signatureB64 = typeof params.signature === "string" ? params.signature : undefined;

      if (!label) {
        throw new Error("label is required");
      }
      if (!dataB64) {
        throw new Error("data is required");
      }
      if (!operation) {
        throw new Error("operation is required");
      }
      if (operation === "verify" && !signatureB64) {
        throw new Error("signature required for verify");
      }
      if (!vaultLock.isUnlocked()) {
        throw new Error("Vault is locked. Run `openclaw tee unlock` first.");
      }

      const vmk = vaultLock.getVmk();
      const envelope = await vaultStore.readVault(stateDir);
      const data = Buffer.from(dataB64, "base64");

      let result: Record<string, unknown>;

      switch (operation) {
        case "encrypt": {
          // Use the entry's EEK to encrypt arbitrary data
          const entry = envelope.entries.find((e) => e.label === label);
          if (!entry) {
            throw new Error(`Entry "${label}" not found`);
          }
          const eek = await deriveEntryKey(vmk, entry.id, entry.version);
          try {
            const { iv, ciphertext, authTag } = aesGcmEncrypt(eek, data);
            result = {
              iv: iv.toString("base64"),
              ciphertext: ciphertext.toString("base64"),
              authTag: authTag.toString("base64"),
            };
          } finally {
            zeroBuffer(eek);
          }
          break;
        }
        case "decrypt": {
          // Expects data to be JSON: { iv, ciphertext, authTag }
          let parsed: { iv: string; ciphertext: string; authTag: string };
          try {
            parsed = JSON.parse(data.toString("utf8"));
          } catch {
            throw new Error(
              "For decrypt, data must be base64-encoded JSON with iv, ciphertext, authTag",
            );
          }
          const entry = envelope.entries.find((e) => e.label === label);
          if (!entry) {
            throw new Error(`Entry "${label}" not found`);
          }
          const eek = await deriveEntryKey(vmk, entry.id, entry.version);
          try {
            const plaintext = aesGcmDecrypt(
              eek,
              Buffer.from(parsed.iv, "base64"),
              Buffer.from(parsed.ciphertext, "base64"),
              Buffer.from(parsed.authTag, "base64"),
            );
            result = { plaintext: plaintext.toString("base64") };
          } finally {
            zeroBuffer(eek);
          }
          break;
        }
        case "sign": {
          const { entry, value: privateKeyBuf } = await vaultEntries.retrieveEntry(
            envelope,
            vmk,
            label,
          );
          try {
            const privateKeyPem = privateKeyBuf.toString("utf8");
            const algorithm = entry.tags.find((t) => t.startsWith("algorithm:"))?.split(":")[1];
            const digestAlg = algorithm === "ed25519" ? undefined : "sha256";
            const signer = createSign(digestAlg ?? "sha256");
            signer.update(data);
            const sig = digestAlg
              ? signer.sign(privateKeyPem)
              : signer.sign({ key: privateKeyPem });
            result = { signature: sig.toString("base64") };
          } finally {
            privateKeyBuf.fill(0);
          }
          break;
        }
        case "verify": {
          const { entry, value: privateKeyBuf } = await vaultEntries.retrieveEntry(
            envelope,
            vmk,
            label,
          );
          try {
            // For verification we need the public key; derive from private
            const privateKeyPem = privateKeyBuf.toString("utf8");
            const algorithm = entry.tags.find((t) => t.startsWith("algorithm:"))?.split(":")[1];
            const digestAlg = algorithm === "ed25519" ? undefined : "sha256";
            const verifier = createVerify(digestAlg ?? "sha256");
            verifier.update(data);
            const valid = verifier.verify(privateKeyPem, Buffer.from(signatureB64!, "base64"));
            result = { valid };
          } finally {
            privateKeyBuf.fill(0);
          }
          break;
        }
        default:
          throw new Error(`Unknown operation: ${String(operation)}`);
      }

      await appendAuditLog(stateDir, {
        timestamp: new Date().toISOString(),
        action: `crypto_${String(operation)}`,
        entryLabel: label,
        tool: "tee_crypto",
        success: true,
      });

      return {
        content: [{ type: "text", text: JSON.stringify(result) }],
      };
    },
  };
}
