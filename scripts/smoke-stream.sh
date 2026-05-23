#!/usr/bin/env bash
# Manual end-to-end smoke for Phase 3.
#
# Requires the HUD dev server to be running on http://localhost:3000 with
# HUD_INGEST_TOKEN set (created by `pnpm hud:token`).
#
# Verifies:
#   1. /api/events rejects requests with no/invalid bearer token (401).
#   2. /api/events rejects malformed payloads (400 with Zod issues).
#   3. /api/events accepts a valid fixture (204) and appends to the JSONL log.
#   4. /api/stream streams the published event to a subscriber.
#   5. Two parallel subscribers both receive the same event.
#   6. /api/stream emits ': ping' heartbeat comments while idle.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

ENV_FILE="apps/hud/.env.local"
if [[ ! -f "$ENV_FILE" ]]; then
  echo "FAIL: $ENV_FILE missing. Run 'pnpm hud:token' first."
  exit 1
fi

# shellcheck disable=SC1090
set -a
. "$ENV_FILE"
set +a

if [[ -z "${HUD_INGEST_TOKEN:-}" ]]; then
  echo "FAIL: HUD_INGEST_TOKEN not set after sourcing $ENV_FILE."
  exit 1
fi

BASE_URL="${HUD_BASE_URL:-http://localhost:3000}"
FIXTURE="packages/contracts/tests/fixtures/session-start.json"
SECOND_FIXTURE="packages/contracts/tests/fixtures/turn-stop-ok.json"

if [[ ! -f "$FIXTURE" ]]; then
  echo "FAIL: fixture missing at $FIXTURE"
  exit 1
fi

TMP_DIR="$(mktemp -d -t hud-smoke.XXXXXX)"
trap 'kill $(jobs -p) 2>/dev/null || true; rm -rf "$TMP_DIR"' EXIT

step() { printf '\n--- %s ---\n' "$1"; }

step "1) No token => 401"
code=$(curl -s -o /dev/null -w '%{http_code}' \
  -X POST "$BASE_URL/api/events" \
  -H 'Content-Type: application/json' \
  -d "@$FIXTURE")
if [[ "$code" != "401" ]]; then
  echo "FAIL: expected 401, got $code"
  exit 1
fi
echo "PASS"

step "2) Bad token => 401"
code=$(curl -s -o /dev/null -w '%{http_code}' \
  -X POST "$BASE_URL/api/events" \
  -H 'Authorization: Bearer not-the-real-token-not-the-real-token-not-the-real-toke' \
  -H 'Content-Type: application/json' \
  -d "@$FIXTURE")
if [[ "$code" != "401" ]]; then
  echo "FAIL: expected 401, got $code"
  exit 1
fi
echo "PASS"

step "3) Malformed payload => 400 with Zod issues"
resp=$(curl -s -X POST "$BASE_URL/api/events" \
  -H "Authorization: Bearer $HUD_INGEST_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"type":"session.start"}')
if ! echo "$resp" | grep -q '"invalid_event"'; then
  echo "FAIL: expected invalid_event error, got: $resp"
  exit 1
fi
if ! echo "$resp" | grep -q '"issues"'; then
  echo "FAIL: expected issues array, got: $resp"
  exit 1
fi
echo "PASS (got Zod issues)"

step "4) Open two SSE subscribers, then POST a valid event"
curl -sN "$BASE_URL/api/stream" > "$TMP_DIR/sub1.log" &
SUB1=$!
curl -sN "$BASE_URL/api/stream" > "$TMP_DIR/sub2.log" &
SUB2=$!
sleep 1

code=$(curl -s -o /dev/null -w '%{http_code}' \
  -X POST "$BASE_URL/api/events" \
  -H "Authorization: Bearer $HUD_INGEST_TOKEN" \
  -H 'Content-Type: application/json' \
  -d "@$SECOND_FIXTURE")
if [[ "$code" != "204" ]]; then
  echo "FAIL: expected 204, got $code"
  exit 1
fi
sleep 1

if ! grep -q 'turn.stop' "$TMP_DIR/sub1.log"; then
  echo "FAIL: subscriber 1 did not receive event"
  cat "$TMP_DIR/sub1.log"
  exit 1
fi
if ! grep -q 'turn.stop' "$TMP_DIR/sub2.log"; then
  echo "FAIL: subscriber 2 did not receive event"
  cat "$TMP_DIR/sub2.log"
  exit 1
fi
echo "PASS (both subscribers received the event)"

step "5) JSONL log contains the event"
TODAY=$(date -u +%Y-%m-%d)
# Next.js runs with cwd at apps/hud, so the log is written there. Fall back to
# repo-root data/ for any caller that runs the HUD from the workspace root.
LOG_PATH=""
for candidate in "apps/hud/data/events-${TODAY}.jsonl" "data/events-${TODAY}.jsonl"; do
  if [[ -f "$candidate" ]]; then
    LOG_PATH="$candidate"
    break
  fi
done
if [[ -z "$LOG_PATH" ]]; then
  echo "FAIL: no events-${TODAY}.jsonl found under apps/hud/data/ or data/"
  exit 1
fi
if ! grep -q 'turn.stop' "$LOG_PATH"; then
  echo "FAIL: $LOG_PATH does not contain the published event"
  tail "$LOG_PATH"
  exit 1
fi
echo "PASS"

kill "$SUB1" "$SUB2" 2>/dev/null || true

step "6) Heartbeat within ~17s"
HEARTBEAT_OUT="$TMP_DIR/heartbeat.log"
# `curl --max-time` is portable across macOS and Linux; `timeout(1)` is GNU-only.
curl -sN --max-time 17 "$BASE_URL/api/stream" > "$HEARTBEAT_OUT" 2>/dev/null || true
if ! grep -q '^: ping' "$HEARTBEAT_OUT"; then
  echo "FAIL: no ': ping' heartbeat observed in 17s"
  cat "$HEARTBEAT_OUT"
  exit 1
fi
echo "PASS"

echo
echo "All Phase 3 smoke checks passed."
