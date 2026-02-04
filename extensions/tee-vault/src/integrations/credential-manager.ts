/**
 * Windows Credential Manager bridge.
 *
 * Stores and retrieves secrets (HSM PINs, OpenBao tokens) in Windows
 * Credential Manager, protected by Credential Guard when enabled.
 * This replaces plaintext env vars and config files for secret storage.
 *
 * From mostlySecure.md:
 *   "Store the HSM auth password in Windows Credential Manager so the
 *    startup script can retrieve it without any plaintext files."
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const POWERSHELL = "powershell.exe";
const TIMEOUT_MS = 15_000;

const CREDENTIAL_TARGETS = {
  hsmPin: "TeeVault-YubiHSM-PIN",
  hsmAdmin: "TeeVault-YubiHSM-Admin",
  hsmSshSigner: "TeeVault-YubiHSM-SSHSigner",
  hsmDbCrypto: "TeeVault-YubiHSM-DBCrypto",
  hsmBackup: "TeeVault-YubiHSM-Backup",
  openbaoToken: "TeeVault-OpenBao-Token",
  openbaoUnsealPin: "TeeVault-OpenBao-UnsealPIN",
} as const;

export type CredentialTarget = keyof typeof CREDENTIAL_TARGETS;

/** Store a credential in Windows Credential Manager. */
export async function storeCredential(
  target: CredentialTarget,
  username: string,
  password: string,
): Promise<void> {
  if (process.platform !== "win32") {
    throw new Error("Credential Manager requires Windows");
  }
  const targetName = CREDENTIAL_TARGETS[target];
  const safeUser = username.replace(/'/g, "''");
  const safePass = password.replace(/'/g, "''");

  // Use cmdkey.exe for basic credential storage, or PowerShell CredentialManager module
  const script = `
    $ErrorActionPreference = 'Stop'
    # Try using CredentialManager module first
    if (Get-Module -ListAvailable -Name CredentialManager) {
      Import-Module CredentialManager
      New-StoredCredential -Target '${targetName}' -UserName '${safeUser}' -Password '${safePass}' -Persist LocalMachine | Out-Null
      Write-Output 'ok'
    } else {
      # Fallback: use cmdkey
      $null = cmdkey /add:'${targetName}' /user:'${safeUser}' /pass:'${safePass}'
      Write-Output 'ok'
    }
  `.trim();

  const { stdout } = await execFileAsync(POWERSHELL, ["-NoProfile", "-Command", script], {
    timeout: TIMEOUT_MS,
    encoding: "utf8",
    windowsHide: true,
  });
  if (!stdout.trim().includes("ok")) {
    throw new Error("Failed to store credential in Credential Manager");
  }
}

/** Retrieve a credential from Windows Credential Manager. */
export async function retrieveCredential(
  target: CredentialTarget,
): Promise<{ username: string; password: string } | null> {
  if (process.platform !== "win32") {
    return null;
  }
  const targetName = CREDENTIAL_TARGETS[target];

  const script = `
    $ErrorActionPreference = 'Stop'
    if (Get-Module -ListAvailable -Name CredentialManager) {
      Import-Module CredentialManager
      $cred = Get-StoredCredential -Target '${targetName}' -ErrorAction SilentlyContinue
      if ($cred) {
        $pass = $cred.GetNetworkCredential().Password
        Write-Output "$($cred.UserName)|$pass"
      } else {
        Write-Output 'NOT_FOUND'
      }
    } else {
      # Fallback: use cmdkey /list and PromptForCredential isn't scriptable
      # so we use the .NET CredentialManager directly
      Add-Type -TypeDefinition @'
        using System;
        using System.Runtime.InteropServices;
        public class CredRead {
          [DllImport("advapi32.dll", SetLastError=true, CharSet=CharSet.Unicode)]
          public static extern bool CredReadW(string target, int type, int flags, out IntPtr credential);
          [DllImport("advapi32.dll")]
          public static extern void CredFree(IntPtr credential);
          [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)]
          public struct CREDENTIAL {
            public int Flags; public int Type;
            public string TargetName; public string Comment;
            public System.Runtime.InteropServices.ComTypes.FILETIME LastWritten;
            public int CredentialBlobSize; public IntPtr CredentialBlob;
            public int Persist; public int AttributeCount;
            public IntPtr Attributes; public string TargetAlias; public string UserName;
          }
          public static string Read(string target) {
            IntPtr ptr;
            if (!CredReadW(target, 1, 0, out ptr)) return "NOT_FOUND";
            var cred = (CREDENTIAL)Marshal.PtrToStructure(ptr, typeof(CREDENTIAL));
            var pass = Marshal.PtrToStringUni(cred.CredentialBlob, cred.CredentialBlobSize / 2);
            CredFree(ptr);
            return cred.UserName + "|" + pass;
          }
        }
'@
      Write-Output ([CredRead]::Read('${targetName}'))
    }
  `.trim();

  try {
    const { stdout } = await execFileAsync(POWERSHELL, ["-NoProfile", "-Command", script], {
      timeout: TIMEOUT_MS,
      encoding: "utf8",
      windowsHide: true,
    });
    const result = stdout.trim();
    if (result === "NOT_FOUND") {
      return null;
    }
    const sep = result.indexOf("|");
    if (sep === -1) {
      return null;
    }
    return {
      username: result.slice(0, sep),
      password: result.slice(sep + 1),
    };
  } catch {
    return null;
  }
}

/** Delete a credential from Windows Credential Manager. */
export async function deleteCredential(target: CredentialTarget): Promise<boolean> {
  if (process.platform !== "win32") {
    return false;
  }
  const targetName = CREDENTIAL_TARGETS[target];

  const script = `
    $ErrorActionPreference = 'Stop'
    if (Get-Module -ListAvailable -Name CredentialManager) {
      Import-Module CredentialManager
      Remove-StoredCredential -Target '${targetName}' -ErrorAction SilentlyContinue
    } else {
      cmdkey /delete:'${targetName}' 2>$null
    }
    Write-Output 'ok'
  `.trim();

  try {
    await execFileAsync(POWERSHELL, ["-NoProfile", "-Command", script], {
      timeout: TIMEOUT_MS,
      encoding: "utf8",
      windowsHide: true,
    });
    return true;
  } catch {
    return false;
  }
}

/** List all TEE Vault credentials stored in Credential Manager. */
export async function listCredentials(): Promise<string[]> {
  if (process.platform !== "win32") {
    return [];
  }

  const script = `
    cmdkey /list | Where-Object { $_ -match 'TeeVault-' } | ForEach-Object {
      if ($_ -match 'Target:\\s*(.+)') { $Matches[1].Trim() }
    }
  `.trim();

  try {
    const { stdout } = await execFileAsync(POWERSHELL, ["-NoProfile", "-Command", script], {
      timeout: TIMEOUT_MS,
      encoding: "utf8",
      windowsHide: true,
    });
    return stdout.trim().split(/\r?\n/).filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * Resolve the YubiHSM PIN: Credential Manager → env var → prompt.
 * This implements the mostlySecure.md pattern where the PIN is stored
 * in Credential Manager (protected by Credential Guard) and only
 * enters memory when needed.
 */
export async function resolveHsmPin(promptFn?: (msg: string) => Promise<string>): Promise<string> {
  // 1. Try Credential Manager
  const cred = await retrieveCredential("hsmPin");
  if (cred?.password) {
    return cred.password;
  }

  // 2. Try environment variable
  const envPin = process.env.YUBIHSM_PIN ?? process.env.VAULT_HSM_PIN;
  if (envPin) {
    return envPin;
  }

  // 3. Prompt
  if (promptFn) {
    return promptFn("Enter YubiHSM PIN: ");
  }
  throw new Error(
    "YubiHSM PIN not found. Store it with `openclaw tee credential store --target hsmPin` " +
      "or set YUBIHSM_PIN environment variable.",
  );
}

/** Resolve the OpenBao token: Credential Manager → env var → prompt. */
export async function resolveOpenbaoToken(
  promptFn?: (msg: string) => Promise<string>,
): Promise<string> {
  const cred = await retrieveCredential("openbaoToken");
  if (cred?.password) {
    return cred.password;
  }

  const envToken = process.env.VAULT_TOKEN ?? process.env.BAO_TOKEN;
  if (envToken) {
    return envToken;
  }

  if (promptFn) {
    return promptFn("Enter OpenBao token: ");
  }
  throw new Error(
    "OpenBao token not found. Store it with `openclaw tee credential store --target openbaoToken` " +
      "or set VAULT_TOKEN environment variable.",
  );
}

export { CREDENTIAL_TARGETS };
