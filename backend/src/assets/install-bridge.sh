#!/bin/bash
# Gymind Secure Bridge — Linux Installer
# Run this script from the extracted zip folder.
#
# Usage:
#   unzip gymind-bridge-linux.zip
#   cd gymind-bridge
#   bash install.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BRIDGE_FILE="$SCRIPT_DIR/gymind-bridge.js"

echo ""
echo "  ╔══════════════════════════════════════╗"
echo "  ║   Gymind Secure Bridge — Installer   ║"
echo "  ╚══════════════════════════════════════╝"
echo ""

# --- Verify bridge file exists ---
if [ ! -f "$BRIDGE_FILE" ]; then
    echo "[!] gymind-bridge.js not found in $SCRIPT_DIR"
    echo "    Make sure you extracted the full zip and are running from that folder."
    exit 1
fi

# --- Check for Node.js ---
if ! command -v node &> /dev/null; then
    echo "[*] Node.js not found. Installing via NodeSource..."

    if command -v apt-get &> /dev/null; then
        curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
        sudo apt-get install -y nodejs
    elif command -v yum &> /dev/null; then
        curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
        sudo yum install -y nodejs
    elif command -v dnf &> /dev/null; then
        curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
        sudo dnf install -y nodejs
    else
        echo "[!] Could not detect package manager. Please install Node.js 18+ manually."
        echo "    https://nodejs.org/en/download/"
        exit 1
    fi

    echo "[+] Node.js $(node --version) installed."
else
    NODE_VERSION=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
    if [ "$NODE_VERSION" -lt 18 ]; then
        echo "[!] Node.js $(node --version) is too old. Version 18+ is required."
        echo "    Please upgrade: https://nodejs.org/en/download/"
        exit 1
    fi
    echo "[+] Node.js $(node --version) found."
fi

echo "[+] Bridge file: $BRIDGE_FILE"

# --- Launch setup wizard ---
echo ""
echo "[*] Launching setup wizard..."
echo "    If your browser doesn't open automatically,"
echo "    visit: http://localhost:3901"
echo ""

cd "$SCRIPT_DIR"
node gymind-bridge.js --setup
