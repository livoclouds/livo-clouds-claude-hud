# Phase 1 — Security & disk hygiene

| | |
|---|---|
| **Severity** | Critical |
| **Status** | ⏳ Pending |
| **PR** | — |
| **Estimated effort** | 5 hours |
| **Risk of regression** | Low (additive changes, no existing behaviour modified) |

---

## Scope

Three findings, all additive and isolated to ingest and log paths.
None touches the render tree or the event contract, so the verification
surface is small.

| Finding | Summary |
|---|---|
| [C1](../findings/critical.md#c1--post-apievents-accepts-unbounded-payloads) | Body-size cap and snapshot array limit on `/api/events` |
| [C5](../findings/critical.md#c5--logs-grow-indefinitely) | Size-based log rotation for hook log and JSONL event log |
| [H8](../findings/high.md#h8--tmphud-pending-agent--files-have-no-ttl) | TTL cleanup of `/tmp/hud-pending-agent-*` orphans |

## Files expected to change

- `apps/hud/app/api/events/route.ts` — `Content-Length` guard, 413
  response.
- `apps/hud/next.config.mjs` — `serverActions.bodySizeLimit` set
  explicitly.
- `packages/contracts/src/event.ts` — `.max(1000)` on
  `SessionsSnapshot.sessions`.
- `apps/hud/lib/log.ts` — size-cap rotation inside `appendEvent`.
- `hooks/claude-hook.sh`, `hooks/sessions-poller.sh`,
  `hooks/transcript-poller.sh` — shared `rotate_log` helper for
  `~/.claude/hud-hook.log`.
- `hooks/claude-hook.sh` — top-of-script `find … -mmin +60 -delete`
  for stale pending-agent files.
- `CLAUDE.md` — document new env var `HUD_LOG_MAX_SIZE_MB`.

## Test plan

- `pnpm -w typecheck`, `pnpm -w lint`, `pnpm -w build`, `pnpm -w test`
  all green.
- `curl -X POST http://127.0.0.1:4000/api/events -d "$(head -c 200K
  /dev/urandom | base64)"` returns HTTP 413, not OOM.
- Synthetic `sessions.snapshot` with 1 001 entries returns HTTP 400
  from Zod.
- After running the hook scripts for 10 minutes, `ls -la
  ~/.claude/hud-hook.log*` shows at most 3 rotated files, none larger
  than 10 MB.
- After artificially writing 120 MB of events, the JSONL log rotates
  to `events-YYYY-MM-DD.1.jsonl` and a fresh `events-YYYY-MM-DD.jsonl`
  appears.
- A stale `/tmp/hud-pending-agent-XYZ.json` older than 60 minutes is
  removed by the next hook invocation.

## Before / after metrics

Filled in when this phase merges.

| Metric | Before | After | Target |
|---|---|---|---|
| Max single ingest payload accepted | unbounded | 64 KB | ≤ 64 KB |
| `hud-hook.log` size after 1 week | unbounded | ≤ 30 MB (3 × 10) | ≤ 30 MB |
| JSONL log size per day | up to 172 MB | ≤ 100 MB per file (rotated) | ≤ 100 MB |

## Status updates

- **2026-05-24** — Phase scoped, awaiting implementation.

## What was deferred

(filled in if any item in scope is split out)
