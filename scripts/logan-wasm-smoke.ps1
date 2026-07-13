# scripts/logan-wasm-smoke.ps1
#Requires -Version 5.1
$ErrorActionPreference = "Stop"
$Root = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $Root

$exe = Join-Path $Root "tools\logan-wasm-sandbox\target\release\logan-wasm-sandbox.exe"
if (-not (Test-Path $exe)) {
  cargo build --manifest-path tools/logan-wasm-sandbox/Cargo.toml --release
}
$allow = "security\proxy\allowed-domains.txt"

Write-Host "=== deny evil.com ==="
& $exe http --allowlist $allow --url "https://evil.com/"
if ($LASTEXITCODE -ne 2) { throw "expected exit 2 for deny, got $LASTEXITCODE" }

Write-Host "=== allow api.openai.com ==="
& $exe http --allowlist $allow --url "https://api.openai.com/"
if ($LASTEXITCODE -ne 0) { throw "expected exit 0 for allow, got $LASTEXITCODE" }

Write-Host "WASM_SMOKE_OK"
