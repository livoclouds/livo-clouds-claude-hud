#!/usr/bin/env bash
# sessions-poller.sh — pushes ~/.claude/sessions/*.json to the HUD.
#
# Claude Code stores one JSON file per running session in ~/.claude/sessions.
# That directory is the source of truth that powers the terminal `/agents`
# view (each entry contains pid, sessionId, name, cwd, status, kind, etc.).
# Hooks fire only for the current session and do not include the `name`
# field, so this poller exists as a sidecar: it scans the directory on a
# fixed interval and POSTs a `sessions.snapshot` event to the HUD ingest
# endpoint whenever the on-disk state changes.
#
# Run it as a background process on the Mac that hosts Claude Code:
#   nohup hooks/sessions-poller.sh >/dev/null 2>&1 &
# or via launchd. It is intentionally simple — no daemonization, no PID
# file. Kill it with `pkill -f sessions-poller.sh` when you no longer need
# the sessions dashboard.
#
# Configuration is sourced from ~/.claude/livo-clouds-hud.env (same file the
# main claude-hook.sh uses):
#   HUD_INGEST_TOKEN          (required) shared bearer token
#   HUD_URL                   (optional) defaults to http://127.0.0.1:3000
#   HUD_HOOK_LOG              (optional) defaults to ~/.claude/hud-hook.log
#   SESSIONS_POLLER_INTERVAL  (optional) seconds between polls (default 2)
#   SESSIONS_DIR              (optional) defaults to ~/.claude/sessions
#
# The bearer token is never written to the log or to stderr.

set -u

CONFIG_FILE="${HOME}/.claude/livo-clouds-hud.env"
HUD_HOOK_LOG_DEFAULT="${HOME}/.claude/hud-hook.log"

log_path() {
  printf '%s' "${HUD_HOOK_LOG:-$HUD_HOOK_LOG_DEFAULT}"
}

log_line() {
  local type="$1"
  local status="$2"
  local note="${3:-}"
  local ts
  ts="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  local lp
  lp="$(log_path)"
  mkdir -p "$(dirname "$lp")" 2>/dev/null || true
  if [ -n "$note" ]; then
    printf 'ts=%s type=%s status=%s note=%s\n' "$ts" "$type" "$status" "$note" >>"$lp" 2>/dev/null || true
  else
    printf 'ts=%s type=%s status=%s\n' "$ts" "$type" "$status" >>"$lp" 2>/dev/null || true
  fi
}

bail() {
  log_line "${1:-sessions.snapshot}" skip "${2:-unspecified}"
  exit 0
}

command -v jq   >/dev/null 2>&1 || bail sessions.snapshot missing_jq
command -v curl >/dev/null 2>&1 || bail sessions.snapshot missing_curl

if [ -f "$CONFIG_FILE" ]; then
  # shellcheck disable=SC1090
  . "$CONFIG_FILE"
else
  bail sessions.snapshot missing_config
fi

: "${HUD_INGEST_TOKEN:=}"
: "${HUD_URL:=http://127.0.0.1:3000}"
: "${SESSIONS_POLLER_INTERVAL:=2}"
: "${SESSIONS_DIR:=${HOME}/.claude/sessions}"

[ -n "$HUD_INGEST_TOKEN" ] || bail sessions.snapshot missing_token

# Validate interval — fall back to 2s if it is not a positive integer.
case "$SESSIONS_POLLER_INTERVAL" in
  ''|*[!0-9]*) SESSIONS_POLLER_INTERVAL=2 ;;
  *) [ "$SESSIONS_POLLER_INTERVAL" -lt 1 ] && SESSIONS_POLLER_INTERVAL=2 ;;
esac

log_line sessions.snapshot start "interval=${SESSIONS_POLLER_INTERVAL}s dir=$SESSIONS_DIR url=$HUD_URL"

# Terminate cleanly on SIGINT/SIGTERM so the calling shell isn't blocked.
trap 'log_line sessions.snapshot stop signal; exit 0' INT TERM

PREV_HASH=""

build_snapshot() {
  # If the sessions dir doesn't exist or is empty, emit an empty snapshot.
  if [ ! -d "$SESSIONS_DIR" ]; then
    printf '{"type":"sessions.snapshot","ts":%d,"sessions":[]}' "$(date +%s)000"
    return 0
  fi

  # Use a glob expansion guarded by nullglob semantics. Bash on macOS doesn't
  # have nullglob by default, so we check the literal pattern.
  local files=( "$SESSIONS_DIR"/*.json )
  if [ ! -e "${files[0]}" ]; then
    printf '{"type":"sessions.snapshot","ts":%d,"sessions":[]}' "$(date +%s)000"
    return 0
  fi

  # Build the sessions array. Each on-disk file is a single JSON object.
  # `--slurp` reads them all into a top-level array; we then filter to
  # entries that have the minimum required fields and project the schema.
  # Missing optional fields are omitted via `with_entries(select(.value != null))`.
  jq --slurpfile _now <(printf '[%d]' "$(date +%s)000") -s '
    {
      type: "sessions.snapshot",
      ts: $_now[0][0],
      sessions: (
        [ .[]
          | select(.sessionId != null and .name != null and .cwd != null
                   and .status != null and .kind != null
                   and .pid != null and .startedAt != null and .updatedAt != null)
          | {
              pid: .pid,
              sessionId: .sessionId,
              name: .name,
              cwd: .cwd,
              status: .status,
              kind: .kind,
              agent: .agent,
              version: .version,
              startedAt: .startedAt,
              updatedAt: .updatedAt
            }
          | with_entries(select(.value != null))
        ]
      )
    }
  ' "${files[@]}" 2>/dev/null
}

hash_snapshot() {
  # shasum is present on macOS and most Linux distros; fall back to md5.
  if command -v shasum >/dev/null 2>&1; then
    shasum -a 256 | awk '{print $1}'
  else
    md5sum | awk '{print $1}'
  fi
}

while true; do
  SNAPSHOT="$(build_snapshot)"
  if [ -n "$SNAPSHOT" ]; then
    # Strip the volatile `ts` field before hashing so the hash only changes
    # when actual session state changes — otherwise we'd POST every tick.
    HASH="$(printf '%s' "$SNAPSHOT" | jq -c '.sessions' 2>/dev/null | hash_snapshot)"
    if [ -n "$HASH" ] && [ "$HASH" != "$PREV_HASH" ]; then
      HTTP="$(curl -sS -o /dev/null -w '%{http_code}' \
        --max-time 5 \
        -X POST \
        -H "Authorization: Bearer ${HUD_INGEST_TOKEN}" \
        -H 'Content-Type: application/json' \
        -d "$SNAPSHOT" \
        "${HUD_URL%/}/api/events" 2>/dev/null)" || HTTP=""
      if [ "$HTTP" = "200" ] || [ "$HTTP" = "204" ]; then
        log_line sessions.snapshot ok "count=$(printf '%s' "$SNAPSHOT" | jq -r '.sessions|length' 2>/dev/null)"
        PREV_HASH="$HASH"
      else
        log_line sessions.snapshot fail "http=${HTTP:-error}"
      fi
    fi
  fi
  sleep "$SESSIONS_POLLER_INTERVAL"
done
