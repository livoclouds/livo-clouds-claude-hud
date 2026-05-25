#!/usr/bin/env bash
# claude-hook.sh — Claude Code → HUD bridge.
#
# Reads a Claude Code hook payload on stdin, normalizes it to a HudEvent
# shape (see packages/contracts/src/event.ts), and POSTs it to the HUD ingest
# endpoint. Non-blocking by design: every failure path exits 0 so Claude Code
# is never delayed by the HUD.
#
# Configuration is sourced from ~/.claude/livo-clouds-hud.env:
#   HUD_INGEST_TOKEN       (required) shared bearer token
#   HUD_URL                (optional) defaults to http://127.0.0.1:3000
#   HUD_HOOK_LOG           (optional) defaults to ~/.claude/hud-hook.log
#   HUD_TIMEOUT_MS         (optional) defaults to 250
#   HUD_AGENT_CACHE_TTL_MIN (optional) pending-agent cache TTL in minutes (default 60)
#
# The bearer token is never written to the log or to stderr.

set -u

CONFIG_FILE="${HOME}/.claude/livo-clouds-hud.env"
HUD_HOOK_LOG_DEFAULT="${HOME}/.claude/hud-hook.log"

# ----- helpers --------------------------------------------------------------

log_path() {
  printf '%s' "${HUD_HOOK_LOG:-$HUD_HOOK_LOG_DEFAULT}"
}

log_line() {
  # log_line <type> <status> [note]
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
  # bail <event-type-or-unknown> <note>
  log_line "${1:-unknown}" skip "${2:-unspecified}"
  exit 0
}

# ----- prerequisites --------------------------------------------------------

command -v jq   >/dev/null 2>&1 || bail unknown missing_jq
command -v curl >/dev/null 2>&1 || bail unknown missing_curl

if [ -f "$CONFIG_FILE" ]; then
  # shellcheck disable=SC1090
  . "$CONFIG_FILE"
else
  bail unknown missing_config
fi

: "${HUD_INGEST_TOKEN:=}"
: "${HUD_URL:=http://127.0.0.1:3000}"
: "${HUD_TIMEOUT_MS:=250}"
: "${HUD_AGENT_CACHE_TTL_MIN:=60}"

[ -n "$HUD_INGEST_TOKEN" ] || bail unknown missing_token

# Convert ms → seconds with millisecond resolution for curl --max-time.
TIMEOUT_S="$(awk -v ms="$HUD_TIMEOUT_MS" 'BEGIN { printf "%.3f", ms/1000 }')"

rotate_log

# ----- read stdin -----------------------------------------------------------

PAYLOAD="$(cat)"
[ -n "$PAYLOAD" ] || bail unknown empty_stdin

# Validate it parses as JSON; bail safely if not.
if ! printf '%s' "$PAYLOAD" | jq -e . >/dev/null 2>&1; then
  bail unknown invalid_json
fi

# ----- derive event type ----------------------------------------------------

HOOK_NAME="$(printf '%s' "$PAYLOAD" | jq -r '.hook_event_name // empty')"
if [ -z "$HOOK_NAME" ]; then
  HOOK_NAME="${CLAUDE_HOOK_EVENT_NAME:-${1:-}}"
fi
[ -n "$HOOK_NAME" ] || bail unknown missing_hook_name

