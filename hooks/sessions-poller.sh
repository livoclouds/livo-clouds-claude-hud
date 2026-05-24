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
: "${SESSIONS_POLLER_INTERVAL:=1}"
: "${SESSIONS_HEARTBEAT_S:=15}"
: "${SESSIONS_DIR:=${HOME}/.claude/sessions}"
: "${PROJECTS_DIR:=${HOME}/.claude/projects}"
: "${JOBS_DIR:=${HOME}/.claude/jobs}"
# Persisted copy of the last snapshot we successfully POSTed. The HUD reads
# this on SSR to hydrate the Sessions panel before the first live snapshot
# arrives, closing the "Waiting for sessions snapshot from the poller…"
# race after a server restart.
: "${LAST_SNAPSHOT_FILE:=${HOME}/.claude/hud-last-sessions-snapshot.json}"

[ -n "$HUD_INGEST_TOKEN" ] || bail sessions.snapshot missing_token

# Validate interval — fall back to 1s if it is not a positive integer.
case "$SESSIONS_POLLER_INTERVAL" in
  ''|*[!0-9]*) SESSIONS_POLLER_INTERVAL=1 ;;
  *) [ "$SESSIONS_POLLER_INTERVAL" -lt 1 ] && SESSIONS_POLLER_INTERVAL=1 ;;
esac
case "$SESSIONS_HEARTBEAT_S" in
  ''|*[!0-9]*) SESSIONS_HEARTBEAT_S=15 ;;
  *) [ "$SESSIONS_HEARTBEAT_S" -lt 5 ] && SESSIONS_HEARTBEAT_S=5 ;;
esac

# `stat` on macOS uses `-f '%m'`; on Linux it's `-c '%Y'`. Detect once.
if stat -f '%m' / >/dev/null 2>&1; then
  STAT_MTIME_FMT='-f %m'
else
  STAT_MTIME_FMT='-c %Y'
fi

log_line sessions.snapshot start "interval=${SESSIONS_POLLER_INTERVAL}s heartbeat=${SESSIONS_HEARTBEAT_S}s sessions=$SESSIONS_DIR jobs=$JOBS_DIR projects=$PROJECTS_DIR url=$HUD_URL"

# Terminate cleanly on SIGINT/SIGTERM so the calling shell isn't blocked.
trap 'log_line sessions.snapshot stop signal; exit 0' INT TERM

PREV_HASH=""
LAST_POST_TS=0

build_activity_map() {
  # Build a JSON object mapping sessionId → ms-epoch mtime of that
  # session's JSONL transcript at ~/.claude/projects/*/<sid>.jsonl. The
  # transcript is touched on every Claude Code event in the session, so its
  # mtime is the most real-time "last activity" signal available. The
  # HUD's SessionsDashboard uses it to bucket sessions into Completed when
  # they've been idle for too long. Missing JSONL → no entry; the bucketer
  # falls back to status-only logic.
  local map="{"
  local first=1
  if [ -d "$PROJECTS_DIR" ]; then
    while IFS= read -r jsonl; do
      [ -z "$jsonl" ] && continue
      local sid base mtime_s ms
      base="$(basename "$jsonl")"
      sid="${base%.jsonl}"
      # shellcheck disable=SC2086
      mtime_s="$(stat $STAT_MTIME_FMT "$jsonl" 2>/dev/null)"
      [ -z "$mtime_s" ] && continue
      ms=$((mtime_s * 1000))
      if [ "$first" = 1 ]; then first=0; else map+=","; fi
      map+="\"$sid\":$ms"
    done < <(find "$PROJECTS_DIR" -maxdepth 3 -name '*.jsonl' -type f 2>/dev/null)
  fi
  map+="}"
  printf '%s' "$map"
}

