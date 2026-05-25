# Implementation findings (I1 – I12)

Twelve findings in the code written during v1 remediation phases. None are
critical — they are edge cases, silent error paths, and minor memory
inefficiencies that do not break production today but could cause hard-to-
diagnose bugs under specific conditions.

Findings in this file are frozen as of 2026-05-24. Fixes are tracked in
[Phase 1](../phases/phase-1-code-correctness.md).

---

## I1 — Signal handlers registered per-poller in `instrumentation-node.ts`

| | |
|---|---|
| **Severity** | Medium |
| **Location** | `apps/hud/instrumentation-node.ts` — inside `startPoller()` |
| **Phase** | [Phase 1](../phases/phase-1-code-correctness.md) |

**Symptom.** `process.once('SIGINT')`, `process.once('SIGTERM')`, and
`process.once('exit')` are registered each time `startPoller()` is called.
With two pollers (sessions + transcript), two independent signal handlers
exist. When SIGINT fires, the first handler kills its child and calls
`process.kill(process.pid, 'SIGINT')` to re-raise the signal. The
re-raised SIGINT triggers the second handler, which re-raises again — a
two-step signal loop that can cause unpredictable shutdown behaviour.

**Fix.** Register all signal cleanup logic once at module level using a
shared `Set<ChildProcess>` of active children, not inside each
`startPoller()` call.

---

## I2 — Bus subscriber leaks if `onStart` throws after `bus.subscribe()`

| | |
|---|---|
| **Severity** | Medium |
| **Location** | `apps/hud/app/api/stream/route.ts` — GET handler `onStart` callback |
| **Phase** | [Phase 1](../phases/phase-1-code-correctness.md) |

**Symptom.** In the GET handler, `bus.subscribe()` is called at line ~62
before `setInterval` for the heartbeat. If any code between that call and
the end of `onStart` throws, the subscriber is registered but never
cleaned up by `onClose`. The zombie sweep (Phase 3) will eventually prune
it (≤60 s), but in the meantime the subscriber's `onForced` callback
holds a reference to a dead SSE connection's `close()` function.

**Fix.** Wrap the body of `onStart` from `bus.subscribe()` onward in
`try-finally { if (unsubscribe) unsubscribe(); }`.

---

## I3 — `appendEvent()` failure swallowed in the ingest endpoint

| | |
|---|---|
| **Severity** | Medium |
| **Location** | `apps/hud/app/api/events/route.ts` — POST handler |
| **Phase** | [Phase 1](../phases/phase-1-code-correctness.md) |

**Symptom.** `await appendEvent(envelope)` is called to persist the event
to the rolling JSONL log. If the write fails (disk full, permission error,
log rotation failure), the function returns without throwing — the caller
receives no error signal — and the endpoint responds `204 No Content` as
if the write succeeded. Events can be silently lost from the audit log
with no indication to the caller.

**Fix.** Propagate the `appendEvent` error: catch it, log the reason
(`console.error`), and return `Response.json({ error: 'log_write_failed' },
{ status: 500 })`.

---

## I4 — Corrupted JSONL lines silently dropped in `sessions-poller.sh`

| | |
|---|---|
| **Severity** | Medium |
| **Location** | `hooks/sessions-poller.sh` — JSONL parsing with `jq fromjson?` |
| **Phase** | [Phase 1](../phases/phase-1-code-correctness.md) |

**Symptom.** The poller reads the first 10 lines of each JSONL file with
`head -n 10 "$f" | jq -R -r 'fromjson? | .cwd? // empty'`. The `fromjson?`
operator silently discards lines that are not valid JSON. If a session file
is corrupted (e.g., partially written by an interrupted Claude Code
instance), the entire file's `cwd` extraction silently returns empty.
The session is excluded from the snapshot without any diagnostic message.

**Fix.** Pipe jq stderr to a file or buffer; after parsing, emit one
`1>&2 echo` warning per file where parse errors occurred.

---

## I5 — `mktemp` failure silently omits standalone sessions