# Pre-extract identifiers we need to discriminate Pre/PostToolUse(Agent) from
# generic tool calls and to populate the agent.invoke / agent.complete events.
TOOL_NAME="$(printf '%s' "$PAYLOAD" | jq -r '.tool_name // .tool // empty')"
SUBAGENT_TYPE="$(printf '%s' "$PAYLOAD" | jq -r '
  ((.tool_input // .toolInput) // {})
  | (.subagent_type // .subagentType // empty)
')"
AGENT_DESC="$(printf '%s' "$PAYLOAD" | jq -r '
  ((.tool_input // .toolInput) // {})
  | (.description // empty)
')"
AGENT_PROMPT="$(printf '%s' "$PAYLOAD" | jq -r '
  ((.tool_input // .toolInput) // {})
  | (.prompt // empty)
')"
# Cross-event correlation key. tool_use_id is set on both Pre and PostToolUse
# for the same tool invocation, so we can stash subagent context written by
# PreToolUse(Agent) and recover it in PostToolUse if Claude Code's later
# payload happens to drop tool_input.subagent_type.
TOOL_USE_ID="$(printf '%s' "$PAYLOAD" | jq -r '.tool_use_id // .toolUseId // empty')"
HOOK_SESSION_ID="$(printf '%s' "$PAYLOAD" | jq -r '.session_id // .sessionId // empty')"
PENDING_AGENT_DIR="${HUD_PENDING_AGENT_DIR:-${TMPDIR:-/tmp}}"
PENDING_AGENT_FILE=""
if [ -n "$HOOK_SESSION_ID" ] && [ -n "$TOOL_USE_ID" ]; then
  PENDING_AGENT_FILE="${PENDING_AGENT_DIR%/}/hud-pending-agent-${HOOK_SESSION_ID}-${TOOL_USE_ID}.json"
elif [ -n "$HOOK_SESSION_ID" ]; then
  # Fallback when tool_use_id is missing — one slot per session. Concurrent
  # agents in the same session would clobber, but that path is already
  # degenerate and at worst we lose a name (the event still ships).
  PENDING_AGENT_FILE="${PENDING_AGENT_DIR%/}/hud-pending-agent-${HOOK_SESSION_ID}.json"
fi

# Remove stale pending-agent stash files older than HUD_AGENT_CACHE_TTL_MIN
# minutes (default 60). Configurable so long-idle sessions don't lose agent
# name correlation when the PreToolUse cache is swept before PostToolUse (I6).
find "${PENDING_AGENT_DIR%/}" -maxdepth 1 \
  -name 'hud-pending-agent-*' -mmin +"${HUD_AGENT_CACHE_TTL_MIN}" -delete 2>/dev/null || true

AGENT_NAME=""
CC_VERSION=""
CC_DEFAULT_MODEL=""

case "$HOOK_NAME" in
  SessionStart)
    EVENT_TYPE="session.start"
    # Capture Claude Code version (last segment of CLAUDE_CODE_EXECPATH) and
    # the default model the user configured (~/.claude/settings.json).
    CC_VERSION="$(basename "${CLAUDE_CODE_EXECPATH:-}" 2>/dev/null)"
    if [ "$CC_VERSION" = "" ] || [ "$CC_VERSION" = "." ]; then
      CC_VERSION=""
    fi
    if [ -f "$HOME/.claude/settings.json" ]; then
      CC_DEFAULT_MODEL="$(jq -r '.model // empty' "$HOME/.claude/settings.json" 2>/dev/null)"
    fi
    ;;
  SessionEnd)
    EVENT_TYPE="session.end"
    ;;
  UserPromptSubmit)
    EVENT_TYPE="prompt.submit"
    ;;
  PreToolUse)
    # PreToolUse fires BEFORE the tool runs. We surface it only for the
    # `Agent` subagent dispatcher so the dashboard can show the agent in a
    # working state while it is actually working (PostToolUse only fires after
    # the subagent has already finished). All other Pre events are silenced.
    if [ "$TOOL_NAME" = "Agent" ] && [ -n "$SUBAGENT_TYPE" ]; then
      EVENT_TYPE="agent.invoke"
      AGENT_NAME="$SUBAGENT_TYPE"
      # Stash the agent context so PostToolUse can recover the name even if
      # Claude Code drops tool_input.subagent_type from the post payload.
      if [ -n "$PENDING_AGENT_FILE" ]; then
        # Warn on collision: concurrent PreToolUse events for the same key
        # would silently overwrite the first write (I12).
        if [ -f "$PENDING_AGENT_FILE" ]; then
          printf '[claude-hook] warn: agent cache collision on %s — overwriting\n' \
            "$(basename "$PENDING_AGENT_FILE")" >&2
        fi
        jq -n \
          --arg subagent_type "$SUBAGENT_TYPE" \
          --arg description "$AGENT_DESC" \
          --arg prompt "$AGENT_PROMPT" \
          --argjson ts "$(date +%s)000" \
          '{ subagent_type: $subagent_type, description: $description, prompt: $prompt, ts: $ts }' \
          > "$PENDING_AGENT_FILE" 2>/dev/null || true
      fi
    else
      bail "$HOOK_NAME" pretooluse_unmapped
    fi
    ;;
  PostToolUse)
    # PostToolUse for `Agent` marks subagent completion (and carries the
    # duration). All other tools still surface as `tool.use`. The duration is
    # read by the jq pipeline below from $p.duration_ms.
    if [ "$TOOL_NAME" = "Agent" ]; then
      # Recover subagent context from PreToolUse's stash if the post payload
      # didn't carry subagent_type itself. The cache file lives in /tmp and
      # is removed once consumed.
      if [ -z "$SUBAGENT_TYPE" ] && [ -n "$PENDING_AGENT_FILE" ] && [ -f "$PENDING_AGENT_FILE" ]; then
        CACHED_TYPE="$(jq -r '.subagent_type // empty' "$PENDING_AGENT_FILE" 2>/dev/null)"
        CACHED_DESC="$(jq -r '.description // empty' "$PENDING_AGENT_FILE" 2>/dev/null)"
        CACHED_PROMPT="$(jq -r '.prompt // empty' "$PENDING_AGENT_FILE" 2>/dev/null)"
        [ -n "$CACHED_TYPE" ] && SUBAGENT_TYPE="$CACHED_TYPE"
        [ -z "$AGENT_DESC" ] && AGENT_DESC="$CACHED_DESC"
        [ -z "$AGENT_PROMPT" ] && AGENT_PROMPT="$CACHED_PROMPT"
      fi
      if [ -n "$SUBAGENT_TYPE" ]; then
        EVENT_TYPE="agent.complete"
        AGENT_NAME="$SUBAGENT_TYPE"
      else
        # Last-resort identifier so the agent at least lands in the panel
        # under a stable, traceable label instead of being silently demoted
        # to a generic tool.use.
        EVENT_TYPE="agent.complete"
        if [ -n "$TOOL_USE_ID" ]; then
          AGENT_NAME="agent-${TOOL_USE_ID:0:8}"
        else
          AGENT_NAME="agent-unknown"
        fi
      fi
      # Consume the cache regardless of whether we used it.
      [ -n "$PENDING_AGENT_FILE" ] && [ -f "$PENDING_AGENT_FILE" ] && rm -f "$PENDING_AGENT_FILE" 2>/dev/null
    else
      EVENT_TYPE="tool.use"
    fi
    ;;
  Stop)
    EVENT_TYPE="turn.stop"
    ;;
  SubagentStop)
    # The Agent tool's lifecycle is fully captured by Pre/PostToolUse above.
    # SubagentStop arrives between them but adds no information the dashboard
    # needs, so we drop it instead of double-emitting agent.complete.
    bail "$HOOK_NAME" subagentstop_unmapped
    ;;
  PreCompact)
    EVENT_TYPE="compact.start"
    ;;
  Notification)
    bail "$HOOK_NAME" notification_unmapped
    ;;
  *)
    bail "$HOOK_NAME" unsupported_hook
    ;;
