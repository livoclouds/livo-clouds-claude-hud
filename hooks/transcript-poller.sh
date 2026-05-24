#!/usr/bin/env bash
# transcript-poller.sh — synthesises `turn.stop` events from Claude Code's
# per-session JSONL transcripts.
#
# Claude Code's hook payloads never carry token/cost/context fields on this
# machine (Stop hook is not firing with usage data), but the on-disk
# transcript at ~/.claude/projects/<encoded-cwd>/<sessionId>.jsonl records
# `message.usage` on every assistant turn. This sidecar tails those files,
# sums usage cumulatively per session, computes USD cost and context%
# against packages/contracts/src/pricing.json, and POSTs a `turn.stop` to
# the HUD ingest endpoint whenever a file changes. Together with the
# existing reducer (which replaces totals on each turn.stop), the HUD's
# TOKENS / COST / CONTEXT panels stay in sync with what Claude Code is
# actually consuming.
#
# Run it as a sidecar — apps/hud/instrumentation-node.ts auto-spawns it on
# server startup. Opt out with HUD_DISABLE_TRANSCRIPT_POLLER=1.
#
# Configuration is sourced from ~/.claude/livo-clouds-hud.env:
#   HUD_INGEST_TOKEN            (required) shared bearer token
#   HUD_URL                     (optional) defaults to http://127.0.0.1:3000
#   HUD_HOOK_LOG                (optional) defaults to ~/.claude/hud-hook.log
#   TRANSCRIPT_POLLER_INTERVAL  (optional) seconds between polls (default 2)
#   PROJECTS_DIR                (optional) defaults to ~/.claude/projects
#   TRANSCRIPT_STATE_DIR        (optional) defaults to ~/.claude/hud-transcript-state
#   PRICING_FILE                (optional) auto-detected next to the script
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

rotate_log() {
  local lp
  lp="$(log_path)"
  local size=0
  if [ -f "$lp" ]; then
    size="$(wc -c < "$lp" 2>/dev/null)" || size=0
  fi
  if [ "$size" -ge 10485760 ]; then
    [ -f "${lp}.2" ] && mv -f "${lp}.2" "${lp}.3" 2>/dev/null || true
    [ -f "${lp}.1" ] && mv -f "${lp}.1" "${lp}.2" 2>/dev/null || true
    mv -f "$lp" "${lp}.1" 2>/dev/null || true
  fi
}

bail() {
  log_line "${1:-turn.stop}" skip "${2:-unspecified}"
  exit 0
}

command -v jq   >/dev/null 2>&1 || bail turn.stop missing_jq
command -v curl >/dev/null 2>&1 || bail turn.stop missing_curl

if [ -f "$CONFIG_FILE" ]; then
  # shellcheck disable=SC1090
  . "$CONFIG_FILE"
else
  bail turn.stop missing_config
fi

: "${HUD_INGEST_TOKEN:=}"
: "${HUD_URL:=http://127.0.0.1:3000}"
: "${TRANSCRIPT_POLLER_INTERVAL:=2}"
: "${PROJECTS_DIR:=${HOME}/.claude/projects}"
: "${TRANSCRIPT_STATE_DIR:=${HOME}/.claude/hud-transcript-state}"
: "${PRICING_FILE:=}"

[ -n "$HUD_INGEST_TOKEN" ] || bail turn.stop missing_token

case "$TRANSCRIPT_POLLER_INTERVAL" in
  ''|*[!0-9]*) TRANSCRIPT_POLLER_INTERVAL=2 ;;
  *) [ "$TRANSCRIPT_POLLER_INTERVAL" -lt 1 ] && TRANSCRIPT_POLLER_INTERVAL=1 ;;
esac

# Locate pricing.json. The poller ships alongside packages/contracts so the
# shared file is always two directories up; allow PRICING_FILE override for
# tests or non-standard layouts.
if [ -z "$PRICING_FILE" ]; then
  SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
  for candidate in \
    "$SCRIPT_DIR/../packages/contracts/src/pricing.json" \
    "$SCRIPT_DIR/pricing.json"; do
    if [ -f "$candidate" ]; then
      PRICING_FILE="$candidate"
      break
    fi
  done
fi
if [ -z "$PRICING_FILE" ] || [ ! -f "$PRICING_FILE" ]; then
  bail turn.stop missing_pricing
fi
PRICING="$(cat "$PRICING_FILE")"

mkdir -p "$TRANSCRIPT_STATE_DIR" 2>/dev/null || bail turn.stop state_dir_unwritable

# Detect stat flavor once: macOS uses `-f`, GNU coreutils uses `-c`.
if stat -f '%m' / >/dev/null 2>&1; then
  STAT_MTIME_FMT='-f %m'
  STAT_SIZE_FMT='-f %z'
