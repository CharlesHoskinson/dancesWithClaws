/**
 * OpenBao (HashiCorp Vault fork) integration.
 *
 * OpenBao serves as the central key management broker between applications
 * and the YubiHSM 2. From mostlySecure.md:
 *   - Auto-unseals using the YubiHSM via PKCS#11
 *   - Stores and retrieves encryption keys for database operations
 *   - Enforces access policies
 *   - Maintains an audit log of every key operation
 *
 * This module communicates with OpenBao's HTTP API to manage secrets
 * and transit encryption via the HSM.
 */

import { request } from "node:http";
import { request as httpsRequest } from "node:https";

const DEFAULT_ADDR = "http://127.0.0.1:8200";
const DEFAULT_API_VERSION = "v1";
const TIMEOUT_MS = 10_000;

export interface OpenbaoConfig {
  addr: string;
  apiVersion: string;
  namespace?: string;
  caCert?: string;
}

export interface OpenbaoSealStatus {
  sealed: boolean;
  initialized: boolean;
  clusterName: string;
  version: string;
  n: number;
  t: number;
  progress: number;
}

export interface OpenbaoHealthResponse {
  initialized: boolean;
  sealed: boolean;
  standby: boolean;
  serverTimeUtc: number;
  version: string;
}

export interface TransitEncryptResponse {
  ciphertext: string;
  keyVersion: number;
}

export interface TransitDecryptResponse {
  plaintext: string; // base64-encoded
}

function resolveAddr(config?: Partial<OpenbaoConfig>): string {
  return config?.addr ?? process.env.VAULT_ADDR ?? process.env.BAO_ADDR ?? DEFAULT_ADDR;
}

/** Make an HTTP request to the OpenBao API. */
async function baoRequest(
  method: string,
  path: string,
  token: string,
  config?: Partial<OpenbaoConfig>,
  body?: unknown,
): Promise<{ status: number; data: unknown }> {
  const addr = resolveAddr(config);
  const apiVersion = config?.apiVersion ?? DEFAULT_API_VERSION;
  const url = new URL(`/${apiVersion}/${path}`, addr);
  const isHttps = url.protocol === "https:";
  const reqFn = isHttps ? httpsRequest : request;

  const bodyStr = body ? JSON.stringify(body) : undefined;

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("OpenBao request timed out")), TIMEOUT_MS);

    const req = reqFn(
      url,
      {
        method,
        headers: {
          "X-Vault-Token": token,
          "Content-Type": "application/json",
          ...(config?.namespace ? { "X-Vault-Namespace": config.namespace } : {}),
        },
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => {
          data += chunk;
        });
        res.on("end", () => {
          clearTimeout(timer);
          try {
            const parsed = data ? JSON.parse(data) : {};
            resolve({ status: res.statusCode ?? 0, data: parsed });
          } catch {
            resolve({ status: res.statusCode ?? 0, data: { raw: data } });
          }
        });
      },
    );

    req.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });

    if (bodyStr) {
      req.write(bodyStr);
    }
    req.end();
  });
}

/** Check OpenBao health/seal status. */
export async function getSealStatus(config?: Partial<OpenbaoConfig>): Promise<OpenbaoSealStatus> {
  const addr = resolveAddr(config);
  const url = new URL("/v1/sys/seal-status", addr);
  const isHttps = url.protocol === "https:";
  const reqFn = isHttps ? httpsRequest : request;

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("OpenBao health check timed out")), TIMEOUT_MS);
    const req = reqFn(url, { method: "GET" }, (res) => {
      let data = "";
      res.on("data", (chunk) => {
        data += chunk;
      });
      res.on("end", () => {
        clearTimeout(timer);
        try {
          resolve(JSON.parse(data));
        } catch {
          reject(new Error("Invalid response"));
        }
      });
    });
    req.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    req.end();
  });
}

