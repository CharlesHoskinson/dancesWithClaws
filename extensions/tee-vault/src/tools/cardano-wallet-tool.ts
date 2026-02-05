/**
 * Cardano wallet agent tools.
 */
import { Type } from "@sinclair/typebox";
import type { OpenClawPluginApi } from "../../../../src/plugins/types.js";
import type { CardanoNetwork, TxOutput } from "../cardano/types.js";
import { appendAuditLog } from "../audit/tee-audit.js";
import {
  createCardanoApiClient,
  fetchAddressUtxos,
  fetchProtocolParameters,
  submitTransaction,
  fetchAddressInfo,
} from "../cardano/cardano-api.js";
import {
  generateMnemonic,
  validateMnemonic,
  mnemonicToRootKey,
  deriveAccountKeys,
  derivePaymentKeyPair,
  deriveStakeKeyPair,
  publicKeyToHash,
  hashToAddress,
} from "../cardano/cardano-keys.js";
import { buildSimplePaymentTx, signTransaction } from "../cardano/cardano-tx.js";
import * as vaultEntries from "../vault/vault-entries.js";
import * as vaultLock from "../vault/vault-lock.js";
import * as vaultStore from "../vault/vault-store.js";

const WALLET_ENTRY_TYPE = "cardano_wallet" as const;

function getWalletConfig(api: OpenClawPluginApi) {
  const config = api.pluginConfig as Record<string, unknown>;
  return {
    network: (config?.cardanoNetwork as CardanoNetwork) || "preprod",
    provider: (config?.cardanoProvider as "koios" | "blockfrost") || "koios",
    apiKey: config?.blockfrostApiKey as string | undefined,
    endpoint: config?.cardanoEndpoint as string | undefined,
  };
}

export function createCardanoWalletCreateTool(api: OpenClawPluginApi, stateDir: string) {
  return {
    name: "cardano_wallet_create",
    description: "Create a new Cardano HD wallet or restore from mnemonic.",
    parameters: Type.Object({
      label: Type.String({ description: "Unique label for the wallet" }),
      mnemonic: Type.Optional(Type.String({ description: "Optional mnemonic" })),
      network: Type.Optional(
        Type.Unsafe<CardanoNetwork>({ type: "string", enum: ["mainnet", "preprod", "preview"] }),
      ),
    }),
    async execute(_id: string, params: Record<string, unknown>) {
      const label = typeof params.label === "string" ? params.label.trim() : "";
      const providedMnemonic =
        typeof params.mnemonic === "string" ? params.mnemonic.trim() : undefined;
      const config = getWalletConfig(api);
      const network = (params.network as CardanoNetwork) || config.network || "preprod";
      if (!label) throw new Error("label is required");
      if (!vaultLock.isUnlocked()) throw new Error("Vault is locked.");
      let mnemonic = providedMnemonic;
      if (mnemonic) {
        if (!validateMnemonic(mnemonic)) throw new Error("Invalid mnemonic");
      } else {
        mnemonic = generateMnemonic(24);
      }
      const rootKey = await mnemonicToRootKey(mnemonic);
      const accountKeys = deriveAccountKeys(rootKey, 0);
      const paymentKp = derivePaymentKeyPair(accountKeys, 0, 0);
      const stakeKp = deriveStakeKeyPair(accountKeys);
      const address = hashToAddress(
        publicKeyToHash(paymentKp.publicKey),
        publicKeyToHash(stakeKp.publicKey),
        network,
      );
      const vmk = vaultLock.getVmk();
      const envelope = await vaultStore.readVault(stateDir);
      const walletData = JSON.stringify({ mnemonic, network, createdAt: new Date().toISOString() });
      const { envelope: updated, entry } = await vaultEntries.addEntry(envelope, vmk, {
        label,
        type: WALLET_ENTRY_TYPE as any,
        tags: ["cardano", network],
        value: Buffer.from(walletData, "utf8"),
      });
      await vaultStore.writeVault(stateDir, updated);
      await appendAuditLog(stateDir, {
        timestamp: new Date().toISOString(),
        action: "create",
        entryLabel: label,
        entryType: WALLET_ENTRY_TYPE,
        tool: "cardano_wallet_create",
        success: true,
      });
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              status: "created",
              walletId: entry.id,
              label: entry.label,
              network,
              address,
            }),
          },
        ],
      };
    },
  };
}