else
  STAT_MTIME_FMT='-c %Y'
  STAT_SIZE_FMT='-c %s'
fi

log_line turn.stop start "src=transcript interval=${TRANSCRIPT_POLLER_INTERVAL}s projects=$PROJECTS_DIR state=$TRANSCRIPT_STATE_DIR url=$HUD_URL"

trap 'log_line turn.stop stop "src=transcript signal"; exit 0' INT TERM

process_jsonl() {
  local jsonl="$1"
  local sid base size mtime state_file
  base="$(basename "$jsonl")"
  sid="${base%.jsonl}"
  # shellcheck disable=SC2086
  size="$(stat $STAT_SIZE_FMT "$jsonl" 2>/dev/null)"
  # shellcheck disable=SC2086
  mtime="$(stat $STAT_MTIME_FMT "$jsonl" 2>/dev/null)"
  [ -n "$size" ] && [ -n "$mtime" ] || return 0
  state_file="$TRANSCRIPT_STATE_DIR/$sid.json"

  # Skip if file hasn't changed since the last successful emit.
  if [ -f "$state_file" ]; then
    local prev_size prev_mtime
    prev_size="$(jq -r '.size // 0' "$state_file" 2>/dev/null)"
    prev_mtime="$(jq -r '.mtime // 0' "$state_file" 2>/dev/null)"
    if [ "$size" = "$prev_size" ] && [ "$mtime" = "$prev_mtime" ]; then
      return 0
    fi
  fi

  # Read every assistant record and sum usage cumulatively. `try fromjson
  # catch empty` discards malformed or partially-written trailing lines so a
  # session being actively written does not crash the pass.
  local agg
  agg="$(jq -R -s -c '
    def iso2ms:
      if . == null or . == "" then 0
      else (sub("\\.[0-9]+Z$"; "Z") | fromdateiso8601 * 1000)
      end;
    split("\n")
    | map(select(length > 0) | try fromjson catch empty)
    | map(select(.type == "assistant" and (.message.usage // null) != null))
    | if length == 0 then null
      else
        .[-1].message.usage as $last
        | {
          # Cumulative totals — these drive the TOKENS/COST cards which
          # measure spend over the whole session.
          in:            (map(.message.usage.input_tokens // 0)                | add),
          out:           (map(.message.usage.output_tokens // 0)               | add),
          cacheRead:     (map(.message.usage.cache_read_input_tokens // 0)     | add),
          cacheCreation: (map(.message.usage.cache_creation_input_tokens // 0) | add),
          # Last-turn snapshot — the CONTEXT ring shows how full the model
          # window is RIGHT NOW, which is approximately the last turn'\''s
          # cached + new tokens. Summing across turns would multi-count the
          # cache and instantly saturate to 100%.
          lastInput:         ($last.input_tokens                // 0),
          lastOutput:        ($last.output_tokens               // 0),
          lastCacheRead:     ($last.cache_read_input_tokens     // 0),
          lastCacheCreation: ($last.cache_creation_input_tokens // 0),
          model: (.[-1].message.model // ""),
          ts:    (.[-1].timestamp | iso2ms),
          cwd:   (.[-1].cwd // "")
        }
      end
  ' "$jsonl" 2>/dev/null)"

  if [ -z "$agg" ] || [ "$agg" = "null" ]; then
    # File exists but has no assistant turns yet (e.g. session just started).
    # Persist the size/mtime so we don't re-parse on every tick.
    jq -n --argjson size "$size" --argjson mtime "$mtime" \
      '{ size: $size, mtime: $mtime, emitted: false }' > "$state_file" 2>/dev/null || true
    return 0
  fi

  local total_in total_out cache_read cache_creation model cwd ts
  local last_in last_out last_cr last_cc
  total_in="$(jq -r '.in // 0' <<<"$agg")"
  total_out="$(jq -r '.out // 0' <<<"$agg")"
  cache_read="$(jq -r '.cacheRead // 0' <<<"$agg")"
  cache_creation="$(jq -r '.cacheCreation // 0' <<<"$agg")"
  last_in="$(jq -r '.lastInput // 0' <<<"$agg")"
  last_out="$(jq -r '.lastOutput // 0' <<<"$agg")"
  last_cr="$(jq -r '.lastCacheRead // 0' <<<"$agg")"
  last_cc="$(jq -r '.lastCacheCreation // 0' <<<"$agg")"
  model="$(jq -r '.model // ""' <<<"$agg")"
  cwd="$(jq -r '.cwd // ""' <<<"$agg")"
  ts="$(jq -r '.ts // 0' <<<"$agg")"

  [ "$ts" -gt 0 ] || ts="$(date +%s)000"

  # Look up pricing row by model prefix; fall back to the table's default
  # (Sonnet pricing) so we always have numbers.
  local row in_rate out_rate cw_rate cr_rate context_window
  row="$(printf '%s' "$PRICING" | jq -c --arg model "$model" '
    (.models[] | select(.match as $m | $model | startswith($m)) // empty) // .fallback
  ' 2>/dev/null)"
  [ -n "$row" ] && [ "$row" != "null" ] || row="$(printf '%s' "$PRICING" | jq -c '.fallback')"
  in_rate="$(jq -r '.inputPerMTok' <<<"$row")"
  out_rate="$(jq -r '.outputPerMTok' <<<"$row")"
  cw_rate="$(jq -r '.cacheWritePerMTok' <<<"$row")"
  cr_rate="$(jq -r '.cacheReadPerMTok' <<<"$row")"
  context_window="$(jq -r '.contextWindow' <<<"$row")"

  local cost
  cost="$(awk -v ti="$total_in" -v to="$total_out" -v cr="$cache_read" -v cc="$cache_creation" \
                -v ir="$in_rate" -v orr="$out_rate" -v cwr="$cw_rate" -v crr="$cr_rate" \
                'BEGIN { printf "%.6f", (ti*ir + to*orr + cr*crr + cc*cwr) / 1000000 }')"

  local total_cached=$((cache_read + cache_creation))
  # Current context occupancy = last turn's input + cache_read + cache_creation
  # + output. This matches what users see in Claude Code's status line and
  # never exceeds 100% under normal use.
  local context_now=$((last_in + last_out + last_cr + last_cc))
  local ctx_pct
  ctx_pct="$(awk -v t="$context_now" -v w="$context_window" 'BEGIN {
    if (w <= 0) { print 0; exit }
    p = (t / w) * 100
    if (p > 100) p = 100
    printf "%.4f", p
  }')"

  # Build the HudEvent. The hook contract requires `tokens.in`/`tokens.out`
  # to be present together; cached is optional but we always send the
  # combined cache_read + cache_creation so the dashboard shows real numbers
  # for cached usage.
  local event_json
  event_json="$(jq -n \
    --arg sid "$sid" \
    --argjson ts "$ts" \
    --arg model "$model" \
    --arg cwd "$cwd" \
    --argjson tIn "$total_in" \
    --argjson tOut "$total_out" \
    --argjson tCached "$total_cached" \
    --argjson cost "$cost" \
    --argjson ctx "$ctx_pct" \
    '{
      type: "turn.stop",
      sessionId: $sid,
      ts: $ts,
      cwd: ($cwd | if . == "" then null else . end),
      model: ($model | if . == "" then null else . end),
      tokens: { in: $tIn, out: $tOut, cached: $tCached },
      costUsd: $cost,
      contextPct: $ctx
    }
    | with_entries(select(.value != null))')"

  local http
  http="$(printf '%s' "$event_json" | curl -sS -o /dev/null -w '%{http_code}' \
    --max-time 5 \
    -X POST \
    -H "Authorization: Bearer ${HUD_INGEST_TOKEN}" \
    -H 'Content-Type: application/json' \
    --data-binary @- \
    "${HUD_URL%/}/api/events" 2>/dev/null)" || http=""

  if [ "$http" = "200" ] || [ "$http" = "204" ]; then
    log_line turn.stop ok "src=transcript sid=${sid:0:8} in=$total_in out=$total_out cached=$total_cached cost=$cost"
    jq -n \
      --argjson size "$size" \
      --argjson mtime "$mtime" \
      --argjson tIn "$total_in" \
      --argjson tOut "$total_out" \
      --argjson cacheRead "$cache_read" \
      --argjson cacheCreation "$cache_creation" \
      --arg model "$model" \
      --arg cwd "$cwd" \
      --argjson lastTs "$ts" \
      '{
        size: $size,
        mtime: $mtime,
        tokensIn: $tIn,
        tokensOut: $tOut,
        cacheRead: $cacheRead,
        cacheCreation: $cacheCreation,
        model: $model,
        cwd: $cwd,
        lastTs: $lastTs,
        emitted: true
      }' > "$state_file" 2>/dev/null || true
  else
    log_line turn.stop fail "src=transcript http=${http:-error} sid=${sid:0:8}"
    # Do not persist state — next tick will retry.
  fi
}

while true; do
  rotate_log
  if [ -d "$PROJECTS_DIR" ]; then
    # Only scan files touched in the last day — older sessions are dead.
    # -maxdepth 3 covers the typical "<projects>/<encoded-cwd>/<sid>.jsonl"
    # layout plus the occasional nested directory.
    while IFS= read -r jsonl; do
      [ -z "$jsonl" ] && continue
      process_jsonl "$jsonl"
    done < <(find "$PROJECTS_DIR" -maxdepth 3 -name '*.jsonl' -type f -mtime -1 2>/dev/null)
  fi
  sleep "$TRANSCRIPT_POLLER_INTERVAL"
done
