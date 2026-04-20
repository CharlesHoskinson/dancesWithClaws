/**
 * TEE Vault type definitions.
 */

export type BackendType = "yubihsm" | "dpapi+tpm" | "dpapi" | "openssl-pbkdf2";

export type EntryType = "secret" | "api_token" | "ssh_key" | "private_key" | "certificate";

export type SshKeyAlgorithm = "ed25519" | "ecdsa-p256" | "ecdsa-p384" | "rsa-2048" | "rsa-4096";

export type CryptoOperation = "encrypt" | "decrypt" | "sign" | "verify";

export type CredentialTarget =
  | "hsmPin"
  | "hsmAdmin"
  | "hsmSshSigner"
  | "hsmDbCrypto"
  | "hsmBackup"
  | "openbaoToken"
  | "openbaoUnsealPin";

export interface VaultConfig {
  backend: BackendType;
  autoLockTimeoutMs: number;
  auditLogEnabled: boolean;
  stateDir: string;
  yubihsm?: YubiHsmConfig;
}

export interface YubiHsmConfig {
  pkcs11Library: string;
  connectorUrl: string;
  authKeyId: string;
  slot: number;
}

export interface VaultMetadata {
  backend: BackendType;
  createdAt: string;
  lastModifiedAt: string;
  vmkVersion: number;
  entryCount: number;
}

export interface VaultEntry {
  id: string;
  label: string;
  type: EntryType;
  tags: string[];
  createdAt: string;
  modifiedAt: string;
  version: number;
  /** For HSM-resident keys, the vault stores only the HSM object ID. */
  hsmResident: boolean;
  hsmObjectId?: number;
  /** Encrypted payload fields (absent for HSM-resident keys). */
  iv?: string;
  ciphertext?: string;
  authTag?: string;
}

export interface VaultEnvelope {
  version: 1;
  metadata: VaultMetadata;
  sealedVmk: string;
  entries: VaultEntry[];
  hmac: string;
}

export interface UnlockedState {
  vmk: Buffer;
  unlockedAt: number;
  backend: BackendType;
}

export interface AuditLogEntry {
  timestamp: string;
  action: string;
  entryLabel?: string;
  entryType?: EntryType;
  tool?: string;
  success: boolean;
  error?: string;
}

export interface AuditCheck {
  id: string;
  severity: "critical" | "warn" | "info";
  message: string;
  passed: boolean;
}

// --- mostlySecure integration types ---

export type HsmAuthKeyRole = "admin" | "sshSigner" | "dbCrypto" | "backup";

export interface MostlySecureConfig {
  yubihsm: YubiHsmConfig;
  openbao: OpenbaoIntegrationConfig;
  sshHost?: SshHostEntry;
  ironkeyDrive?: string;
}

export interface OpenbaoIntegrationConfig {
  addr: string;
  kvMount: string;
  transitMount: string;
  namespace?: string;
}

export interface SshHostEntry {
  hostAlias: string;
  hostname: string;
  user: string;
  port?: number;
}

export interface HsmKeyMapping {
  role: HsmAuthKeyRole;
  authKeyId: number;
  objectId?: number;
  label: string;
  capabilities: string;
}