export function createCardanoWalletAddressTool(api: OpenClawPluginApi, stateDir: string) {
  return {
    name: "cardano_wallet_address",
    description: "Derive addresses from a stored Cardano wallet.",
    parameters: Type.Object({
      label: Type.String({ description: "Label of the wallet" }),
      role: Type.Optional(
        Type.Unsafe<"external" | "internal" | "stake">({
          type: "string",
          enum: ["external", "internal", "stake"],
        }),
      ),
      startIndex: Type.Optional(Type.Number()),
      count: Type.Optional(Type.Number()),
    }),
    async execute(_id: string, params: Record<string, unknown>) {
      const label = typeof params.label === "string" ? params.label.trim() : "";
      const role = (params.role as "external" | "internal" | "stake") || "external";
      const startIndex = typeof params.startIndex === "number" ? params.startIndex : 0;
      const count = Math.min(typeof params.count === "number" ? params.count : 1, 20);
      if (!label) throw new Error("label is required");
      if (!vaultLock.isUnlocked()) throw new Error("Vault is locked.");
      const vmk = vaultLock.getVmk();
      const envelope = await vaultStore.readVault(stateDir);
      const entry = envelope.entries.find((e) => e.label === label && e.type === WALLET_ENTRY_TYPE);
      if (!entry) throw new Error("Wallet not found: " + label);
      const decrypted = await vaultEntries.decryptEntry(entry, vmk);
      const { mnemonic, network } = JSON.parse(decrypted.toString("utf8"));
      const rootKey = await mnemonicToRootKey(mnemonic);
      const accountKeys = deriveAccountKeys(rootKey, 0);
      const stakeHash = publicKeyToHash(deriveStakeKeyPair(accountKeys).publicKey);
      const addresses: string[] = [];
      if (role === "stake") {
        addresses.push(hashToAddress(undefined, stakeHash, network, "stake"));
      } else {
        const roleIndex = role === "external" ? 0 : 1;
        for (let i = startIndex; i < startIndex + count; i++) {
          const kp = derivePaymentKeyPair(accountKeys, roleIndex, i);
          addresses.push(hashToAddress(publicKeyToHash(kp.publicKey), stakeHash, network));
        }
      }
      await appendAuditLog(stateDir, {
        timestamp: new Date().toISOString(),
        action: "derive_address",
        entryLabel: label,
        entryType: WALLET_ENTRY_TYPE,
        tool: "cardano_wallet_address",
        success: true,
      });
      return {
        content: [{ type: "text", text: JSON.stringify({ label, network, role, addresses }) }],
      };
    },
  };
}

export function createCardanoWalletBalanceTool(api: OpenClawPluginApi, stateDir: string) {
  return {
    name: "cardano_wallet_balance",
    description: "Fetch the balance for a Cardano wallet address.",
    parameters: Type.Object({
      label: Type.String({ description: "Label of the wallet" }),
      addressIndex: Type.Optional(Type.Number()),
    }),
    async execute(_id: string, params: Record<string, unknown>) {
      const label = typeof params.label === "string" ? params.label.trim() : "";
      const addressIndex = typeof params.addressIndex === "number" ? params.addressIndex : 0;
      if (!label) throw new Error("label is required");
      if (!vaultLock.isUnlocked()) throw new Error("Vault is locked.");
      const vmk = vaultLock.getVmk();
      const envelope = await vaultStore.readVault(stateDir);
      const entry = envelope.entries.find((e) => e.label === label && e.type === WALLET_ENTRY_TYPE);
      if (!entry) throw new Error("Wallet not found: " + label);
      const decrypted = await vaultEntries.decryptEntry(entry, vmk);
      const { mnemonic, network } = JSON.parse(decrypted.toString("utf8"));
      const rootKey = await mnemonicToRootKey(mnemonic);
      const accountKeys = deriveAccountKeys(rootKey, 0);
      const paymentKp = derivePaymentKeyPair(accountKeys, 0, addressIndex);
      const stakeKp = deriveStakeKeyPair(accountKeys);
      const address = hashToAddress(
        publicKeyToHash(paymentKp.publicKey),
        publicKeyToHash(stakeKp.publicKey),
        network,
      );
      const config = getWalletConfig(api);
      const client = createCardanoApiClient({
        provider: config.provider || "koios",
        network,
        apiKey: config.apiKey,
        endpoint: config.endpoint,
      });
      const utxos = await fetchAddressUtxos(client, address);
      const info = await fetchAddressInfo(client, address);
      const totalLovelace = utxos.reduce((sum, u) => sum + BigInt(u.lovelace), 0n);
      const assets: Record<string, string> = {};
      for (const utxo of utxos) {
        for (const asset of utxo.assets || []) {
          const key = asset.policyId + "." + asset.assetName;
          assets[key] = (BigInt(assets[key] || "0") + BigInt(asset.quantity)).toString();
        }
      }
      await appendAuditLog(stateDir, {
        timestamp: new Date().toISOString(),
        action: "check_balance",
        entryLabel: label,
        entryType: WALLET_ENTRY_TYPE,
        tool: "cardano_wallet_balance",
        success: true,
      });
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              label,
              network,
              address,
              balance: {
                lovelace: totalLovelace.toString(),
                ada: (Number(totalLovelace) / 1_000_000).toFixed(6),
              },
              utxoCount: utxos.length,
              assets: Object.keys(assets).length > 0 ? assets : undefined,
              stakeAddress: info.stakeAddress,
            }),
          },
        ],
      };
    },
  };
}

