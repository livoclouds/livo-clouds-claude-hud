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

mkdir -p "$TRANSCRIPT_STATE_DIR" 2>/dev/null
if [ ! -d "$TRANSCRIPT_STATE_DIR" ] || [ ! -w "$TRANSCRIPT_STATE_DIR" ]; then
  log_line turn.stop fatal state_dir_unwritable
  exit 1
fi

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

  # Load persisted incremental state. All fields default to zero/empty so a
  # fresh or missing state file triggers a full read from offset 0.
  local prev_offset prev_in prev_out prev_cacheRead prev_cacheCreation
  local prev_lastIn prev_lastOut prev_lastCR prev_lastCC prev_model prev_cwd prev_ts
  prev_offset=0; prev_in=0; prev_out=0; prev_cacheRead=0; prev_cacheCreation=0
  prev_lastIn=0; prev_lastOut=0; prev_lastCR=0; prev_lastCC=0
  prev_model=""; prev_cwd=""; prev_ts=0

  if [ -f "$state_file" ]; then
    local _st
    _st="$(jq -r '
      [(.offset // 0),
       (.tokensIn // 0), (.tokensOut // 0),
       (.cacheRead // 0), (.cacheCreation // 0),
       (.lastInput // 0), (.lastOutput // 0),
       (.lastCacheRead // 0), (.lastCacheCreation // 0),
       (.model // ""), (.cwd // ""), (.lastTs // 0)]
      | .[]
    ' "$state_file" 2>/dev/null)"
    if [ -n "$_st" ]; then
      IFS=$'\n' read -r prev_offset \
        prev_in prev_out prev_cacheRead prev_cacheCreation \
        prev_lastIn prev_lastOut prev_lastCR prev_lastCC \
        prev_model prev_cwd prev_ts \
        <<< "$_st"
    fi
  fi

  # Sanitise numeric fields against corrupt state.
  case "$prev_offset"        in ''|*[!0-9]*) prev_offset=0        ;; esac
  case "$prev_in"            in ''|*[!0-9]*) prev_in=0            ;; esac
  case "$prev_out"           in ''|*[!0-9]*) prev_out=0           ;; esac
  case "$prev_cacheRead"     in ''|*[!0-9]*) prev_cacheRead=0     ;; esac
  case "$prev_cacheCreation" in ''|*[!0-9]*) prev_cacheCreation=0 ;; esac
  case "$prev_lastIn"        in ''|*[!0-9]*) prev_lastIn=0        ;; esac
  case "$prev_lastOut"       in ''|*[!0-9]*) prev_lastOut=0       ;; esac
  case "$prev_lastCR"        in ''|*[!0-9]*) prev_lastCR=0        ;; esac
  case "$prev_lastCC"        in ''|*[!0-9]*) prev_lastCC=0        ;; esac
  case "$prev_ts"            in ''|*[!0-9]*) prev_ts=0            ;; esac

  # Detect file truncation or replacement: current size below saved offset.
  if [ "$size" -lt "$prev_offset" ] 2>/dev/null; then
    prev_offset=0; prev_in=0; prev_out=0; prev_cacheRead=0; prev_cacheCreation=0
    prev_lastIn=0; prev_lastOut=0; prev_lastCR=0; prev_lastCC=0
    prev_model=""; prev_cwd=""; prev_ts=0
  fi

  # Read only new bytes since the previous offset.
  # tail -c +N reads from byte N (1-indexed): +1 = start of file.
  local new_chunk
  new_chunk="$(tail -c +$((prev_offset + 1)) "$jsonl" 2>/dev/null)"

  # Separate complete lines (up to and including the last \n) from any
  # trailing partial line that is still being written by the active session.
  local complete_part complete_bytes
  complete_bytes=0; complete_part=""
  case "$new_chunk" in
    *$'\n'*)
      local incomplete_suffix total_new_bytes incomplete_bytes_val
      incomplete_suffix="${new_chunk##*$'\n'}"
      total_new_bytes="$(printf '%s' "$new_chunk"         | wc -c | tr -d ' ')"
      incomplete_bytes_val="$(printf '%s' "$incomplete_suffix" | wc -c | tr -d ' ')"
      complete_bytes=$((total_new_bytes - incomplete_bytes_val))
      complete_part="${new_chunk%"$incomplete_suffix"}"
      ;;
  esac

  # No complete lines yet — partial line still arriving. Retry next tick.
  if [ "$complete_bytes" -eq 0 ]; then
    return 0
  fi

  local new_offset=$((prev_offset + complete_bytes))

  # Parse new assistant turns from the complete lines only (one JSON object
  # per output line). Malformed or non-assistant lines are silently dropped.
  local new_turns_json
  new_turns_json="$(printf '%s' "$complete_part" | jq -Rc '
    def iso2ms:
      if . == null or . == "" then 0
      else (sub("\\.[0-9]+Z$"; "Z") | fromdateiso8601 * 1000)
      end;
    (try fromjson catch null) as $o
    | select($o != null
        and $o.type == "assistant"
        and ($o.message.usage // null) != null)
    | {
        in:            ($o.message.usage.input_tokens                // 0),
        out:           ($o.message.usage.output_tokens               // 0),
        cacheRead:     ($o.message.usage.cache_read_input_tokens     // 0),
        cacheCreation: ($o.message.usage.cache_creation_input_tokens // 0),
        model:         ($o.message.model // ""),
        ts:            ($o.timestamp | iso2ms),
        cwd:           ($o.cwd // "")
      }
  ' 2>/dev/null)"

  # No new assistant turns in the new chunk — advance offset so we skip these
  # bytes on the next tick, but do not POST a duplicate event.
  if [ -z "$new_turns_json" ]; then
    jq -n \
      --argjson size "$size" \
      --argjson mtime "$mtime" \
      --argjson offset "$new_offset" \
      --argjson tIn "$prev_in" \
      --argjson tOut "$prev_out" \
      --argjson cacheRead "$prev_cacheRead" \
      --argjson cacheCreation "$prev_cacheCreation" \
      --argjson lastInput "$prev_lastIn" \
      --argjson lastOutput "$prev_lastOut" \
      --argjson lastCacheRead "$prev_lastCR" \
      --argjson lastCacheCreation "$prev_lastCC" \
      --arg model "$prev_model" \
      --arg cwd "$prev_cwd" \
      --argjson lastTs "$prev_ts" \
      '{
        size: $size, mtime: $mtime, offset: $offset,
        tokensIn: $tIn, tokensOut: $tOut,
        cacheRead: $cacheRead, cacheCreation: $cacheCreation,
        lastInput: $lastInput, lastOutput: $lastOutput,
        lastCacheRead: $lastCacheRead, lastCacheCreation: $lastCacheCreation,
        model: $model, cwd: $cwd, lastTs: $lastTs, emitted: false
      }' > "$state_file" 2>/dev/null || true
    return 0
  fi

  # Aggregate the delta from all new assistant turns found in this chunk.
  local delta
  delta="$(printf '%s\n' "$new_turns_json" | jq -sc '{
    deltaIn:    (map(.in)            | add // 0),
    deltaOut:   (map(.out)           | add // 0),
    deltaCR:    (map(.cacheRead)     | add // 0),
    deltaCC:    (map(.cacheCreation) | add // 0),
    lastInput:  (last.in            // 0),
    lastOutput: (last.out           // 0),
    lastCR:     (last.cacheRead     // 0),
    lastCC:     (last.cacheCreation // 0),
    model: (last.model // ""),
    ts:    (last.ts    // 0),
    cwd:   (last.cwd   // "")
  }' 2>/dev/null)"

  [ -z "$delta" ] || [ "$delta" = "null" ] && return 0

  # Merge delta into the persisted cumulative totals.
  local total_in total_out cache_read cache_creation model cwd ts
  local last_in last_out last_cr last_cc
  total_in=$(( prev_in            + $(jq -r '.deltaIn // 0' <<<"$delta") ))
  total_out=$(( prev_out           + $(jq -r '.deltaOut // 0' <<<"$delta") ))
  cache_read=$(( prev_cacheRead    + $(jq -r '.deltaCR  // 0' <<<"$delta") ))
  cache_creation=$(( prev_cacheCreation + $(jq -r '.deltaCC  // 0' <<<"$delta") ))
  last_in="$(jq -r '.lastInput  // 0' <<<"$delta")"
  last_out="$(jq -r '.lastOutput // 0' <<<"$delta")"
  last_cr="$(jq -r '.lastCR     // 0' <<<"$delta")"
  last_cc="$(jq -r '.lastCC     // 0' <<<"$delta")"
  model="$(jq -r '.model // ""'   <<<"$delta")"
  cwd="$(jq -r '.cwd   // ""'     <<<"$delta")"
  ts="$(jq -r '.ts     // 0'      <<<"$delta")"

  # Fall back to persisted values when the new chunk had no usable data.
  [ -n "$model" ] || model="$prev_model"
  [ -n "$cwd" ]   || cwd="$prev_cwd"
  [ "$ts" -gt 0 ] 2>/dev/null || ts="$prev_ts"
  [ "$ts" -gt 0 ] 2>/dev/null || ts="$(date +%s)000"

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
      --argjson offset "$new_offset" \
      --argjson tIn "$total_in" \
      --argjson tOut "$total_out" \
      --argjson cacheRead "$cache_read" \
      --argjson cacheCreation "$cache_creation" \
      --argjson lastInput "$last_in" \
      --argjson lastOutput "$last_out" \
      --argjson lastCacheRead "$last_cr" \
      --argjson lastCacheCreation "$last_cc" \
      --arg model "$model" \
      --arg cwd "$cwd" \
      --argjson lastTs "$ts" \
      '{
        size: $size,
        mtime: $mtime,
        offset: $offset,
        tokensIn: $tIn,
        tokensOut: $tOut,
        cacheRead: $cacheRead,
        cacheCreation: $cacheCreation,
        lastInput: $lastInput,
        lastOutput: $lastOutput,
        lastCacheRead: $lastCacheRead,
        lastCacheCreation: $lastCacheCreation,
        model: $model,
        cwd: $cwd,
        lastTs: $lastTs,
        emitted: true
      }' > "$state_file" 2>/dev/null || true
  else
    log_line turn.stop fail "src=transcript http=${http:-error} sid=${sid:0:8}"
    # Do not persist state — next tick will retry from the same offset.
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
