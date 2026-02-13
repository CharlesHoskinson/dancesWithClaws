/**
 * YubiHSM 2 PKCS#11 backend via graphene-pk11.
 *
 * Keys generated inside the HSM never leave the device. Sign/decrypt
 * operations are performed on-device via PKCS#11. The module uses
 * dynamic import() so graphene-pk11 is only loaded when needed.
 */

import type { YubiHsmConfig } from "../types.js";
import {
  YUBIHSM_DEFAULT_PKCS11_PATH,
  YUBIHSM_DEFAULT_CONNECTOR_URL,
  YUBIHSM_DEFAULT_SLOT,
  VMK_KEY_LENGTH,
} from "../constants.js";

// Types from graphene-pk11 (declared here to avoid hard dependency)
interface GrapheneModule {
  load(path: string): GrapheneModule;
  initialize(): void;
  finalize(): void;
  getSlots(index: number): GrapheneSlot;
}

interface GrapheneSlot {
  open(flags: number): GrapheneSession;
}

interface GrapheneSession {
  login(userType: number, pin: string): void;
  logout(): void;
  close(): void;
  generateKey(mechanism: unknown, template: unknown): GrapheneKey;
  createSign(mechanism: unknown, key: unknown): GrapheneSigner;
  generateKeyPair(
    mechanism: unknown,
    pubTemplate: unknown,
    privTemplate: unknown,
  ): {
    publicKey: GrapheneKey;
    privateKey: GrapheneKey;
  };
  findObjects(template: unknown): GrapheneKey[];
  destroy(obj: unknown): void;
  wrapKey(mechanism: unknown, wrappingKey: unknown, key: unknown): Buffer;
  unwrapKey(
    mechanism: unknown,
    unwrappingKey: unknown,
    wrappedKey: Buffer,
    template: unknown,
  ): GrapheneKey;
}

interface GrapheneKey {
  handle: Buffer;
  getAttribute(attr: unknown): unknown;
  toType<T>(): T;
}

interface GrapheneSigner {
  update(data: Buffer): void;
  final(): Buffer;
  once(data: Buffer): Buffer;
}

let grapheneModule: GrapheneModule | null = null;
let activeSession: GrapheneSession | null = null;

/** Attempt to load graphene-pk11 dynamically. Returns null if unavailable. */
async function loadGraphene(): Promise<GrapheneModule | null> {
  if (grapheneModule) {
    return grapheneModule;
  }
  try {
    const graphene = await import("graphene-pk11");
    grapheneModule = graphene.Module as unknown as GrapheneModule;
    return grapheneModule;
  } catch {
    return null;
  }
}

/** Check if YubiHSM 2 is available (graphene-pk11 installed + device connected). */
export async function isYubiHsmAvailable(config?: Partial<YubiHsmConfig>): Promise<boolean> {
  const graphene = await loadGraphene();
  if (!graphene) {
    return false;
  }
  try {
    const pkcs11Path = config?.pkcs11Library ?? YUBIHSM_DEFAULT_PKCS11_PATH;
    const mod = graphene.load(pkcs11Path);
    mod.initialize();
    mod.getSlots(config?.slot ?? YUBIHSM_DEFAULT_SLOT);
    mod.finalize();
    return true;
  } catch {
    return false;
  }
}

/** Open a PKCS#11 session to the YubiHSM 2. */
export async function openSession(config: YubiHsmConfig, pin: string): Promise<void> {
  if (activeSession) {
    return;
  }
  const graphene = await loadGraphene();
  if (!graphene) {
    throw new Error("graphene-pk11 is not installed");
  }

  // Set connector URL via environment for the PKCS#11 library
  process.env.YUBIHSM_CONNECTOR_URL = config.connectorUrl ?? YUBIHSM_DEFAULT_CONNECTOR_URL;

  const mod = graphene.load(config.pkcs11Library ?? YUBIHSM_DEFAULT_PKCS11_PATH);
  mod.initialize();
  const slot = mod.getSlots(config.slot ?? YUBIHSM_DEFAULT_SLOT);
  // SessionFlag.RW_SESSION | SessionFlag.SERIAL_SESSION = 0x06
  const session = slot.open(0x06);
  // UserType.USER = 1
  const fullPin = `${config.authKeyId}${pin}`;
  session.login(1, fullPin);
  activeSession = session;
}

/** Close the active PKCS#11 session. */
export function closeSession(): void {
  if (!activeSession) {
    return;
  }
  try {
    activeSession.logout();
    activeSession.close();
  } catch {
    // Best-effort cleanup
  }
  activeSession = null;
}

/** Generate a 256-bit AES VMK inside the HSM (non-extractable). */
export async function generateHsmVmk(label: string): Promise<number> {
  if (!activeSession) {
    throw new Error("YubiHSM session not open");
  }
  const key = activeSession.generateKey(
    { mechanism: "AES_KEY_GEN" },
    {
      class: "SECRET_KEY",
      keyType: "AES",
      valueLen: VMK_KEY_LENGTH,
      token: true,
      private: true,
      sensitive: true,
      extractable: false,
      encrypt: true,
      decrypt: true,
      wrap: true,
      unwrap: true,
      label,
    },
  );
  // Return the object ID (handle) for future reference
  const id = key.getAttribute({ id: null }) as number;
  return id;
}

