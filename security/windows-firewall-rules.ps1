#Requires -RunAsAdministrator
<#
.SYNOPSIS
    Configure Windows Firewall rules to isolate WSL2 from the LAN.
.DESCRIPTION
    Creates firewall rules that:
    1. Block WSL2 subnet from reaching LAN (prevent lateral movement)
    2. Allow WSL2 outbound HTTPS and DNS (needed for proxy container egress)
    3. Allow WSL2 DNS over UDP
.NOTES
    Run from an elevated PowerShell prompt.
    To remove these rules: Get-NetFirewallRule -DisplayName "OpenClaw*" | Remove-NetFirewallRule
#>

$ErrorActionPreference = "Stop"

# Remove existing OpenClaw firewall rules if present
$existing = Get-NetFirewallRule -DisplayName "OpenClaw*" -ErrorAction SilentlyContinue
if ($existing) {
    Write-Host "Removing existing OpenClaw firewall rules..."
    $existing | Remove-NetFirewallRule
}

Write-Host "Creating firewall rules for WSL2 isolation..."

# 1. Block WSL2 -> LAN (RFC 1918 private ranges)
New-NetFirewallRule -DisplayName "OpenClaw: Block WSL2 to LAN" `
    -Direction Outbound `
    -InterfaceAlias "vEthernet (WSL*)" `
    -RemoteAddress 10.0.0.0/8,172.16.0.0/12,192.168.0.0/16 `
    -Action Block `
    -Profile Any `
    -Description "Prevent WSL2 containers from reaching LAN hosts"

# 2. Allow WSL2 -> internet on HTTPS and DNS (TCP)
New-NetFirewallRule -DisplayName "OpenClaw: Allow WSL2 HTTPS+DNS TCP" `
    -Direction Outbound `
    -InterfaceAlias "vEthernet (WSL*)" `
    -RemoteAddress Any `
    -RemotePort 443,53 `
    -Protocol TCP `
    -Action Allow `
    -Profile Any `
    -Description "Allow proxy container to reach allowlisted domains via HTTPS and DNS"

# 3. Allow WSL2 DNS over UDP
New-NetFirewallRule -DisplayName "OpenClaw: Allow WSL2 DNS UDP" `
    -Direction Outbound `
    -InterfaceAlias "vEthernet (WSL*)" `
    -RemotePort 53 `
    -Protocol UDP `
    -Action Allow `
    -Profile Any `
    -Description "Allow DNS resolution from WSL2"

Write-Host ""
Write-Host "Firewall rules created. Verify with:"
Write-Host "  Get-NetFirewallRule -DisplayName 'OpenClaw*' | Format-Table DisplayName, Direction, Action"