esac

NOW_MS="$(date +%s)000"

# ----- build the normalized event JSON --------------------------------------
#
# jq builds the HudEvent shape, omitting any optional field that is null.
# The exact shape per type is enforced by the Phase 3 ingest endpoint (Zod).

EVENT_JSON="$(printf '%s' "$PAYLOAD" | jq -c \
  --arg type "$EVENT_TYPE" \
  --argjson now "$NOW_MS" \
  --arg agentName "$AGENT_NAME" \
  --arg agentDescription "$AGENT_DESC" \
  --arg agentPrompt "$AGENT_PROMPT" \
  --arg claudeCodeVersion "$CC_VERSION" \
  --arg defaultModel "$CC_DEFAULT_MODEL" '
  def num(x): if (x|type) == "number" then x else null end;
  def str(x): if (x|type) == "string" and x != "" then x else null end;
  def strArg(x): if (x|type) == "string" and x != "" then x else null end;

  . as $p
  | (str($p.session_id // $p.sessionId)) as $sid
  | (str($p.cwd))                         as $cwd
  | (str($p.model // $p.model_id))        as $model
  | (str($p.tool_name // $p.tool))        as $tool
  | (if ($p.tool_input // $p.toolInput) | type == "object"
       then ($p.tool_input // $p.toolInput) else null end) as $toolInput
  | (num($p.duration_ms // $p.durationMs)) as $duration
  | (num($p.cost_usd // $p.costUsd))       as $cost
  | (num($p.context_pct // $p.contextPct)) as $ctx
  | (if ($p.tokens // null) | type == "object"
       then ($p.tokens | {
              "in":     ((.in     // .input  // .input_tokens)  // null),
              "out":    ((.out    // .output // .output_tokens) // null),
              "cached": ((.cached // .cache  // .cache_read_tokens) // null)
            }
            | with_entries(select(.value != null))
            | if (.["in"] // null) != null and (.out // null) != null then . else null end)
       else null end) as $tokens
  | {
      type: $type,
      sessionId: ($sid // "unknown"),
      ts: $now,
      cwd: $cwd,
      model: $model,
      tool: $tool,
      toolInput: $toolInput,
      tokens: $tokens,
      costUsd: $cost,
      contextPct: $ctx,
      durationMs: $duration,
      agentName: strArg($agentName),
      agentDescription: strArg($agentDescription),
      prompt: strArg($agentPrompt),
      claudeCodeVersion: strArg($claudeCodeVersion),
      defaultModel: strArg($defaultModel)
    }
  | with_entries(select(.value != null))
  | # Per-type field whitelist matches HudEventSchema (.strict).
    if   $type == "session.start"  then with_entries(select(.key as $k | ["type","sessionId","ts","cwd","model","claudeCodeVersion","defaultModel"]           | index($k)))
    elif $type == "session.end"    then with_entries(select(.key as $k | ["type","sessionId","ts","cwd","model","durationMs"]                                    | index($k)))
    elif $type == "prompt.submit"  then with_entries(select(.key as $k | ["type","sessionId","ts","cwd","model"]                                              | index($k)))
    elif $type == "tool.use"       then with_entries(select(.key as $k | ["type","sessionId","ts","cwd","model","tool","toolInput","durationMs"]              | index($k)))
    elif $type == "turn.stop"      then with_entries(select(.key as $k | ["type","sessionId","ts","cwd","model","durationMs"]                                    | index($k)))
    elif $type == "compact.start"  then with_entries(select(.key as $k | ["type","sessionId","ts","cwd","model"]                                              | index($k)))
    elif $type == "agent.invoke"   then with_entries(select(.key as $k | ["type","sessionId","ts","cwd","model","agentName","agentDescription","prompt"]       | index($k)))
    elif $type == "agent.complete" then with_entries(select(.key as $k | ["type","sessionId","ts","cwd","model","agentName","tokens","costUsd","durationMs"]  | index($k)))
    else . end
  | # tool.use requires a tool field — fall back to "unknown" if hook omitted it.
    if $type == "tool.use" and (.tool // null) == null then .tool = "unknown" else . end
  | # agent.* events require agentName.
    if ($type == "agent.invoke" or $type == "agent.complete")
       and (.agentName // null) == null
       then .agentName = "unknown" else . end
')"

[ -n "$EVENT_JSON" ] || bail "$EVENT_TYPE" jq_failed

# ----- POST -----------------------------------------------------------------

HTTP_STATUS="$(printf '%s' "$EVENT_JSON" | curl -sS \
  --max-time "$TIMEOUT_S" \
  -o /dev/null \
  -w '%{http_code}' \
  -X POST \
  -H "Authorization: Bearer ${HUD_INGEST_TOKEN}" \
  -H 'Content-Type: application/json' \
  --data-binary @- \
  "${HUD_URL%/}/api/events" 2>/dev/null)"
[ -n "$HTTP_STATUS" ] || HTTP_STATUS="000"

case "$HTTP_STATUS" in
  2*) log_line "$EVENT_TYPE" "$HTTP_STATUS" ;;
  000) log_line "$EVENT_TYPE" error hud_unreachable ;;
  *)   log_line "$EVENT_TYPE" "$HTTP_STATUS" non_2xx ;;
esac

exit 0