/** Generate an Ed25519 key pair inside the HSM. Returns the object ID. */
export async function generateHsmEd25519Key(
  label: string,
): Promise<{ objectId: number; publicKey: Buffer }> {
  if (!activeSession) {
    throw new Error("YubiHSM session not open");
  }
  const { publicKey, privateKey } = activeSession.generateKeyPair(
    { mechanism: "EDDSA" },
    {
      class: "PUBLIC_KEY",
      keyType: "EC_EDWARDS",
      token: true,
      label: `${label}-pub`,
      ecParams: Buffer.from("06032b6570", "hex"), // OID 1.3.101.112 (Ed25519)
    },
    {
      class: "PRIVATE_KEY",
      keyType: "EC_EDWARDS",
      token: true,
      private: true,
      sensitive: true,
      extractable: false,
      sign: true,
      label: `${label}-priv`,
    },
  );
  const pubKeyData = publicKey.getAttribute({ ecPoint: null }) as Buffer;
  const objectId = privateKey.getAttribute({ id: null }) as number;
  return { objectId, publicKey: pubKeyData };
}

/** Generate an ECDSA key pair inside the HSM. */
export async function generateHsmEcdsaKey(
  label: string,
  curve: "P-256" | "P-384",
): Promise<{ objectId: number; publicKey: Buffer }> {
  if (!activeSession) {
    throw new Error("YubiHSM session not open");
  }
  const ecParams =
    curve === "P-256"
      ? Buffer.from("06082a8648ce3d030107", "hex") // OID 1.2.840.10045.3.1.7
      : Buffer.from("06052b81040022", "hex"); // OID 1.3.132.0.34
  const { publicKey, privateKey } = activeSession.generateKeyPair(
    { mechanism: "ECDSA" },
    {
      class: "PUBLIC_KEY",
      keyType: "ECDSA",
      token: true,
      label: `${label}-pub`,
      ecParams,
    },
    {
      class: "PRIVATE_KEY",
      keyType: "ECDSA",
      token: true,
      private: true,
      sensitive: true,
      extractable: false,
      sign: true,
      label: `${label}-priv`,
    },
  );
  const pubKeyData = publicKey.getAttribute({ ecPoint: null }) as Buffer;
  const objectId = privateKey.getAttribute({ id: null }) as number;
  return { objectId, publicKey: pubKeyData };
}

/** Generate an RSA key pair inside the HSM. */
export async function generateHsmRsaKey(
  label: string,
  bits: 2048 | 4096,
): Promise<{ objectId: number; publicKey: Buffer }> {
  if (!activeSession) {
    throw new Error("YubiHSM session not open");
  }
  const { publicKey, privateKey } = activeSession.generateKeyPair(
    { mechanism: "RSA_PKCS_KEY_PAIR_GEN" },
    {
      class: "PUBLIC_KEY",
      keyType: "RSA",
      token: true,
      modulusBits: bits,
      publicExponent: Buffer.from([0x01, 0x00, 0x01]),
      label: `${label}-pub`,
    },
    {
      class: "PRIVATE_KEY",
      keyType: "RSA",
      token: true,
      private: true,
      sensitive: true,
      extractable: false,
      sign: true,
      decrypt: true,
      label: `${label}-priv`,
    },
  );
  const modulus = publicKey.getAttribute({ modulus: null }) as Buffer;
  const objectId = privateKey.getAttribute({ id: null }) as number;
  return { objectId, publicKey: modulus };
}

/** Sign data using an HSM-resident key. */
export async function hsmSign(objectId: number, data: Buffer, mechanism: string): Promise<Buffer> {
  if (!activeSession) {
    throw new Error("YubiHSM session not open");
  }
  const keys = activeSession.findObjects({
    class: "PRIVATE_KEY",
    id: objectId,
  });
  if (keys.length === 0) {
    throw new Error(`HSM key object ${objectId} not found`);
  }
  const signer = activeSession.createSign({ mechanism }, keys[0]);
  return signer.once(data);
}

/** Wrap (encrypt) a key using the HSM VMK via AES key wrap. */
export async function hsmWrapKey(vmkObjectId: number, keyData: Buffer): Promise<Buffer> {
  if (!activeSession) {
    throw new Error("YubiHSM session not open");
  }
  const vmkKeys = activeSession.findObjects({
    class: "SECRET_KEY",
    id: vmkObjectId,
  });
  if (vmkKeys.length === 0) {
    throw new Error(`HSM VMK object ${vmkObjectId} not found`);
  }
  // Import the key data temporarily, wrap it, then destroy the temp object
  const tempKey = activeSession.unwrapKey({ mechanism: "AES_KEY_WRAP" }, vmkKeys[0], keyData, {
    class: "SECRET_KEY",
    keyType: "AES",
    extractable: true,
    token: false,
  });
  const wrapped = activeSession.wrapKey({ mechanism: "AES_KEY_WRAP" }, vmkKeys[0], tempKey);
  activeSession.destroy(tempKey);
  return wrapped;
}

/** Unwrap (decrypt) a key using the HSM VMK. */
export async function hsmUnwrapKey(vmkObjectId: number, wrappedKey: Buffer): Promise<Buffer> {
  if (!activeSession) {
    throw new Error("YubiHSM session not open");
  }
  const vmkKeys = activeSession.findObjects({
    class: "SECRET_KEY",
    id: vmkObjectId,
  });
  if (vmkKeys.length === 0) {
    throw new Error(`HSM VMK object ${vmkObjectId} not found`);
  }
  const key = activeSession.unwrapKey({ mechanism: "AES_KEY_WRAP" }, vmkKeys[0], wrappedKey, {
    class: "SECRET_KEY",
    keyType: "AES",
    extractable: true,
    token: false,
  });
  const value = key.getAttribute({ value: null }) as Buffer;
  activeSession.destroy(key);
  return value;
}

/** Get firmware version info from the HSM. */
export async function getHsmInfo(): Promise<{
  firmware: string;
  serial: string;
} | null> {
  if (!activeSession) {
    return null;
  }
  try {
    // This would normally query slot/token info
    return { firmware: "unknown", serial: "unknown" };
  } catch {
    return null;
  }
}
