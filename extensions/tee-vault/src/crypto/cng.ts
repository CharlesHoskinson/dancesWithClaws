/**
 * Windows CNG (Cryptography: Next Generation) bridge for cert store operations.
 *
 * Uses PowerShell to interact with the Windows certificate store for
 * importing/exporting certificates and performing cert-based operations.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const POWERSHELL = "powershell.exe";
const TIMEOUT_MS = 15_000;

export interface CertInfo {
  thumbprint: string;
  subject: string;
  issuer: string;
  notBefore: string;
  notAfter: string;
  hasPrivateKey: boolean;
}

/** List certificates in the user's personal store. */
export async function listCertificates(): Promise<CertInfo[]> {
  if (process.platform !== "win32") {
    return [];
  }
  const script = `
    Get-ChildItem Cert:\\CurrentUser\\My | ForEach-Object {
      [PSCustomObject]@{
        Thumbprint = $_.Thumbprint
        Subject = $_.Subject
        Issuer = $_.Issuer
        NotBefore = $_.NotBefore.ToString('o')
        NotAfter = $_.NotAfter.ToString('o')
        HasPrivateKey = $_.HasPrivateKey
      }
    } | ConvertTo-Json -Compress
  `.trim();

  const { stdout } = await execFileAsync(POWERSHELL, ["-NoProfile", "-Command", script], {
    timeout: TIMEOUT_MS,
    encoding: "utf8",
    windowsHide: true,
  });
  const trimmed = stdout.trim();
  if (!trimmed || trimmed === "null") {
    return [];
  }
  const parsed = JSON.parse(trimmed);
  const arr = Array.isArray(parsed) ? parsed : [parsed];
  return arr.map((c: Record<string, unknown>) => ({
    thumbprint: String(c.Thumbprint ?? ""),
    subject: String(c.Subject ?? ""),
    issuer: String(c.Issuer ?? ""),
    notBefore: String(c.NotBefore ?? ""),
    notAfter: String(c.NotAfter ?? ""),
    hasPrivateKey: Boolean(c.HasPrivateKey),
  }));
}

/** Import a PFX/PKCS#12 certificate into the user's personal store. */
export async function importPfx(pfxPath: string, password: string): Promise<string> {
  if (process.platform !== "win32") {
    throw new Error("CNG operations require Windows");
  }
  // Sanitize inputs to prevent injection
  const safePath = pfxPath.replace(/'/g, "''");
  const safePassword = password.replace(/'/g, "''");
  const script = `
    $secPass = ConvertTo-SecureString -String '${safePassword}' -AsPlainText -Force
    $cert = Import-PfxCertificate -FilePath '${safePath}' -CertStoreLocation Cert:\\CurrentUser\\My -Password $secPass
    Write-Output $cert.Thumbprint
  `.trim();

  const { stdout } = await execFileAsync(POWERSHELL, ["-NoProfile", "-Command", script], {
    timeout: TIMEOUT_MS,
    encoding: "utf8",
    windowsHide: true,
  });
  return stdout.trim();
}

/** Export a certificate's public key as PEM. */
export async function exportCertPublicKeyPem(thumbprint: string): Promise<string> {
  if (process.platform !== "win32") {
    throw new Error("CNG operations require Windows");
  }
  const safeThumb = thumbprint.replace(/[^a-fA-F0-9]/g, "");
  const script = `
    $cert = Get-ChildItem "Cert:\\CurrentUser\\My\\${safeThumb}"
    $bytes = $cert.Export([System.Security.Cryptography.X509Certificates.X509ContentType]::Cert)
    $b64 = [Convert]::ToBase64String($bytes, [Base64FormattingOptions]::InsertLineBreaks)
    Write-Output "-----BEGIN CERTIFICATE-----"
    Write-Output $b64
    Write-Output "-----END CERTIFICATE-----"
  `.trim();

  const { stdout } = await execFileAsync(POWERSHELL, ["-NoProfile", "-Command", script], {
    timeout: TIMEOUT_MS,
    encoding: "utf8",
    windowsHide: true,
  });
  return stdout.trim();
}

/** Check if CNG operations are available. */
export async function isCngAvailable(): Promise<boolean> {
  if (process.platform !== "win32") {
    return false;
  }
  try {
    const script =
      "Get-ChildItem Cert:\\CurrentUser\\My -ErrorAction Stop | Out-Null; Write-Output 'ok'";
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