| | |
|---|---|
| **Severity** | Medium |
| **Location** | `hooks/sessions-poller.sh` — standalone session temp-file creation |
| **Phase** | [Phase 1](../phases/phase-1-code-correctness.md) |

**Symptom.** At the standalone session collection step, `mktemp` creates
a temp file to accumulate entries. On failure (e.g., `/tmp` full),
`standalone_tmp=""`. A downstream `[ -n "$standalone_tmp" ]` guard skips
the write, so the snapshot is sent without standalone sessions. The user
sees no sessions when standalone sessions are the only active ones, with
no error or warning in any log.

**Fix.** After `mktemp || standalone_tmp=""`, add:
`[ -z "$standalone_tmp" ] && warn "standalone tmp unavailable; standalone sessions omitted"`.

---

## I6 — Pending-agent cache expires in long-idle sessions (`claude-hook.sh`)

| | |
|---|---|
| **Severity** | Medium |
| **Location** | `hooks/claude-hook.sh` — `PreToolUse` / `PostToolUse` agent cache |
| **Phase** | [Phase 1](../phases/phase-1-code-correctness.md) |

**Symptom.** `PreToolUse` events cache the current agent name into
`/tmp/hud-pending-agent-*` files. Phase 1 added a 60-minute TTL cleanup.
If a Claude Code session is idle for > 60 minutes and then resumes, the
cache file is deleted by the next `PreToolUse` cleanup pass. The
subsequent `PostToolUse` event no longer finds the cache, falls back to
`agent-${TOOL_USE_ID:0:8}`, and the HUD displays a generic opaque ID
instead of the agent name — confusing for sessions that were paused
overnight and resumed the next morning.

**Fix.** Add `HUD_AGENT_CACHE_TTL_MIN` env var (default 60). Document
the trade-off in `.env.example` and CLAUDE.md §9.

---

## I7 — Zombie sweep timer runs when no subscribers are registered

| | |
|---|---|
| **Severity** | Low |
| **Location** | `apps/hud/lib/bus.ts` — `sweepZombies()` interval |
| **Phase** | [Phase 1](../phases/phase-1-code-correctness.md) |

**Symptom.** Once started by `subscribe()`, the 60 s `setInterval`
continues firing even after all subscribers manually unsubscribe (via the
returned cleanup function). The interval body returns early when
`subscribers.size === 0`, so there is no functional bug. The interval is
`.unref()`'d so it does not keep the process alive. However, on a busy
server handling thousands of connections per day, this accumulates wasted
timer callbacks.

**Fix.** In `sweepZombies()`, if after the sweep `subscribers.size === 0`,
call `clearInterval(this.sweepTimer)` and set `this.sweepTimer = null`.
Re-arm on the next `subscribe()` call (already handled by `startSweep()`).

---

## I8 — Byte accumulator stale on `desiredSize` null → non-null transition

| | |
|---|---|
| **Severity** | Low |
| **Location** | `apps/hud/lib/sse.ts` — backpressure tracking in `write()` |
| **Phase** | [Phase 1](../phases/phase-1-code-correctness.md) |

**Symptom.** The SSE backpressure logic uses `controller.desiredSize` as
the primary pressure signal (non-null) and a monotonic byte counter
(`bytesAccum`) as a fallback (when `desiredSize === null`). The byte
counter is reset to 0 only when `desiredSize !== null && !isPressured`.
If the stream transitions: non-null (resets counter) → null (accumulates
bytes) → non-null (would reset, but only if `!isPressured`), a client
whose `desiredSize` briefly dips below 0 will have `isPressured = true`
which prevents the reset, leaving `bytesAccum` non-zero when it should be
0. On the next null-path write, the stale accumulator can trigger a false
`isPressured`, starting the grace timer prematurely.

**Fix.** Reset `bytesAccum = 0` whenever entering the `desiredSize !== null`
branch, regardless of `isPressured`.

---

## I9 — `cancel` handler in SSE writer does not call `handlers.onClose`

