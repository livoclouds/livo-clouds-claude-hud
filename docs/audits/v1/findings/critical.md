# Critical findings (C1 – C6)

Six findings rated **critical**. Each either breaks a [`CLAUDE.md` §11
budget](../../../../CLAUDE.md) today or exposes the service to abuse.
None should ship to additional users until addressed.

Findings in this file are frozen as of 2026-05-24. Fixes are tracked
in their owning phase.

---

## C1 — `POST /api/events` accepts unbounded payloads

| | |
|---|---|
| **Location** | `apps/hud/app/api/events/route.ts:42-70` |
| **Phase** | [Phase 1 — Security & Disk](../phases/phase-1-security-and-disk.md) |
| **Budget broken** | Service availability |

**Symptom.** `await req.json()` parses the entire request body into
memory before any size check or Zod validation runs. A single
attacker request of 100 MB is enough to OOM the Node process; ten
concurrent requests at 50 MB each will saturate even a generous host.

**Why this matters now.** CLAUDE.md §2 explicitly states "Never deploy
the ingest endpoint to a public origin without rate-limiting". The
current implementation has neither rate-limiting nor a body cap. The
shared bearer token is the only barrier, and bearer tokens leak.

**Fix.**

1. Add a `Content-Length` check before `req.json()`. Reject `> 64 KB`
   with HTTP 413. The largest legitimate payload observed is the
   sessions snapshot at ~26 KB.
2. Configure `serverActions.bodySizeLimit` in `next.config.mjs` as a
   defence in depth.
3. Add `.max(1000)` to `z.array(CodeSessionInfo)` in
   `packages/contracts/src/event.ts:207` so a malformed snapshot is
   rejected at validation time.
4. Document rate-limit expectations even if the current LAN-only
   deployment does not implement them.

---

## C2 — Sessions panel renders every row without virtualization

| | |
|---|---|
| **Location** | `apps/hud/app/_components/live/SessionsDashboard.tsx:435` + `BucketSection` |
| **Phase** | [Phase 2 — Client performance](../phases/phase-2-client-performance.md) |
| **Budget broken** | Mascot 60 fps · ingest → screen p95 |

**Symptom.** `AnimatePresence` keeps every child mounted for the
duration of the panel. With 78+ sessions observed on the audit host,
the panel mounts 78 `motion.div` nodes — each with a `layout` prop —
all of which participate in layout calculations on every render. On
iPad 2021 the panel drops to 30–40 fps while scrolling.

**Why this matters now.** The list will keep growing as the user
accumulates background sessions. The mascot animation lives in the
same animation thread; any contention there breaks the 60 fps budget
for the most visible element on screen.

**Fix.** Virtualize the list. The simplest path is `react-window` with
`overscan: 4`; an in-house implementation based on
`IntersectionObserver` is acceptable too. Render only the ~10–12
visible rows plus a small buffer. Preserve the existing pin / collapse
/ double-tap UX.

---

## C3 — Mascot animations keep running when the tab is hidden

| | |
|---|---|
| **Location** | `apps/hud/app/_components/mascot/Mascot.tsx:42-117` + `StickyMascot.tsx` |
| **Phase** | [Phase 2 — Client performance](../phases/phase-2-client-performance.md) |
| **Budget broken** | 150 MB / 24 h client (battery proxy) |

**Symptom.** Every variant in `VARIANTS` uses `repeat: Infinity`. The
orbit pip in `running` state has its own 4.5 s infinite spin. There
is no `visibilitychange` listener anywhere in the file, so when the
iPad is locked or the user switches Safari tabs, the animations
continue and the browser keeps requesting frames. Battery drain over
a 24 h session is measurable in real-world testing.

**Fix.** Introduce a shared `useDocumentVisibility()` hook in
`apps/hud/lib/use-visibility.ts`. In `Mascot.tsx`, swap the variants
for `STATIC_FRAME` whenever the tab is hidden. The `StickyMascot`
scroll listener should also bail when hidden. The same hook will be
reused by the global ticker (see C4).

---