export function createCardanoTxBuildTool(api: OpenClawPluginApi, stateDir: string) {
  return {
    name: "cardano_tx_build",
    description: "Build a simple ADA payment transaction.",
    parameters: Type.Object({
      label: Type.String({ description: "Wallet label" }),
      recipients: Type.Array(Type.Object({ address: Type.String(), lovelace: Type.String() })),
      addressIndex: Type.Optional(Type.Number()),
    }),
    async execute(_id: string, params: Record<string, unknown>) {
      const label = typeof params.label === "string" ? params.label.trim() : "";
      const recipients = params.recipients as Array<{ address: string; lovelace: string }>;
      const addressIndex = typeof params.addressIndex === "number" ? params.addressIndex : 0;
      if (!label) throw new Error("label is required");
      if (!recipients?.length) throw new Error("at least one recipient is required");
      if (!vaultLock.isUnlocked()) throw new Error("Vault is locked.");
      const vmk = vaultLock.getVmk();
      const envelope = await vaultStore.readVault(stateDir);
      const entry = envelope.entries.find((e) => e.label === label && e.type === WALLET_ENTRY_TYPE);
      if (!entry) throw new Error("Wallet not found: " + label);
      const decrypted = await vaultEntries.decryptEntry(entry, vmk);
      const { mnemonic, network } = JSON.parse(decrypted.toString("utf8"));
      const rootKey = await mnemonicToRootKey(mnemonic);
      const accountKeys = deriveAccountKeys(rootKey, 0);
      const stakeHash = publicKeyToHash(deriveStakeKeyPair(accountKeys).publicKey);
      const paymentKp = derivePaymentKeyPair(accountKeys, 0, addressIndex);
      const fromAddress = hashToAddress(publicKeyToHash(paymentKp.publicKey), stakeHash, network);
      const changeKp = derivePaymentKeyPair(accountKeys, 1, 0);
      const changeAddress = hashToAddress(publicKeyToHash(changeKp.publicKey), stakeHash, network);
      const config = getWalletConfig(api);
      const client = createCardanoApiClient({
        provider: config.provider || "koios",
        network,
        apiKey: config.apiKey,
        endpoint: config.endpoint,
      });
      const utxos = await fetchAddressUtxos(client, fromAddress);
      const protocolParams = await fetchProtocolParameters(client);
      const outputs: TxOutput[] = recipients.map((r) => ({
        address: r.address,
        lovelace: r.lovelace,
      }));
      const txResult = await buildSimplePaymentTx({
        utxos,
        outputs,
        changeAddress,
        protocolParams,
      });
      await appendAuditLog(stateDir, {
        timestamp: new Date().toISOString(),
        action: "build_tx",
        entryLabel: label,
        entryType: WALLET_ENTRY_TYPE,
        tool: "cardano_tx_build",
        success: true,
        details: { txHash: txResult.txHash, fee: txResult.fee },
      });
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              txHash: txResult.txHash,
              txBody: txResult.txBody,
              fee: txResult.fee,
              feeAda: (Number(txResult.fee) / 1_000_000).toFixed(6),
              inputs: txResult.selectedUtxos.length,
              outputs: outputs.length,
              hasChange: txResult.hasChange,
              changeAmount: txResult.changeAmount,
            }),
          },
        ],
      };
    },
  };
}

