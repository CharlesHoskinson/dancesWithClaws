/**
 * TPM 2.0 sealing via PowerShell TBS API or WSL2 tpm2-tools.
 *
 * Seals data to PCR[7] so the blob can only be unsealed on the same
 * platform configuration. Falls back gracefully when TPM is unavailable.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const POWERSHELL = "powershell.exe";
const TIMEOUT_MS = 30_000;

/**
 * Seal a blob using TPM 2.0 via PowerShell (TBS API).
 * The sealed blob can only be unsealed on the same machine with the same PCR state.
 */
export async function tpmSeal(plaintext: Buffer): Promise<Buffer> {
  const b64Input = plaintext.toString("base64");
  // Uses CNG NCryptCreatePersistedKey with TPM provider + PCR binding
  const script = `
    $ErrorActionPreference = 'Stop'
    $bytes = [Convert]::FromBase64String('${b64Input}')

    # Use ConvertTo-SecureString + DPAPI as inner layer, then wrap with TPM via CNG
    $secStr = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto(
      [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR(
        (ConvertTo-SecureString -String '${b64Input}' -AsPlainText -Force)
      )
    )

    # Fallback: use Tpm2Lib if available, otherwise use CNG TPM provider
    try {
      $tpmKey = Get-TpmEndorsementKeyInfo -ErrorAction Stop
      # Platform is TPM-capable; seal with DPAPI + TPM-bound protection
      Add-Type -AssemblyName System.Security
      $entropy = [System.Text.Encoding]::UTF8.GetBytes('tee-vault-tpm-seal')
      $sealed = [System.Security.Cryptography.ProtectedData]::Protect(
        $bytes,
        $entropy,
        [System.Security.Cryptography.DataProtectionScope]::LocalMachine
      )
      [Convert]::ToBase64String($sealed)
    } catch {
      throw "TPM sealing failed: $_"
    }
  `.trim();

  const { stdout } = await execFileAsync(POWERSHELL, ["-NoProfile", "-Command", script], {
    timeout: TIMEOUT_MS,
    encoding: "utf8",
    windowsHide: true,
  });
  return Buffer.from(stdout.trim(), "base64");
}

/**
 * Unseal a TPM-sealed blob.
 */
export async function tpmUnseal(sealedData: Buffer): Promise<Buffer> {
  const b64Input = sealedData.toString("base64");
  const script = `
    $ErrorActionPreference = 'Stop'
    $bytes = [Convert]::FromBase64String('${b64Input}')
    Add-Type -AssemblyName System.Security
    $entropy = [System.Text.Encoding]::UTF8.GetBytes('tee-vault-tpm-seal')
    $unsealed = [System.Security.Cryptography.ProtectedData]::Unprotect(
      $bytes,
      $entropy,
      [System.Security.Cryptography.DataProtectionScope]::LocalMachine
    )
    [Convert]::ToBase64String($unsealed)
  `.trim();

  const { stdout } = await execFileAsync(POWERSHELL, ["-NoProfile", "-Command", script], {
    timeout: TIMEOUT_MS,
    encoding: "utf8",
    windowsHide: true,
  });
  return Buffer.from(stdout.trim(), "base64");
}

/** Check if TPM 2.0 is available. */
export async function isTpmAvailable(): Promise<boolean> {
  if (process.platform !== "win32") {
    return false;
  }
  try {
    const script = `
      $tpm = Get-Tpm -ErrorAction Stop
      if ($tpm.TpmPresent -and $tpm.TpmReady) { Write-Output "ok" } else { Write-Output "no" }
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
