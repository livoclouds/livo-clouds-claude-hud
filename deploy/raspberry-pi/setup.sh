#!/usr/bin/env bash
# Claude Code HUD — Raspberry Pi 5 kiosk bootstrap.
#
# Idempotent. Safe to re-run. Installs apt dependencies, drops the kiosk
# systemd user unit and the rotation helper into the calling user's home,
# enables linger so the unit starts at boot without an interactive login,
# and writes a config template at ~/.config/livo-clouds-hud-kiosk.env.
#
# This script never embeds secrets. The Pi only needs the public HUD URL
# (HUD_INGEST_TOKEN stays on the dev machine that runs Claude Code).
#
# See docs/v1/setup/setup-raspberry-pi-kiosk.md for the full operator guide.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

log() { printf '[kiosk-setup] %s\n' "$*"; }
err() { printf '[kiosk-setup] error: %s\n' "$*" >&2; }

if [ "$(id -u)" -eq 0 ]; then
  err "do not run as root — systemd --user units must be installed for a real user"
  err "re-run as the kiosk user (commonly 'pi'): bash deploy/raspberry-pi/setup.sh"
  exit 1
fi

if ! command -v apt-get >/dev/null 2>&1; then
  err "apt-get not found — this script targets Raspberry Pi OS (Debian-based)"
  exit 1
fi

KIOSK_USER="$USER"
KIOSK_HOME="$HOME"
CONFIG_DIR="$KIOSK_HOME/.config"
CONFIG_FILE="$CONFIG_DIR/livo-clouds-hud-kiosk.env"
SYSTEMD_USER_DIR="$CONFIG_DIR/systemd/user"
LOCAL_BIN="$KIOSK_HOME/.local/bin"
UNIT_NAME="kiosk.service"

APT_PACKAGES=(
  chromium-browser
  unclutter
  x11-xserver-utils
  xdotool
  xinput
  xserver-xorg
)

log "installing apt packages: ${APT_PACKAGES[*]}"
sudo apt-get update
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y "${APT_PACKAGES[@]}"

log "ensuring directories exist"
mkdir -p "$CONFIG_DIR" "$SYSTEMD_USER_DIR" "$LOCAL_BIN"

if [ ! -f "$CONFIG_FILE" ]; then
  log "writing config template at $CONFIG_FILE"
  cat >"$CONFIG_FILE" <<'EOF'
# Claude Code HUD kiosk configuration.
#
# HUD_URL is the public HUD address reachable from this Pi on the LAN
# (or via Tailscale). Example: http://hud.local:3000/ or http://192.168.1.20:3000/.
#
# ROTATE is optional. Leave empty for landscape. Valid: normal, left, right, inverted.
# Use 'left' or 'right' for portrait-mounted panels.
HUD_URL=
ROTATE=
EOF
  chmod 600 "$CONFIG_FILE"
else
  log "config file already present at $CONFIG_FILE (left untouched)"
fi

log "installing $UNIT_NAME → $SYSTEMD_USER_DIR/"
install -m 0644 "$SCRIPT_DIR/kiosk.service" "$SYSTEMD_USER_DIR/$UNIT_NAME"

log "installing xrandr-rotate.sh → $LOCAL_BIN/"
install -m 0755 "$SCRIPT_DIR/xrandr-rotate.sh" "$LOCAL_BIN/xrandr-rotate.sh"

log "enabling linger for $KIOSK_USER (user systemd at boot)"
if ! loginctl show-user "$KIOSK_USER" 2>/dev/null | grep -q '^Linger=yes$'; then
  sudo loginctl enable-linger "$KIOSK_USER"
else
  log "linger already enabled"
fi

log "reloading user systemd daemon"
systemctl --user daemon-reload

log "enabling $UNIT_NAME"
systemctl --user enable "$UNIT_NAME"

cat <<EOF

[kiosk-setup] done.

Next steps:

  1. Edit the config file and set HUD_URL (and optionally ROTATE):
       \$EDITOR $CONFIG_FILE

  2. Apply now without rebooting:
       systemctl --user restart $UNIT_NAME

     Or reboot to verify the full unattended boot path:
       sudo reboot

  3. Tail logs:
       journalctl --user -u $UNIT_NAME -f

See docs/v1/setup/setup-raspberry-pi-kiosk.md for autologin, X11/Wayland,
hardware notes, and troubleshooting.
EOF
