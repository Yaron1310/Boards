# Gymind Secure Bridge - Windows Installer
# Run this script from the extracted zip folder.
#
# Usage:
#   Expand-Archive gymind-bridge-windows.zip -DestinationPath gymind-bridge
#   cd gymind-bridge
#   .\install.ps1

$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$BridgeFile = Join-Path $ScriptDir "gymind-bridge.js"

Write-Host ""
Write-Host "  +======================================+" -ForegroundColor Cyan
Write-Host "  |   Gymind Secure Bridge - Installer   |" -ForegroundColor Cyan
Write-Host "  +======================================+" -ForegroundColor Cyan
Write-Host ""

# --- Verify bridge file exists ---
if (-not (Test-Path $BridgeFile)) {
    Write-Host "[!] gymind-bridge.js not found in $ScriptDir" -ForegroundColor Red
    Write-Host "    Make sure you extracted the full zip and are running from that folder." -ForegroundColor Red
    exit 1
}

# --- Check for Node.js ---
$nodeCmd = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodeCmd) {
    Write-Host "[*] Node.js not found. Installing..." -ForegroundColor Yellow

    $wingetCmd = Get-Command winget -ErrorAction SilentlyContinue
    if ($wingetCmd) {
        Write-Host "[*] Installing Node.js via winget..."
        winget install OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements
    } else {
        $chocoCmd = Get-Command choco -ErrorAction SilentlyContinue
        if ($chocoCmd) {
            Write-Host "[*] Installing Node.js via Chocolatey..."
            choco install nodejs-lts -y
        } else {
            Write-Host "[!] Could not auto-install Node.js." -ForegroundColor Red
            Write-Host "    Please install Node.js 18+ from: https://nodejs.org/en/download/" -ForegroundColor Red
            exit 1
        }
    }

    # Refresh PATH
    $env:PATH = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")

    $nodeCmd = Get-Command node -ErrorAction SilentlyContinue
    if (-not $nodeCmd) {
        Write-Host "[!] Node.js was installed but not found in PATH." -ForegroundColor Red
        Write-Host "    Please restart PowerShell and run this script again." -ForegroundColor Red
        exit 1
    }

    Write-Host "[+] Node.js $(node --version) installed." -ForegroundColor Green
} else {
    $nodeVersion = (node --version).Replace("v", "").Split(".")[0]
    if ([int]$nodeVersion -lt 18) {
        Write-Host "[!] Node.js $(node --version) is too old. Version 18+ is required." -ForegroundColor Red
        Write-Host "    Please upgrade: https://nodejs.org/en/download/" -ForegroundColor Red
        exit 1
    }
    Write-Host "[+] Node.js $(node --version) found." -ForegroundColor Green
}

Write-Host "[+] Bridge file: $BridgeFile" -ForegroundColor Green

# --- Launch setup wizard ---
Write-Host ""
Write-Host "[*] Launching setup wizard..." -ForegroundColor Cyan
Write-Host "    If your browser doesn't open automatically,"
Write-Host "    visit: http://localhost:3901"
Write-Host ""

Set-Location $ScriptDir
node gymind-bridge.js --setup
