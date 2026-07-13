#Requires -Version 5.1
<#
.SYNOPSIS
  Windows integration smoke for Logan wasm sandbox (no Docker).

.DESCRIPTION
  1. Builds release logan-wasm-sandbox host binary if missing
  2. Runs CLI allowlist smoke (deny evil.com + allow HTTPS)
  3. Asserts openclaw.json Logan agent has sandbox.backend = wasm
  4. Verifies OpenClaw wasm backend registration (vitest)
  5. Optionally attempts a live agent turn when -TryAgent and Ollama are available
     (partial OK if live turn is skipped or unavailable)

  Docker is never required or invoked.

.EXAMPLE
  .\scripts\logan-wasm-agent-smoke.ps1
  .\scripts\logan-wasm-agent-smoke.ps1 -TryAgent
  .\scripts\logan-wasm-agent-smoke.ps1 -TryAgent -Model ollama/llama3.2:1b
#>
param(
  [switch]$TryAgent,
  [string]$Model = "ollama/gemma4:e2b",
  [int]$Port = 18791,
  [string]$Message = "Reply with exactly: WASM_AGENT_OK"
)

$ErrorActionPreference = "Stop"
$Root = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $Root

function Assert-NoDockerRequired {
  Write-Host "=== no Docker required ==="
  # This smoke path must never invoke docker.
  if (Get-Command docker -ErrorAction SilentlyContinue) {
    Write-Host "docker is installed on PATH but is not used by this smoke (OK)"
  } else {
    Write-Host "docker not on PATH (OK for wasm backend)"
  }
}

function Ensure-HostBinary {
  $exe = Join-Path $Root "tools\logan-wasm-sandbox\target\release\logan-wasm-sandbox.exe"
  if (-not (Test-Path $exe)) {
    Write-Host "=== build logan-wasm-sandbox (release) ==="
    cargo build --manifest-path tools/logan-wasm-sandbox/Cargo.toml --release
    if ($LASTEXITCODE -ne 0) { throw "cargo build failed with exit $LASTEXITCODE" }
  }
  if (-not (Test-Path $exe)) {
    throw "Missing host binary after build: $exe"
  }
  Write-Host "host binary: $exe"
  return $exe
}

function Invoke-CliSmoke {
  Write-Host "=== CLI smoke (logan-wasm-smoke.ps1) ==="
  & (Join-Path $PSScriptRoot "logan-wasm-smoke.ps1")
  if ($LASTEXITCODE -ne 0) { throw "logan-wasm-smoke.ps1 failed with exit $LASTEXITCODE" }
}

function Assert-LoganWasmConfig {
  Write-Host "=== Logan config backend=wasm ==="
  $cfgPath = Join-Path $Root "openclaw.json"
  if (-not (Test-Path $cfgPath)) { throw "Missing openclaw.json" }
  $cfg = Get-Content $cfgPath -Raw | ConvertFrom-Json
  $logan = $cfg.agents.list | Where-Object { $_.id -eq "logan" } | Select-Object -First 1
  if (-not $logan) { throw "openclaw.json has no agents.list entry id=logan" }
  $backend = [string]$logan.sandbox.backend
  if ($backend -ne "wasm") {
    throw "expected logan.sandbox.backend=wasm, got '$backend'"
  }
  Write-Host "logan.sandbox.backend=wasm (OK)"
}

function Invoke-BackendRegistrationCheck {
  Write-Host "=== wasm backend registration (vitest) ==="
  & node scripts/run-vitest.mjs run src/agents/sandbox/wasm-backend.test.ts -t "auto-registers"
  if ($LASTEXITCODE -ne 0) {
    throw "wasm backend registration vitest failed with exit $LASTEXITCODE"
  }
}

