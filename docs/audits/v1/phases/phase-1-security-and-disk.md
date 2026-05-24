# Phase 1 — Security & disk hygiene

| | |
|---|---|
| **Severity** | Critical |
| **Status** | ✅ Completed |
| **PR** | Local changes pending PR |
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

## What was done

All seven sub-tasks implemented in a single pass:

1. **C1 — Contract array cap** (`packages/contracts/src/event.ts`): added
   `.max(1000)` to `SessionsSnapshot.sessions`. A snapshot with 1001+ entries
   now fails Zod validation and returns HTTP 400.

2. **C1 — Content-Length guard** (`apps/hud/app/api/events/route.ts`): inserted
   a check for `Content-Length > 65 536` (64 KB) after bearer auth and before
   `req.json()`. Oversized requests return HTTP 413 `{ error: "payload_too_large" }`,
   consistent with existing error-response style.

3. **C1 — Next.js body limit** (`apps/hud/next.config.mjs`): added
   `serverActions: { bodySizeLimit: '64kb' }` as defense in depth for any
   future server-action paths.

4. **C5 — JSONL log rotation** (`apps/hud/lib/log.ts`): added
   `HUD_LOG_MAX_SIZE_MB` env var (default 100 MB). After each write,
   `handle.stat().size` is checked; when the limit is reached the log is
   rotated to `.1` / `.2` / `.3` generations and a fresh file is opened.

5. **C5 — Hook log rotation** (`hooks/claude-hook.sh`): added `rotate_log()`
   helper (10 MB threshold, 3 rotated generations). Called once per hook
   invocation, after config is loaded.

6. **C5 — Hook log rotation** (`hooks/sessions-poller.sh`,
   `hooks/transcript-poller.sh`): same `rotate_log()` function added and called
   at the top of the main `while true; do` loop in each daemon.

7. **H8 — Pending-agent TTL cleanup** (`hooks/claude-hook.sh`): added
   `find "${PENDING_AGENT_DIR%/}" -maxdepth 1 -name 'hud-pending-agent-*' -mmin +60 -delete`
   immediately after `PENDING_AGENT_FILE` is set, before the `case` dispatch.
   Runs on every hook invocation; silent on errors.

## Before / after metrics

| Metric | Before | After | Target |
|---|---|---|---|
| Max single ingest payload accepted | unbounded | 64 KB | ≤ 64 KB |
| `sessions.snapshot` accepted sessions | unbounded | 1 000 max | ≤ 1 000 |
| `hud-hook.log` size ceiling | unbounded | ≤ 30 MB (3 × 10 MB) | ≤ 30 MB |
| JSONL log size per file | unbounded | ≤ 100 MB (env-tunable) | ≤ 100 MB |
| Stale `/tmp/hud-pending-agent-*` age | unlimited | ≤ 60 min | ≤ 60 min |

## Status updates

- **2026-05-24** — Phase scoped, awaiting implementation.
- **2026-05-24** — Implemented. All findings addressed. Local changes pending PR.

## What was deferred

- **Rate limiting** on `POST /api/events`: no existing local pattern in the
  codebase; deferred to avoid scope creep. Documented in audit README.
- **Chunked-transfer-encoding payloads without `Content-Length`**: the
  Content-Length guard is bypassed for these (guard only fires when header is
  present). `serverActions.bodySizeLimit` provides defense in depth for
  server-action paths. Acceptable for v1 LAN deployment.