export function createCardanoTxSignTool(api: OpenClawPluginApi, stateDir: string) {
  return {
    name: "cardano_tx_sign",
    description: "Sign a Cardano transaction with the wallet private key.",
    parameters: Type.Object({
      label: Type.String({ description: "Wallet label" }),
      txHash: Type.String({ description: "Transaction hash (64-char hex)" }),
      addressIndex: Type.Optional(Type.Number()),
    }),
    async execute(_id: string, params: Record<string, unknown>) {
      const label = typeof params.label === "string" ? params.label.trim() : "";
      const txHash = typeof params.txHash === "string" ? params.txHash : "";
      const addressIndex = typeof params.addressIndex === "number" ? params.addressIndex : 0;
      if (!label) throw new Error("label is required");
      if (!txHash || txHash.length !== 64) throw new Error("txHash must be 64-character hex");
      if (!vaultLock.isUnlocked()) throw new Error("Vault is locked.");
      const vmk = vaultLock.getVmk();
      const envelope = await vaultStore.readVault(stateDir);
      const entry = envelope.entries.find((e) => e.label === label && e.type === WALLET_ENTRY_TYPE);
      if (!entry) throw new Error("Wallet not found: " + label);
      const decrypted = await vaultEntries.decryptEntry(entry, vmk);
      const { mnemonic } = JSON.parse(decrypted.toString("utf8"));
      const rootKey = await mnemonicToRootKey(mnemonic);
      const accountKeys = deriveAccountKeys(rootKey, 0);
      const paymentKp = derivePaymentKeyPair(accountKeys, 0, addressIndex);
      const signature = await signTransaction(txHash, paymentKp.privateKey);
      await appendAuditLog(stateDir, {
        timestamp: new Date().toISOString(),
        action: "sign_tx",
        entryLabel: label,
        entryType: WALLET_ENTRY_TYPE,
        tool: "cardano_tx_sign",
        success: true,
      });
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              txHash,
              signature: signature.toString("hex"),
              publicKey: paymentKp.publicKey.toString("hex"),
            }),
          },
        ],
      };
    },
  };
}

export function createCardanoTxSubmitTool(api: OpenClawPluginApi, stateDir: string) {
  return {
    name: "cardano_tx_submit",
    description: "Submit a signed Cardano transaction to the network.",
    parameters: Type.Object({
      label: Type.String({ description: "Wallet label" }),
      signedTx: Type.String({ description: "Signed transaction CBOR hex" }),
    }),
    async execute(_id: string, params: Record<string, unknown>) {
      const label = typeof params.label === "string" ? params.label.trim() : "";
      const signedTx = typeof params.signedTx === "string" ? params.signedTx : "";
      if (!label) throw new Error("label is required");
      if (!signedTx) throw new Error("signedTx is required");
      if (!vaultLock.isUnlocked()) throw new Error("Vault is locked.");
      const vmk = vaultLock.getVmk();
      const envelope = await vaultStore.readVault(stateDir);
      const entry = envelope.entries.find((e) => e.label === label && e.type === WALLET_ENTRY_TYPE);
      if (!entry) throw new Error("Wallet not found: " + label);
      const decrypted = await vaultEntries.decryptEntry(entry, vmk);
      const { network } = JSON.parse(decrypted.toString("utf8"));
      const config = getWalletConfig(api);
      const client = createCardanoApiClient({
        provider: config.provider || "koios",
        network,
        apiKey: config.apiKey,
        endpoint: config.endpoint,
      });
      const result = await submitTransaction(client, signedTx);
      await appendAuditLog(stateDir, {
        timestamp: new Date().toISOString(),
        action: "submit_tx",
        entryLabel: label,
        entryType: WALLET_ENTRY_TYPE,
        tool: "cardano_tx_submit",
        success: true,
        details: { txHash: result.txHash, status: result.status },
      });
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ status: result.status, txHash: result.txHash, network }),
          },
        ],
      };
    },
  };
}

export function createAllCardanoWalletTools(api: OpenClawPluginApi, stateDir: string) {
  return [
    createCardanoWalletCreateTool(api, stateDir),
    createCardanoWalletAddressTool(api, stateDir),
    createCardanoWalletBalanceTool(api, stateDir),
    createCardanoTxBuildTool(api, stateDir),
    createCardanoTxSignTool(api, stateDir),
    createCardanoTxSubmitTool(api, stateDir),
  ];
}