/** Check if OpenBao is reachable and unsealed. */
export async function isOpenbaoReady(config?: Partial<OpenbaoConfig>): Promise<boolean> {
  try {
    const status = await getSealStatus(config);
    return status.initialized && !status.sealed;
  } catch {
    return false;
  }
}

// --- KV Secrets Engine ---

/** Write a secret to the KV v2 engine. */
export async function kvPut(
  token: string,
  mountPath: string,
  secretPath: string,
  data: Record<string, string>,
  config?: Partial<OpenbaoConfig>,
): Promise<void> {
  const { status } = await baoRequest("POST", `${mountPath}/data/${secretPath}`, token, config, {
    data,
  });
  if (status !== 200 && status !== 204) {
    throw new Error(`OpenBao KV put failed (HTTP ${status})`);
  }
}

/** Read a secret from the KV v2 engine. */
export async function kvGet(
  token: string,
  mountPath: string,
  secretPath: string,
  config?: Partial<OpenbaoConfig>,
): Promise<Record<string, string> | null> {
  const { status, data } = await baoRequest(
    "GET",
    `${mountPath}/data/${secretPath}`,
    token,
    config,
  );
  if (status === 404) {
    return null;
  }
  if (status !== 200) {
    throw new Error(`OpenBao KV get failed (HTTP ${status})`);
  }
  const resp = data as { data?: { data?: Record<string, string> } };
  return resp?.data?.data ?? null;
}

/** Delete a secret from the KV v2 engine. */
export async function kvDelete(
  token: string,
  mountPath: string,
  secretPath: string,
  config?: Partial<OpenbaoConfig>,
): Promise<void> {
  const { status } = await baoRequest(
    "DELETE",
    `${mountPath}/metadata/${secretPath}`,
    token,
    config,
  );
  if (status !== 204 && status !== 200) {
    throw new Error(`OpenBao KV delete failed (HTTP ${status})`);
  }
}

/** List secrets at a path in the KV v2 engine. */
export async function kvList(
  token: string,
  mountPath: string,
  secretPath: string,
  config?: Partial<OpenbaoConfig>,
): Promise<string[]> {
  const { status, data } = await baoRequest(
    "LIST",
    `${mountPath}/metadata/${secretPath}`,
    token,
    config,
  );
  if (status === 404) {
    return [];
  }
  if (status !== 200) {
    throw new Error(`OpenBao KV list failed (HTTP ${status})`);
  }
  const resp = data as { data?: { keys?: string[] } };
  return resp?.data?.keys ?? [];
}

// --- Transit Secrets Engine (HSM-backed encryption) ---

/**
 * Encrypt data using the Transit engine.
 * The transit engine delegates crypto to the HSM via PKCS#11 when configured.
 */
export async function transitEncrypt(
  token: string,
  keyName: string,
  plaintext: string, // base64-encoded
  config?: Partial<OpenbaoConfig>,
): Promise<TransitEncryptResponse> {
  const { status, data } = await baoRequest("POST", `transit/encrypt/${keyName}`, token, config, {
    plaintext,
  });
  if (status !== 200) {
    throw new Error(`Transit encrypt failed (HTTP ${status})`);
  }
  const resp = data as { data?: TransitEncryptResponse };
  if (!resp?.data?.ciphertext) {
    throw new Error("No ciphertext in transit response");
  }
  return resp.data;
}

/** Decrypt data using the Transit engine. */
export async function transitDecrypt(
  token: string,
  keyName: string,
  ciphertext: string,
  config?: Partial<OpenbaoConfig>,
): Promise<TransitDecryptResponse> {
  const { status, data } = await baoRequest("POST", `transit/decrypt/${keyName}`, token, config, {
    ciphertext,
  });
  if (status !== 200) {
    throw new Error(`Transit decrypt failed (HTTP ${status})`);
  }
  const resp = data as { data?: TransitDecryptResponse };
  if (!resp?.data?.plaintext) {
    throw new Error("No plaintext in transit response");
  }
  return resp.data;
}

