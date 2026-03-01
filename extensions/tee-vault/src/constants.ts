/**
 * TEE Vault constants.
 */

export const VAULT_DIR_NAME = "tee-vault";
export const VAULT_FILE_NAME = "vault.enc";
export const AUDIT_LOG_FILE_NAME = "audit.jsonl";

export const VMK_KEY_LENGTH = 32; // 256-bit AES
export const GCM_IV_LENGTH = 12;
export const GCM_AUTH_TAG_LENGTH = 16;
export const HKDF_HASH = "sha256";
export const PBKDF2_ITERATIONS = 600_000;
export const PBKDF2_SALT_LENGTH = 32;

export const DEFAULT_AUTO_LOCK_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes
export const VMK_ROTATION_WARNING_DAYS = 90;

export const BACKEND_SECURITY_ORDER: readonly BackendId[] = [
  "yubihsm",
  "dpapi+tpm",
  "dpapi",
  "openssl-pbkdf2",
] as const;

type BackendId = "yubihsm" | "dpapi+tpm" | "dpapi" | "openssl-pbkdf2";

export const YUBIHSM_DEFAULT_PKCS11_PATH =
  "C:\\Program Files\\Yubico\\YubiHSM Shell\\bin\\pkcs11\\yubihsm_pkcs11.dll";
export const YUBIHSM_DEFAULT_CONNECTOR_URL = "http://localhost:12345";
export const YUBIHSM_DEFAULT_SLOT = 0;

export const SUPPORTED_SSH_ALGORITHMS = [
  "ed25519",
  "ecdsa-p256",
  "ecdsa-p384",
  "rsa-2048",
  "rsa-4096",
] as const;

// --- mostlySecure HSM auth key roles (from mostlySecure.md) ---
export const HSM_AUTH_KEY_ADMIN = 2;
export const HSM_AUTH_KEY_SSH_SIGNER = 10;
export const HSM_AUTH_KEY_DB_CRYPTO = 11;
export const HSM_AUTH_KEY_BACKUP = 12;

// --- mostlySecure HSM object IDs ---
export const HSM_OBJECT_SSH_KEY = 100;
export const HSM_OBJECT_WRAP_KEY = 200;

// --- OpenBao defaults ---
export const OPENBAO_DEFAULT_ADDR = "http://127.0.0.1:8200";
export const OPENBAO_DEFAULT_KV_MOUNT = "secret";
export const OPENBAO_DEFAULT_TRANSIT_MOUNT = "transit";

// --- IronKey backup ---
export const IRONKEY_BACKUP_MANIFEST = "backup-manifest.json";

// --- YubiHSM shell path ---
export const YUBIHSM_SHELL_PATH =
  process.platform === "win32"
    ? "C:\\Program Files\\Yubico\\YubiHSM Shell\\bin\\yubihsm-shell.exe"
    : "yubihsm-shell";