build_sessions_map() {
  # Re-key ~/.claude/sessions/<pid>.json by sessionId so the jq pass in
  # build_snapshot can look up pid / kind / startedAt / updatedAt for each
  # daemon-managed state.json entry. Returns "{}" when no session files
  # exist on disk.
  if [ ! -d "$SESSIONS_DIR" ]; then printf '{}'; return 0; fi
  local files=( "$SESSIONS_DIR"/*.json )
  if [ ! -e "${files[0]}" ]; then printf '{}'; return 0; fi
  jq -s '
    reduce (.[] | select(.sessionId != null)) as $s ({};
      .[$s.sessionId] = {
        pid: $s.pid,
        kind: $s.kind,
        sessionStatus: $s.status,
        startedAt: $s.startedAt,
        updatedAt: $s.updatedAt,
        name: $s.name,
        agent: $s.agent,
        version: $s.version,
        cwd: $s.cwd
      }
    )
  ' "${files[@]}" 2>/dev/null
}

read_pins_set() {
  # ~/.claude/jobs/pins.json is a top-level JSON array of short-IDs (the
  # first 8 chars of the sessionId). Convert to a {shortId: true} map for
  # O(1) jq lookup in build_snapshot.
  local pins_file="${JOBS_DIR}/pins.json"
  if [ ! -f "$pins_file" ]; then printf '{}'; return 0; fi
  jq 'reduce .[] as $sid ({}; .[$sid] = true)' "$pins_file" 2>/dev/null
}

build_standalone_map() {
  # Sessions launched via plain `claude` (no daemon, no ~/.claude/sessions
  # entry once the process exits) survive only as a JSONL transcript under
  # ~/.claude/projects/<encoded-cwd>/<sessionId>.jsonl. The terminal `/agents`
  # view ignores them but they are the most common shape on a developer
  # machine and we want them in the HUD. This builds {sid: {cwd, mtime}} for
  # every JSONL touched in the last week, reading `cwd` from the first
  # record (the encoded directory name is lossy — '/' and '-' both map to
  # '-' — so the in-file cwd is the source of truth).
  if [ ! -d "$PROJECTS_DIR" ]; then printf '{}'; return 0; fi
  local tmp
  tmp="$(mktemp -t hud-standalone.XXXXXX 2>/dev/null)" || { printf '{}'; return 0; }
  while IFS= read -r jsonl; do
    [ -z "$jsonl" ] && continue
    local base sid mtime_s cwd
    base="$(basename "$jsonl")"
    sid="${base%.jsonl}"
    # shellcheck disable=SC2086
    mtime_s="$(stat $STAT_MTIME_FMT "$jsonl" 2>/dev/null)"
    [ -n "$mtime_s" ] || continue
    cwd="$(head -n 10 "$jsonl" 2>/dev/null \
            | jq -R -r 'fromjson? | .cwd? // empty' 2>/dev/null \
            | grep -v '^$' \
            | head -1)"
    [ -n "$cwd" ] || continue
    jq -n --arg sid "$sid" --arg cwd "$cwd" --argjson mtime $((mtime_s * 1000)) \
      '{ sid: $sid, cwd: $cwd, mtime: $mtime }' >> "$tmp" 2>/dev/null
  done < <(find "$PROJECTS_DIR" -maxdepth 3 -name '*.jsonl' -type f -mtime -2 2>/dev/null)
  if [ -s "$tmp" ]; then
    jq -s 'reduce .[] as $e ({}; .[$e.sid] = { cwd: $e.cwd, mtime: $e.mtime })' "$tmp"
  else
    printf '{}'
  fi
  rm -f "$tmp"
}

build_snapshot() {
  # Source of truth for the buckets that match the terminal `/agents` view:
  #   ~/.claude/jobs/<short>/state.json — semantic daemon state per session
  #   ~/.claude/jobs/pins.json          — short-IDs the user has pinned
  # We cross-reference ~/.claude/sessions/<pid>.json (re-keyed by sessionId
  # via build_sessions_map) to fill in pid/kind/startedAt/updatedAt, and
  # the JSONL mtime map for `lastActivityAt`. Orphan sessions (in
  # sessions/ but not in jobs/) fall through with status from the OS-level
  # session file so a freshly-launched session still surfaces. A third pass
  # (build_standalone_map) covers plain `claude` sessions that exist only
  # as a JSONL on disk.
  local sessions_map activity pins standalone
  sessions_map="$(build_sessions_map)"
  [ -z "$sessions_map" ] && sessions_map="{}"
  activity="$(build_activity_map)"
  [ -z "$activity" ] && activity="{}"
  pins="$(read_pins_set)"
  [ -z "$pins" ] && pins="{}"
  standalone="$(build_standalone_map)"
  [ -z "$standalone" ] && standalone="{}"

  # Collect all state.json files (one per daemon-managed session) into a
  # temp JSON array. Empty array when the daemon hasn't created any jobs.
  local state_files=()
  if [ -d "$JOBS_DIR" ]; then
    while IFS= read -r f; do state_files+=( "$f" ); done < <(find "$JOBS_DIR" -maxdepth 2 -name state.json -type f 2>/dev/null)
  fi
  local states_tmp
  states_tmp="$(mktemp -t hud-states.XXXXXX 2>/dev/null)" || {
    printf '{"type":"sessions.snapshot","ts":%d,"sessions":[]}' "$(date +%s)000"
    return 0
  }
  if [ ${#state_files[@]} -gt 0 ]; then
    jq -s '.' "${state_files[@]}" >"$states_tmp" 2>/dev/null || printf '[]' >"$states_tmp"
  else
    printf '[]' >"$states_tmp"
  fi

  jq -n \
    --slurpfile now <(printf '[%d]' "$(date +%s)000") \
    --slurpfile states "$states_tmp" \
    --argjson sessionsMap "$sessions_map" \
    --argjson activity "$activity" \
    --argjson pins "$pins" \
    --argjson standaloneMap "$standalone" \
    --argjson nowS "$(date +%s)" \
    '
    # Helper: parse the state.json ISO-8601 string (e.g. 2026-05-22T23:26:26.133Z)
    # into a ms-epoch number. Used as a fallback for startedAt/updatedAt when
    # the session has no live ~/.claude/sessions/<pid>.json (process exited).
    # jq does not have a native ms parser, so we strip the millisecond suffix
    # and multiply seconds.
    def iso2ms:
      if . == null then null
      else
        (sub("\\.[0-9]+Z$"; "Z") | fromdateiso8601 * 1000)
      end;

    # Pass 1: build entries from each state.json, cross-referenced with
    # session.json for pid/kind/startedAt/updatedAt when available.
    (
      ($states[0] // [])
      | map(
          (.sessionId // "") as $sid
          | ($sid[0:8]) as $short
          | ($sessionsMap[$sid] // null) as $cross
          | select($sid != "" and .name != null)
          | {
              pid:           ($cross.pid // null),
              sessionId:     $sid,
              name:          .name,
              cwd:           (.cwd // $cross.cwd // ""),
              status:        (.state // "unknown"),
              kind:          (.template // $cross.kind // "bg"),
              agent:         $cross.agent,
              version:       (.cliVersion // $cross.version),
              startedAt:     ($cross.startedAt // (.createdAt | iso2ms) // 0),
              updatedAt:     ($cross.updatedAt // (.updatedAt | iso2ms) // 0),
              lastActivityAt: ($activity[$sid] // null),
              pinnedByClaudeCode: ($pins[$short] // false),
              detail:        (.detail // null),
              tempo:         (.tempo // null)
            }
        )
    ) as $primary

    # Pass 2: orphans — sessions on disk that have no matching state.json.
    | ($primary | map(.sessionId)) as $covered
    | (
        $sessionsMap
        | to_entries
        | map(select((.key as $k | $covered | index($k)) == null))
        | map(
            . as $entry
            | {
                pid:           $entry.value.pid,
                sessionId:     $entry.key,
                name:          $entry.value.name,
                cwd:           ($entry.value.cwd // ""),
                status:        ($entry.value.sessionStatus // "unknown"),
                kind:          ($entry.value.kind // "bg"),
                agent:         $entry.value.agent,
                version:       $entry.value.version,
                startedAt:     $entry.value.startedAt,
                updatedAt:     $entry.value.updatedAt,
                lastActivityAt: ($activity[$entry.key] // null)
              }
          )
      ) as $orphans

    # Pass 3: standalone CLI sessions — JSONL transcripts in projects/ with
    # no daemon state.json (Pass 1) and no live sessions/<pid>.json (Pass 2).
    # The session the user is reading the HUD from is usually one of these,
    # so this is what unblocks "Waiting for sessions snapshot…" for the
    # common case of a plain `claude` invocation.
    | (($primary + $orphans) | map(.sessionId)) as $coveredAll
    | (
        $standaloneMap
        | to_entries
        | map(select((.key as $k | $coveredAll | index($k)) == null))
        | map(
            .key as $sid | .value as $v
            | (($nowS * 1000) - $v.mtime) as $ageMs
            | {
                sessionId:      $sid,
                name:           (($v.cwd // "") | split("/") | map(select(length > 0)) | (last // "unknown")),
                cwd:            $v.cwd,
                # Anything modified in the last 30 s is treated as live; older
                # JSONLs are idle. The schema accepts any non-empty string.
                status:         (if $ageMs < 30000 then "active" else "idle" end),
                kind:           "cli",
                startedAt:      $v.mtime,
                updatedAt:      $v.mtime,
                lastActivityAt: $v.mtime
              }
          )
      ) as $standalone

    # Merge, drop null/false-only optional fields, enforce contract minima.
    | {
        type: "sessions.snapshot",
        ts: $now[0][0],
        sessions: (
          ($primary + $orphans + $standalone)
          | map(
              with_entries(
                select(
                  (.value != null)
                  and (.key == "pinnedByClaudeCode" or .value != false)
                )
              )
            )
          | map(select(
              (.sessionId | length) > 0
              and (.name | length) > 0
              and ((.name // "") != ((.sessionId // "")[0:8]))
              and ((.cwd // "") | length) > 0
              and (.startedAt > 0)
            ))
        )
      }
    '

  rm -f "$states_tmp"
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
  rotate_log
  SNAPSHOT="$(build_snapshot)"
  if [ -n "$SNAPSHOT" ]; then
    # Hash only the sessions array so the volatile `ts` field doesn't
    # invalidate the hash on every tick. POST when state changes, OR when
    # the last POST is older than the heartbeat interval — the heartbeat
    # keeps the HUD's `codeSessionsUpdatedAt` fresh so the dashboard
    # doesn't show the "stale data" banner during quiet periods.
    HASH="$(printf '%s' "$SNAPSHOT" | jq -c '.sessions' 2>/dev/null | hash_snapshot)"
    NOW_TS="$(date +%s)"
    ELAPSED=$((NOW_TS - LAST_POST_TS))
    if [ -n "$HASH" ] && { [ "$HASH" != "$PREV_HASH" ] || [ "$ELAPSED" -ge "$SESSIONS_HEARTBEAT_S" ]; }; then
      HTTP="$(curl -sS -o /dev/null -w '%{http_code}' \
        --max-time 5 \
        -X POST \
        -H "Authorization: Bearer ${HUD_INGEST_TOKEN}" \
        -H 'Content-Type: application/json' \
        -d "$SNAPSHOT" \
        "${HUD_URL%/}/api/events" 2>/dev/null)" || HTTP=""
      if [ "$HTTP" = "200" ] || [ "$HTTP" = "204" ]; then
        if [ "$HASH" = "$PREV_HASH" ]; then
          log_line sessions.snapshot heartbeat "count=$(printf '%s' "$SNAPSHOT" | jq -r '.sessions|length' 2>/dev/null)"
        else
          log_line sessions.snapshot ok "count=$(printf '%s' "$SNAPSHOT" | jq -r '.sessions|length' 2>/dev/null)"
        fi
        PREV_HASH="$HASH"
        LAST_POST_TS="$NOW_TS"
        # Persist the snapshot atomically so the HUD's SSR can hydrate from it
        # after a server restart, before the next live POST arrives. Write to
        # a sibling tmp file and rename so a partial write never leaks.
        mkdir -p "$(dirname "$LAST_SNAPSHOT_FILE")" 2>/dev/null || true
        printf '%s' "$SNAPSHOT" > "${LAST_SNAPSHOT_FILE}.tmp" 2>/dev/null \
          && mv -f "${LAST_SNAPSHOT_FILE}.tmp" "$LAST_SNAPSHOT_FILE" 2>/dev/null
      else
        log_line sessions.snapshot fail "http=${HTTP:-error}"
      fi
    fi
  fi
  sleep "$SESSIONS_POLLER_INTERVAL"
done