function Try-AgentTurn {
  param([string]$ModelName, [int]$GwPort, [string]$Msg)

  Write-Host "=== optional agent turn (sandbox wasm) ==="
  if (-not (Test-Path (Join-Path $Root "dist\entry.js"))) {
    Write-Host "SKIP agent turn: missing dist/entry.js (run pnpm build). Manual:"
    Write-Host "  .\scripts\logan-gateway-smoke.ps1  # baseline without sandbox"
    Write-Host "  # or: start gateway with openclaw.json (backend=wasm) and:"
    Write-Host "  # node openclaw.mjs agent --agent logan --message `"$Msg`" --json"
    return "skipped"
  }

  $ollama = Join-Path $env:LOCALAPPDATA "Programs\Ollama\ollama.exe"
  if (-not (Test-Path $ollama)) {
    Write-Host "SKIP agent turn: Ollama not found. Manual step documented above."
    return "skipped"
  }

  try {
    Invoke-WebRequest "http://127.0.0.1:11434/api/tags" -TimeoutSec 3 | Out-Null
  } catch {
    Write-Host "SKIP agent turn: Ollama API not reachable on :11434"
    return "skipped"
  }

  $token = -join ((1..32) | ForEach-Object { "{0:x}" -f (Get-Random -Max 16) })
  $configDir = Join-Path $env:TEMP "logan-wasm-agent-smoke"
  New-Item -ItemType Directory -Path $configDir -Force | Out-Null

  $cfg = Get-Content (Join-Path $Root "openclaw.json") -Raw | ConvertFrom-Json
  $cfg.agents.list[0].model.primary = $ModelName
  $cfg.agents.list[0].model.fallbacks = @()
  # Keep wasm sandbox on for this path (unlike logan-gateway-smoke which sets mode=off)
  if (-not $cfg.agents.list[0].sandbox) {
    $cfg.agents.list[0] | Add-Member -NotePropertyName sandbox -NotePropertyValue (@{}) -Force
  }
  $cfg.agents.list[0].sandbox.mode = "all"
  $cfg.agents.list[0].sandbox.backend = "wasm"
  $cfg.gateway = @{
    mode = "local"
    auth = @{ mode = "token"; token = $token }
    port = $GwPort
    bind = "loopback"
  }
  if (-not $cfg.env.vars.PSObject.Properties["OLLAMA_API_KEY"]) {
    $cfg.env.vars | Add-Member -NotePropertyName OLLAMA_API_KEY -NotePropertyValue "ollama-local" -Force
  } else {
    $cfg.env.vars.OLLAMA_API_KEY = "ollama-local"
  }
  $cfgPath = Join-Path $configDir "openclaw.json"
  $cfg | ConvertTo-Json -Depth 20 | Set-Content $cfgPath -Encoding utf8

  $prevConfig = $env:OPENCLAW_CONFIG_PATH
  $prevState = $env:OPENCLAW_STATE_DIR
  $prevToken = $env:OPENCLAW_GATEWAY_TOKEN
  $prevOllama = $env:OLLAMA_API_KEY
  $env:OPENCLAW_CONFIG_PATH = $cfgPath
  $env:OPENCLAW_STATE_DIR = $configDir
  $env:OPENCLAW_GATEWAY_TOKEN = $token
  $env:OLLAMA_API_KEY = "ollama-local"

  Get-NetTCPConnection -LocalPort $GwPort -ErrorAction SilentlyContinue |
    ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }

  $gwLog = Join-Path $configDir "gateway.log"
  $errLog = Join-Path $configDir "gateway.err.log"
  $gw = Start-Process -FilePath "node" `
    -ArgumentList @("openclaw.mjs", "gateway", "--port", "$GwPort", "--bind", "loopback") `
    -WorkingDirectory $Root -PassThru `
    -RedirectStandardOutput $gwLog -RedirectStandardError $errLog `
    -WindowStyle Hidden

  try {
    $healthy = $false
    for ($i = 0; $i -lt 40; $i++) {
      try {
        $h = Invoke-WebRequest "http://127.0.0.1:$GwPort/healthz" -TimeoutSec 2
        if ($h.StatusCode -eq 200) { $healthy = $true; break }
      } catch { Start-Sleep 1 }
    }
    if (-not $healthy) {
      Write-Host "SKIP agent turn: gateway healthz failed (logs: $errLog)"
      Get-Content $errLog -Tail 20 -ErrorAction SilentlyContinue
      return "skipped"
    }
    Write-Host "healthz OK (pid $($gw.Id))"

    $outPath = Join-Path $configDir "agent.out.txt"
    & node openclaw.mjs agent --agent logan --message $Msg --json 2>&1 |
      Tee-Object -FilePath $outPath
    if ($LASTEXITCODE -ne 0) {
      Write-Host "PARTIAL: agent turn exit $LASTEXITCODE (CLI + registration still green)"
      Get-Content $outPath -Tail 30 -ErrorAction SilentlyContinue
      return "partial"
    }
    $raw = Get-Content $outPath -Raw
    if ($raw -notmatch '"status"\s*:\s*"ok"') {
      Write-Host "PARTIAL: agent JSON status was not ok (CLI + registration still green)"
      return "partial"
    }
    Write-Host "agent turn OK (sandbox backend=wasm)"
    return "ok"
  }
  finally {
    if ($gw -and -not $gw.HasExited) {
      Stop-Process -Id $gw.Id -Force -ErrorAction SilentlyContinue
    }
    if ($null -ne $prevConfig) { $env:OPENCLAW_CONFIG_PATH = $prevConfig } else { Remove-Item Env:OPENCLAW_CONFIG_PATH -ErrorAction SilentlyContinue }
    if ($null -ne $prevState) { $env:OPENCLAW_STATE_DIR = $prevState } else { Remove-Item Env:OPENCLAW_STATE_DIR -ErrorAction SilentlyContinue }
    if ($null -ne $prevToken) { $env:OPENCLAW_GATEWAY_TOKEN = $prevToken } else { Remove-Item Env:OPENCLAW_GATEWAY_TOKEN -ErrorAction SilentlyContinue }
    if ($null -ne $prevOllama) { $env:OLLAMA_API_KEY = $prevOllama } else { Remove-Item Env:OLLAMA_API_KEY -ErrorAction SilentlyContinue }
  }
}

# --- main ---
Assert-NoDockerRequired
$null = Ensure-HostBinary
Invoke-CliSmoke
Assert-LoganWasmConfig
Invoke-BackendRegistrationCheck

$agentStatus = "skipped"
if ($TryAgent) {
  $agentStatus = Try-AgentTurn -ModelName $Model -GwPort $Port -Msg $Message
} else {
  Write-Host "=== agent turn ==="
  Write-Host "SKIPPED (pass -TryAgent to attempt live gateway turn with Ollama)"
  Write-Host "Manual: .\scripts\logan-wasm-agent-smoke.ps1 -TryAgent"
}

Write-Host ""
Write-Host "WASM_AGENT_SMOKE_OK cli=ok registration=ok config=wasm docker=not_required agent=$agentStatus"
exit 0
