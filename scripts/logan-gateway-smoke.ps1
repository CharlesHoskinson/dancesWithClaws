#Requires -Version 5.1
<#
.SYNOPSIS
  One-shot Logan gateway + Ollama agent smoke (host, sandbox off).

.DESCRIPTION
  - Requires a built tree (`pnpm build`) and Ollama with a local model.
  - Starts gateway on loopback:18789 with a temp config.
  - Runs a single agent turn and prints JSON status.

.EXAMPLE
  .\scripts\logan-gateway-smoke.ps1
  .\scripts\logan-gateway-smoke.ps1 -Model ollama/llama3.2:1b
#>
param(
  [string]$Model = "ollama/llama3.2:1b",
  [int]$Port = 18789,
  [string]$Message = "Reply with exactly: LOBSTER_OK"
)

$ErrorActionPreference = "Stop"
$Root = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
if (-not (Test-Path (Join-Path $PSScriptRoot "..\openclaw.mjs"))) {
  $Root = Resolve-Path (Join-Path $PSScriptRoot "..")
} else {
  $Root = Resolve-Path (Join-Path $PSScriptRoot "..")
}
Set-Location $Root

if (-not (Test-Path "dist\entry.js")) {
  throw "Missing dist/entry.js. Run: npx pnpm@11.2.2 build"
}

$ollama = Join-Path $env:LOCALAPPDATA "Programs\Ollama\ollama.exe"
if (-not (Test-Path $ollama)) {
  throw "Ollama not found at $ollama. Install Ollama and pull a model."
}

# Ensure API is up
try {
  Invoke-WebRequest "http://127.0.0.1:11434/api/tags" -TimeoutSec 3 | Out-Null
} catch {
  Start-Process $ollama -ArgumentList "serve" -WindowStyle Hidden
  $up = $false
  for ($i = 0; $i -lt 30; $i++) {
    try {
      Invoke-WebRequest "http://127.0.0.1:11434/api/tags" -TimeoutSec 2 | Out-Null
      $up = $true
      break
    } catch { Start-Sleep 1 }
  }
  if (-not $up) { throw "Ollama API not reachable on :11434" }
}

$token = -join ((1..32) | ForEach-Object { "{0:x}" -f (Get-Random -Max 16) })
$configDir = Join-Path $env:TEMP "logan-gateway-smoke"
New-Item -ItemType Directory -Path $configDir -Force | Out-Null

$cfg = Get-Content (Join-Path $Root "openclaw.json") -Raw | ConvertFrom-Json
$cfg.agents.list[0].model.primary = $Model
$cfg.agents.list[0].model.fallbacks = @()
$cfg.agents.list[0].sandbox = @{ mode = "off" }
$cfg.gateway = @{
  mode = "local"
  auth = @{ mode = "token"; token = $token }
  port = $Port
  bind = "loopback"
}
if (-not $cfg.env.vars.PSObject.Properties["OLLAMA_API_KEY"]) {
  $cfg.env.vars | Add-Member -NotePropertyName OLLAMA_API_KEY -NotePropertyValue "ollama-local" -Force
} else {
  $cfg.env.vars.OLLAMA_API_KEY = "ollama-local"
}
$cfgPath = Join-Path $configDir "openclaw.json"
$cfg | ConvertTo-Json -Depth 20 | Set-Content $cfgPath -Encoding utf8

$env:OPENCLAW_CONFIG_PATH = $cfgPath
$env:OPENCLAW_STATE_DIR = $configDir
$env:OPENCLAW_GATEWAY_TOKEN = $token
$env:OLLAMA_API_KEY = "ollama-local"

Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue |
  ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }

$gwLog = Join-Path $configDir "gateway.log"
$errLog = Join-Path $configDir "gateway.err.log"
$gw = Start-Process -FilePath "node" `
  -ArgumentList @("openclaw.mjs", "gateway", "--port", "$Port", "--bind", "loopback") `
  -WorkingDirectory $Root -PassThru `
  -RedirectStandardOutput $gwLog -RedirectStandardError $errLog `
  -WindowStyle Hidden

try {
  $healthy = $false
  for ($i = 0; $i -lt 40; $i++) {
    try {
      $h = Invoke-WebRequest "http://127.0.0.1:$Port/healthz" -TimeoutSec 2
      if ($h.StatusCode -eq 200) { $healthy = $true; break }
    } catch { Start-Sleep 1 }
  }
  if (-not $healthy) {
    Get-Content $errLog -Tail 40 -ErrorAction SilentlyContinue
    throw "Gateway healthz failed"
  }
  Write-Host "healthz OK (pid $($gw.Id))"

  $outPath = Join-Path $configDir "agent.out.txt"
  & node openclaw.mjs agent --agent logan --message $Message --json 2>&1 |
    Tee-Object -FilePath $outPath
  if ($LASTEXITCODE -ne 0) {
    throw "agent turn failed with exit $LASTEXITCODE"
  }

  $raw = Get-Content $outPath -Raw
  if ($raw -notmatch '"status"\s*:\s*"ok"') {
    throw "agent JSON status was not ok"
  }
  Write-Host "GATEWAY_SMOKE_OK model=$Model"
  exit 0
}
finally {
  if ($gw -and -not $gw.HasExited) {
    Stop-Process -Id $gw.Id -Force -ErrorAction SilentlyContinue
  }
}
