#!/usr/bin/env bash
# synth-event.sh — post a synthetic HudEvent to a running HUD ingest endpoint.
#
# Usage:
#   ./synth-event.sh <type> [arg]
#
# Types:
#   session.start            Start a new fake session (also rotates the cached id)
#   session.end              End the current session (with sample totals)
#   prompt.submit            Send a user-prompt event
#   tool.use [Name]          Send a tool.use event (defaults to "Bash")
#   turn.stop [ctx]          Send a turn.stop with sample tokens/cost (ctx default 38)
#   error [message]          Send an error event
#
# Environment:
#   HUD_INGEST_URL   default http://localhost:3000/api/events
#   HUD_INGEST_TOKEN required; if unset, read from apps/hud/.env.local
#
# The script caches a session id in $TMPDIR/hud-synth-session so successive
# events affect the same session card.

set -euo pipefail

INGEST_URL="${HUD_INGEST_URL:-http://localhost:3000/api/events}"

resolve_token() {
  if [[ -n "${HUD_INGEST_TOKEN:-}" ]]; then
    printf '%s' "$HUD_INGEST_TOKEN"
    return
  fi
  local script_dir env_file
  script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  env_file="${script_dir}/../.env.local"
  if [[ -f "$env_file" ]]; then
    local value
    # awk avoids the SIGPIPE-prone `grep | head | cut` chain.
    value="$(awk -F= '/^HUD_INGEST_TOKEN=/{ sub(/^HUD_INGEST_TOKEN=/, ""); print; exit }' "$env_file")"
    if [[ -n "$value" ]]; then
      printf '%s' "$value"
      return
    fi
  fi
  echo "synth-event: HUD_INGEST_TOKEN not set and not found in .env.local" >&2
  exit 1
}

TOKEN="$(resolve_token)"
SESSION_FILE="${TMPDIR:-/tmp}/hud-synth-session"

ensure_session_id() {
  if [[ ! -f "$SESSION_FILE" ]]; then
    rotate_session_id
  fi
  cat "$SESSION_FILE"
}

rotate_session_id() {
  # openssl is preinstalled on macOS and most Linux distros; no SIGPIPE risk.
  local rand id
  rand="$(openssl rand -hex 4 2>/dev/null || printf '%08x' "$RANDOM$RANDOM")"
  id="synth-$(date +%s)-${rand}"
  printf '%s' "$id" > "$SESSION_FILE"
}

now_ms() {
  python3 -c 'import time; print(int(time.time()*1000))'
}

post() {
  local payload="$1"
  local status
  status="$(curl -sS -o /tmp/hud-synth-resp -w '%{http_code}' \
    -X POST "$INGEST_URL" \
    -H "Authorization: Bearer ${TOKEN}" \
    -H 'Content-Type: application/json' \
    -d "$payload" || true)"
  if [[ "$status" != "204" ]]; then
    echo "synth-event: HTTP $status" >&2
    cat /tmp/hud-synth-resp >&2 || true
    echo >&2
    exit 1
  fi
}

TYPE="${1:-}"
ARG="${2:-}"

if [[ -z "$TYPE" ]]; then
  echo "Usage: $0 <type> [arg]" >&2
  exit 2
fi

if [[ "$TYPE" == "session.start" ]]; then
  rotate_session_id
fi

SID="$(ensure_session_id)"
TS="$(now_ms)"
CWD="/Users/dev/Code/sample-project"
MODEL="claude-opus-4-7"

case "$TYPE" in
  session.start)
    payload=$(printf '{"type":"session.start","sessionId":"%s","ts":%s,"cwd":"%s","model":"%s"}' \
      "$SID" "$TS" "$CWD" "$MODEL")
    ;;
  session.end)
    payload=$(printf '{"type":"session.end","sessionId":"%s","ts":%s,"cwd":"%s","model":"%s","tokens":{"in":48230,"out":12117,"cached":31002},"costUsd":1.4823,"durationMs":7212345}' \
      "$SID" "$TS" "$CWD" "$MODEL")
    ;;
  prompt.submit)
    payload=$(printf '{"type":"prompt.submit","sessionId":"%s","ts":%s,"cwd":"%s","model":"%s"}' \
      "$SID" "$TS" "$CWD" "$MODEL")
    ;;
  tool.use)
    NAME="${ARG:-Bash}"
    payload=$(printf '{"type":"tool.use","sessionId":"%s","ts":%s,"cwd":"%s","model":"%s","tool":"%s","toolInput":{"command":"pnpm test"},"durationMs":4821}' \
      "$SID" "$TS" "$CWD" "$MODEL" "$NAME")
    ;;
  turn.stop)
    CTX="${ARG:-38}"
    # Use random-ish but bounded sample tokens so successive turn.stop calls
    # produce visible counter changes (latest-snapshot semantics in the reducer).
    IN=$((10000 + RANDOM % 5000))
    OUT=$((1500 + RANDOM % 1500))
    CACHED=$((6000 + RANDOM % 3000))
    COST="$(awk -v i=$IN -v o=$OUT 'BEGIN{printf "%.4f", (i*0.000003 + o*0.000015)}')"
    payload=$(printf '{"type":"turn.stop","sessionId":"%s","ts":%s,"cwd":"%s","model":"%s","tokens":{"in":%d,"out":%d,"cached":%d},"costUsd":%s,"contextPct":%s,"durationMs":9123}' \
      "$SID" "$TS" "$CWD" "$MODEL" "$IN" "$OUT" "$CACHED" "$COST" "$CTX")
    ;;
  error)
    MSG="${ARG:-Permission denied: command not allowed by sandbox}"
    # Escape double quotes in the message via parameter expansion.
    SAFE_MSG="${MSG//\"/\\\"}"
    payload=$(printf '{"type":"error","sessionId":"%s","ts":%s,"cwd":"%s","model":"%s","tool":"Bash","message":"%s"}' \
      "$SID" "$TS" "$CWD" "$MODEL" "$SAFE_MSG")
    ;;
  *)
    echo "Unknown type: $TYPE" >&2
    exit 2
    ;;
esac

post "$payload"
echo "ok: ${TYPE} → ${INGEST_URL} (session=${SID})"
