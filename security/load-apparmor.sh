#!/usr/bin/env bash
# Load the openclaw-sandbox AppArmor profile into the WSL2 kernel.
# Must be run as root inside the WSL2 distro.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROFILE_SRC="${SCRIPT_DIR}/openclaw-sandbox-apparmor"
PROFILE_DST="/etc/apparmor.d/openclaw-sandbox"

if ! command -v apparmor_parser &>/dev/null; then
  echo "ERROR: apparmor_parser not found. Install apparmor:" >&2
  echo "  sudo apt-get install -y apparmor apparmor-utils" >&2
  exit 1
fi

if [ "$(id -u)" -ne 0 ]; then
  echo "ERROR: must be run as root (use sudo)" >&2
  exit 1
fi

echo "Copying profile to ${PROFILE_DST}..."
cp "${PROFILE_SRC}" "${PROFILE_DST}"

echo "Loading AppArmor profile..."
apparmor_parser -r -W "${PROFILE_DST}"

echo "Verifying profile is loaded..."
if aa-status 2>/dev/null | grep -q "openclaw-sandbox"; then
  echo "OK: openclaw-sandbox profile is loaded and enforcing."
else
  echo "WARNING: profile may not be active. Check 'aa-status' output." >&2
  exit 1
fi
