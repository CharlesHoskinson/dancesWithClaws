/**
 * DPAPI bridge via PowerShell subprocess.
 *
 * Uses System.Security.Cryptography.ProtectedData to encrypt/decrypt
 * data bound to the current Windows user SID (CurrentUser scope).
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const POWERSHELL = "powershell.exe";
const TIMEOUT_MS = 15_000;

/**
 * Encrypt data using Windows DPAPI (CurrentUser scope).
 * Returns the protected blob as a Buffer.
 */
export async function dpapiProtect(plaintext: Buffer): Promise<Buffer> {
  const b64Input = plaintext.toString("base64");
  const script = `
    Add-Type -AssemblyName System.Security
    $bytes = [Convert]::FromBase64String('${b64Input}')
    $protected = [System.Security.Cryptography.ProtectedData]::Protect(
      $bytes,
      $null,
      [System.Security.Cryptography.DataProtectionScope]::CurrentUser
    )
    [Convert]::ToBase64String($protected)
  `.trim();

  const { stdout } = await execFileAsync(POWERSHELL, ["-NoProfile", "-Command", script], {
    timeout: TIMEOUT_MS,
    encoding: "utf8",
    windowsHide: true,
  });
  return Buffer.from(stdout.trim(), "base64");
}

/**
 * Decrypt data using Windows DPAPI (CurrentUser scope).
 */
export async function dpapiUnprotect(protectedData: Buffer): Promise<Buffer> {
  const b64Input = protectedData.toString("base64");
  const script = `
    Add-Type -AssemblyName System.Security
    $bytes = [Convert]::FromBase64String('${b64Input}')
    $unprotected = [System.Security.Cryptography.ProtectedData]::Unprotect(
      $bytes,
      $null,
      [System.Security.Cryptography.DataProtectionScope]::CurrentUser
    )
    [Convert]::ToBase64String($unprotected)
  `.trim();

  const { stdout } = await execFileAsync(POWERSHELL, ["-NoProfile", "-Command", script], {
    timeout: TIMEOUT_MS,
    encoding: "utf8",
    windowsHide: true,
  });
  return Buffer.from(stdout.trim(), "base64");
}

/** Check if DPAPI is available (Windows only). */
export async function isDpapiAvailable(): Promise<boolean> {
  if (process.platform !== "win32") {
    return false;
  }
  try {
    const script = `
      Add-Type -AssemblyName System.Security
      [System.Security.Cryptography.ProtectedData] | Out-Null
      Write-Output "ok"
    `.trim();
    const { stdout } = await execFileAsync(POWERSHELL, ["-NoProfile", "-Command", script], {
      timeout: TIMEOUT_MS,
      encoding: "utf8",
      windowsHide: true,
    });
    return stdout.trim() === "ok";
  } catch {
    return false;
  }
}