| | |
|---|---|
| **Severity** | Low |
| **Location** | `apps/hud/lib/sse.ts` — `ReadableStream` `cancel` callback |
| **Phase** | [Phase 1](../phases/phase-1-code-correctness.md) |

**Symptom.** When a consumer cancels the `ReadableStream` (e.g., the
browser navigates away and the response body is cancelled by the runtime),
the `cancel` handler sets `closed = true` but does not call
`handlers.onClose`. This is functionally safe because the stream is
already cancelled — the bus subscriber and heartbeat interval are cleaned
up because `closed = true` prevents future `enqueue` calls. However, the
`handlers.onClose` contract is that it fires whenever the connection
closes, and callers (like `route.ts`) use it to clean up the heartbeat
interval and unsubscribe from the bus. If the interval or subscriber
outlives the cancel path, it would be a leak.

**Current mitigation:** `cleanup()` guards with `if (closed) return`, so
re-entry via `cancel` then `abort` would be safe. But the `onClose`
handler in `route.ts` does not fire on the `cancel` path.

**Fix.** Call `cleanup()` (not just `closed = true`) in the `cancel`
handler, matching the behavior of the `abort` listener.

---

## I10 — Content-Length guard bypassed by chunked transfer encoding

| | |
|---|---|
| **Severity** | Low |
| **Location** | `apps/hud/app/api/events/route.ts` — body size check |
| **Phase** | [Phase 1](../phases/phase-1-code-correctness.md) |

**Symptom.** Phase 1 added a Content-Length guard (`if (length > 64 * 1024)
return 413`). HTTP/1.1 chunked transfer encoding does not include a
Content-Length header; the guard is skipped. A `Transfer-Encoding: chunked`
request can exceed 64 KB without triggering the guard. The code comment
at that line says "Reject > 64 KB payloads" which is misleading.

**Current mitigation:** `next.config.mjs` sets `serverActions.bodySizeLimit:
'64kb'` which applies to all routes and catches chunked requests. Defense
in depth works; the Content-Length check provides early rejection for
standard requests.

**Fix.** Add a comment explaining the two-layer defence so the code is not
misread as incomplete. No functional change required.

---

## I11 — Child-process exit guard uses `!child.killed` instead of `exitCode === null`

| | |
|---|---|
| **Severity** | Low |
| **Location** | `apps/hud/instrumentation-node.ts` — signal cleanup handler |
| **Phase** | [Phase 1](../phases/phase-1-code-correctness.md) |

**Symptom.** The signal cleanup handler checks `if (child.pid && !child.killed)`
before calling `child.kill('SIGTERM')`. `child.killed` is `true` only if
the process was terminated via `child.kill()`. If the child process exited
on its own (crash, normal exit) before the parent receives SIGTERM,
`child.killed` is `false`, so the handler attempts `child.kill('SIGTERM')`
on a process that no longer exists. Node.js throws `ESRCH` ("no such
process"), which the current code does not catch.

**Fix.** Change the guard to `if (child.pid && child.exitCode === null)`.
`exitCode === null` means the process has not yet exited. Wrap in
`try-catch` as well in case of a race.

---

## I12 — Concurrent `PreToolUse` events can silently overwrite the pending-agent cache

| | |
|---|---|
| **Severity** | Low |
| **Location** | `hooks/claude-hook.sh` — `PreToolUse` agent-context caching |
| **Phase** | [Phase 1](../phases/phase-1-code-correctness.md) |

**Symptom.** When two `PreToolUse` events fire rapidly for the same
`HOOK_SESSION_ID` and `TOOL_USE_ID` (which can happen if the hook script
is invoked concurrently by two parallel Claude Code processes sharing a
session), both write to the same temp file path. The second write silently
overwrites the first. If the first carried a more descriptive agent name
or metadata, that information is lost. No log message indicates the
collision.

**Fix.** Detect the collision: before writing, check if a file for the
same key already exists and has different content. Log a warning to the
hook log file if so.