/** Sign data using the Transit engine (delegates to HSM). */
export async function transitSign(
  token: string,
  keyName: string,
  input: string, // base64-encoded
  hashAlgorithm: string = "sha2-256",
  config?: Partial<OpenbaoConfig>,
): Promise<string> {
  const { status, data } = await baoRequest(
    "POST",
    `transit/sign/${keyName}/${hashAlgorithm}`,
    token,
    config,
    { input },
  );
  if (status !== 200) {
    throw new Error(`Transit sign failed (HTTP ${status})`);
  }
  const resp = data as { data?: { signature?: string } };
  if (!resp?.data?.signature) {
    throw new Error("No signature in transit response");
  }
  return resp.data.signature;
}

/** Verify a signature using the Transit engine. */
export async function transitVerify(
  token: string,
  keyName: string,
  input: string, // base64-encoded
  signature: string,
  hashAlgorithm: string = "sha2-256",
  config?: Partial<OpenbaoConfig>,
): Promise<boolean> {
  const { status, data } = await baoRequest(
    "POST",
    `transit/verify/${keyName}/${hashAlgorithm}`,
    token,
    config,
    { input, signature },
  );
  if (status !== 200) {
    throw new Error(`Transit verify failed (HTTP ${status})`);
  }
  const resp = data as { data?: { valid?: boolean } };
  return resp?.data?.valid ?? false;
}

// --- PKCS#11 Seal Management ---

/**
 * Generate the OpenBao seal stanza for PKCS#11 auto-unseal via YubiHSM.
 * From mostlySecure.md:
 *   seal "pkcs11" {
 *     lib          = "..\\yubihsm_pkcs11.dll"
 *     slot         = "0"
 *     key_label    = "openbao-unseal"
 *     mechanism    = "0x1085"  // CKM_AES_CBC_PAD
 *   }
 */
export function generateSealConfig(opts: {
  pkcs11Library: string;
  slot?: number;
  keyLabel?: string;
}): string {
  const slot = opts.slot ?? 0;
  const keyLabel = opts.keyLabel ?? "openbao-unseal";
  return [
    `seal "pkcs11" {`,
    `  lib       = "${opts.pkcs11Library.replace(/\\/g, "\\\\")}"`,
    `  slot      = "${slot}"`,
    `  key_label = "${keyLabel}"`,
    `  mechanism = "0x1085"`,
    `  # PIN is read from VAULT_HSM_PIN env var — not stored in config`,
    `}`,
  ].join("\n");
}

/**
 * Generate a PowerShell startup script that reads the HSM PIN from
 * Credential Manager and sets VAULT_HSM_PIN before starting OpenBao.
 * From mostlySecure.md, Step 7.
 */
export function generateStartupScript(opts: {
  openbaoPath: string;
  openbaoConfigPath: string;
  credentialTarget?: string;
}): string {
  const target = opts.credentialTarget ?? "TeeVault-OpenBao-UnsealPIN";
  return [
    `# OpenBao startup script — reads HSM PIN from Credential Manager`,
    `# Protected by Credential Guard at rest`,
    `$ErrorActionPreference = 'Stop'`,
    ``,
    `# Read HSM PIN from Credential Manager`,
    `if (Get-Module -ListAvailable -Name CredentialManager) {`,
    `  Import-Module CredentialManager`,
    `  $cred = Get-StoredCredential -Target '${target}'`,
    `  if (-not $cred) { throw 'HSM PIN not found in Credential Manager. Run: openclaw tee credential store --target openbaoUnsealPin' }`,
    `  $env:VAULT_HSM_PIN = $cred.GetNetworkCredential().Password`,
    `} else {`,
    `  # Fallback: try cmdkey`,
    `  throw 'CredentialManager module required. Install: Install-Module CredentialManager'`,
    `}`,
    ``,
    `# Start OpenBao`,
    `& '${opts.openbaoPath}' server -config '${opts.openbaoConfigPath}'`,
  ].join("\n");
}
