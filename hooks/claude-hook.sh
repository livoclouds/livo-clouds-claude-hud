#!/usr/bin/env bash
# claude-hook.sh — Claude Code → HUD bridge.
#
# Reads a Claude Code hook payload on stdin, normalizes it to a HudEvent
# shape (see packages/contracts/src/event.ts), and POSTs it to the HUD ingest
# endpoint. Non-blocking by design: every failure path exits 0 so Claude Code
# is never delayed by the HUD.
#
# Configuration is sourced from ~/.claude/livo-clouds-hud.env:
#   HUD_INGEST_TOKEN  (required) shared bearer token
#   HUD_URL           (optional) defaults to http://127.0.0.1:3000
#   HUD_HOOK_LOG      (optional) defaults to ~/.claude/hud-hook.log
#   HUD_TIMEOUT_MS    (optional) defaults to 250
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

[ -n "$HUD_INGEST_TOKEN" ] || bail unknown missing_token

# Convert ms → seconds with millisecond resolution for curl --max-time.
TIMEOUT_S="$(awk -v ms="$HUD_TIMEOUT_MS" 'BEGIN { printf "%.3f", ms/1000 }')"

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

# Pre-extract identifiers we need to discriminate PostToolUse(Agent) from
# generic tool calls, and to pair SubagentStop with the matching agent name.
SID="$(printf '%s' "$PAYLOAD" | jq -r '.session_id // .sessionId // empty')"
TOOL_NAME="$(printf '%s' "$PAYLOAD" | jq -r '.tool_name // .tool // empty')"
SUBAGENT_TYPE="$(printf '%s' "$PAYLOAD" | jq -r '
  ((.tool_input // .toolInput) // {})
  | (.subagent_type // .subagentType // empty)
')"
AGENT_DESC="$(printf '%s' "$PAYLOAD" | jq -r '
  ((.tool_input // .toolInput) // {})
  | (.description // empty)
')"

# Side-state to remember the agent invoked between PostToolUse(Agent) and the
# matching SubagentStop. One file per session, cleared on session.start and
# after the agent completes.
AGENT_STATE_DIR="${TMPDIR:-/tmp}/livo-hud-agents"
mkdir -p "$AGENT_STATE_DIR" 2>/dev/null || true

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
    # Reset any stale subagent state from a previous session with this ID.
    [ -n "$SID" ] && rm -f "$AGENT_STATE_DIR/$SID" 2>/dev/null || true
    ;;
  SessionEnd)
    EVENT_TYPE="session.end"
    [ -n "$SID" ] && rm -f "$AGENT_STATE_DIR/$SID" 2>/dev/null || true
    ;;
  UserPromptSubmit)
    EVENT_TYPE="prompt.submit"
    ;;
  PostToolUse)
    # Claude Code's `Agent` tool is the subagent dispatcher. Emit a dedicated
    # `agent.invoke` event so the HUD can populate the agents dashboard; all
    # other tools still surface as `tool.use`.
    if [ "$TOOL_NAME" = "Agent" ] && [ -n "$SUBAGENT_TYPE" ]; then
      EVENT_TYPE="agent.invoke"
      AGENT_NAME="$SUBAGENT_TYPE"
      if [ -n "$SID" ]; then
        printf '%s' "$SUBAGENT_TYPE" >"$AGENT_STATE_DIR/$SID" 2>/dev/null || true
      fi
    else
      EVENT_TYPE="tool.use"
    fi
    ;;
  Stop)
    EVENT_TYPE="turn.stop"
    ;;
  SubagentStop)
    EVENT_TYPE="agent.complete"
    if [ -n "$SID" ] && [ -f "$AGENT_STATE_DIR/$SID" ]; then
      AGENT_NAME="$(cat "$AGENT_STATE_DIR/$SID" 2>/dev/null || true)"
      rm -f "$AGENT_STATE_DIR/$SID" 2>/dev/null || true
    fi
    [ -n "$AGENT_NAME" ] || AGENT_NAME="unknown"
    ;;
  PreCompact)
    EVENT_TYPE="compact.start"
    ;;
  Notification)
    bail "$HOOK_NAME" notification_unmapped
    ;;
  PreToolUse)
    bail "$HOOK_NAME" pretooluse_unmapped
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
      claudeCodeVersion: strArg($claudeCodeVersion),
      defaultModel: strArg($defaultModel)
    }
  | with_entries(select(.value != null))
  | # Per-type field whitelist matches HudEventSchema (.strict).
    if   $type == "session.start"  then with_entries(select(.key as $k | ["type","sessionId","ts","cwd","model","claudeCodeVersion","defaultModel"]           | index($k)))
    elif $type == "session.end"    then with_entries(select(.key as $k | ["type","sessionId","ts","cwd","model","tokens","costUsd","durationMs"]              | index($k)))
    elif $type == "prompt.submit"  then with_entries(select(.key as $k | ["type","sessionId","ts","cwd","model"]                                              | index($k)))
    elif $type == "tool.use"       then with_entries(select(.key as $k | ["type","sessionId","ts","cwd","model","tool","toolInput","durationMs"]              | index($k)))
    elif $type == "turn.stop"      then with_entries(select(.key as $k | ["type","sessionId","ts","cwd","model","tokens","costUsd","contextPct","durationMs"] | index($k)))
    elif $type == "compact.start"  then with_entries(select(.key as $k | ["type","sessionId","ts","cwd","model"]                                              | index($k)))
    elif $type == "agent.invoke"   then with_entries(select(.key as $k | ["type","sessionId","ts","cwd","model","agentName","agentDescription"]               | index($k)))
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
