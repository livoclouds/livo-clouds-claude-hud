#!/usr/bin/env bash
# Rotate the primary X11 output for the kiosk if ROTATE is set.
#
# Sourced by kiosk.service before Chromium launches. Exits 0 on any
# unexpected condition so a missing or misconfigured ROTATE never blocks
# the kiosk from starting.
#
# Reads ROTATE from ~/.config/livo-clouds-hud-kiosk.env (or the
# environment, if the unit already sourced it). Valid values:
#   normal | left | right | inverted
#
# Touch-coordinate remapping after rotation is documented in
# docs/v1/setup/setup-raspberry-pi-kiosk.md (xinput coordinate transform).

set -u

CONFIG_FILE="$HOME/.config/livo-clouds-hud-kiosk.env"

log() { printf '[xrandr-rotate] %s\n' "$*"; }

if [ -f "$CONFIG_FILE" ]; then
  # shellcheck disable=SC1090
  . "$CONFIG_FILE"
fi

ROTATE="${ROTATE:-}"

if [ -z "$ROTATE" ]; then
  exit 0
fi

case "$ROTATE" in
  normal|left|right|inverted) ;;
  *)
    log "ignoring invalid ROTATE='$ROTATE' (expected: normal|left|right|inverted)"
    exit 0
    ;;
esac

if ! command -v xrandr >/dev/null 2>&1; then
  log "xrandr not found — skipping rotation"
  exit 0
fi

OUTPUT="$(xrandr 2>/dev/null | awk '/ connected /{print $1; exit}')"

if [ -z "${OUTPUT:-}" ]; then
  log "no connected output detected — skipping rotation"
  exit 0
fi

log "rotating $OUTPUT to $ROTATE"
xrandr --output "$OUTPUT" --rotate "$ROTATE" || {
  log "xrandr rotation failed (continuing without rotation)"
  exit 0
}