## C4 — Seven simultaneous `setInterval`s drive re-renders

| | |
|---|---|
| **Location** | `SessionsDashboard.tsx:354`, `AgentsDashboard.tsx:234`, `Mascot.tsx:182`, `LastTool.tsx:13`, `SessionCard.tsx:19`, `SessionDetailSheet.tsx:130`, `AgentDetailSheet.tsx:151` |
| **Phase** | [Phase 2 — Client performance](../phases/phase-2-client-performance.md) |
| **Budget broken** | Mascot 60 fps · 150 MB / 24 h client |

**Symptom.** Seven separate components each create their own
`setInterval` to drive a `setState(now)` that refreshes relative
timestamps. Each tick triggers a render of the component and its
descendants. The event loop is fragmented into seven independent
cadences (mostly 1 s, some 10 s).

**Why this matters now.** On iPad, fragmentation is observable as
periodic frame drops every second when sheets are open. GC pressure
from the constant `setState` calls is non-trivial over a 24 h
session.

**Fix.** Replace all seven with a single shared `useGlobalTick(cb,
freq)` hook backed by one `setInterval`. The hook exposes two
frequencies (`fast` = 1 s, `slow` = 10 s) and internally subscribes
the callbacks to that single timer. Pause the timer entirely when
`document.visibilityState !== 'visible'` (this also resolves C3 as a
side-effect for components that derive state from time).

---

## C5 — Logs grow indefinitely

| | |
|---|---|
| **Location** | `~/.claude/hud-hook.log` (written by all three bash scripts) and `apps/hud/lib/log.ts:47-66` (server JSONL log) |
| **Phase** | [Phase 1 — Security & Disk](../phases/phase-1-security-and-disk.md) |
| **Budget broken** | Disk availability (CLAUDE.md §13 — no retention policy in v1) |

**Symptom.** The bash hook log is already at 452 KB / 7 304 lines
after a few days of normal use and grows monotonically. The server-
side JSONL log rotates by UTC day but has no size cap within a day;
at 10 events/s a single day produces ~172 MB.

**Why this matters now.** Disk fills up in roughly a week of
continuous use. The failure mode is the ingest endpoint silently
failing on `ENOSPC` — exactly the kind of slow degradation that goes
unnoticed until the dashboard goes blank.

**Fix.**

- **Bash log:** add a rotation helper to each of the three shell
  scripts: rotate to `.1` when the current file exceeds 10 MB,
  retain three generations (`.1`, `.2`, `.3`).
- **Server JSONL log:** add `HUD_LOG_MAX_SIZE_MB` env (default 100).
  When the current day's file exceeds the cap, rotate to
  `events-YYYY-MM-DD.N.jsonl` atomically and open a new handle.
- Document the new behaviour in CLAUDE.md §9.

---

## C6 — `transcript-poller.sh` slurps 16 MB JSONLs into RAM every 2 s

| | |
|---|---|
| **Location** | `hooks/transcript-poller.sh:144-175` |
| **Phase** | [Phase 4 — Pollers](../phases/phase-4-pollers.md) |
| **Budget broken** | Host RAM / IO contention with Claude Code |

**Symptom.** The poller uses `jq -R -s -c '...' "$jsonl"`. The `-R -s`
flags slurp the entire file into a single jq string before parsing.
The largest JSONL observed on the audit host is 16 MB and grows
continuously while a session is active. Multiple active sessions
mean multiple 16 MB jq processes resident at once.

**Why this matters now.** Spikes of 50–100 MB of extra RSS on the
host every 2 s are wasteful, and the read-while-Claude-writes
contention reduces both processes' throughput.

**Fix.** Use the incremental offset already persisted in
`~/.claude/hud-transcript-state/<sid>.json` (see also H10). Read only
`tail -c +$prev_offset "$jsonl"` and parse line-by-line with
`jq -R 'fromjson?'`. Advance `offset` only up to the byte position of
the last `\n` in the read window so that a partial line at EOF is
retried in the next tick. RAM per tick drops from ~16 MB to < 1 MB.
