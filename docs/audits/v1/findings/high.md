# High-severity findings (H1 – H10)

Ten findings rated **high**. Each degrades the HUD under realistic load
— five or more clients, a 24-hour uptime, or one hundred or more
tracked sessions — without breaking a budget today.

Findings in this file are frozen as of 2026-05-24.

---

## H1 — `bus.replaySince` is O(N) per reconnect

| | |
|---|---|
| **Location** | `apps/hud/lib/bus.ts:76-84` |
| **Phase** | [Phase 3 — Server & bus](../phases/phase-3-server-and-bus.md) |

Each SSE reconnect calls `snapshot()` (O(N) ring copy) followed by
`findIndex(lastId)` (O(N) lookup). With the bus at 1 000 entries and
five clients reconnecting simultaneously, that is 10 000 main-thread
iterations.

**Fix.** Maintain a parallel `Map<id, ringIndex>` updated in
`publish()`, with eviction when the ring slot is overwritten. The
lookup becomes O(1) and the resulting slice is O(K) where K is the
number of new events since `lastId`.

---

## H2 — SSE writer has no backpressure

| | |
|---|---|
| **Location** | `apps/hud/lib/sse.ts:39-87` |
| **Phase** | [Phase 5 — SSE backpressure](../phases/phase-5-sse-backpressure.md) |

`controller.enqueue(chunk)` is fire-and-forget. If a client is on a
flaky connection or has been suspended, the internal `ReadableStream`
buffer grows without bound. One hundred slow clients holding ~50 MB
of buffered events each is 5 GB of memory consumed silently.

**Fix.** Observe `controller.desiredSize` when the Web Streams API
exposes it. If unavailable in this Node version, count enqueued bytes
since the last successful flush and close the connection when the
backlog exceeds a threshold (suggested: 1 MB or 30 s of unflushed
events). The client already reconnects with `Last-Event-ID`, so no
data is lost.

---

## H3 — Zombie subscribers can leak

| | |
|---|---|
| **Location** | `apps/hud/lib/bus.ts:26, 46-62` |
| **Phase** | [Phase 3 — Server & bus](../phases/phase-3-server-and-bus.md) |

`subscribers` is an unbounded `Set`. If a client closes abruptly and
the SSE route's `onClose` does not fire, the subscriber callback
remains in the Set and continues to retain the closure over the
`ReadableStream` controller — roughly 1 MB per zombie.

**Fix.** Track `lastDeliveryTs` per subscriber. A periodic sweep
removes any subscriber that has not received a delivery in N minutes
*and* the bus has published in that range. Log a warning whenever the
Set exceeds 50 entries — an early signal that something is wrong with
client cleanup.

---

## H4 — `useHud` selectors are inline

| | |
|---|---|
| **Location** | All consumers — e.g. `SessionsDashboard.tsx:333-335`, `LiveView.tsx`, `Mascot.tsx`, etc. |
| **Phase** | [Phase 2 — Client performance](../phases/phase-2-client-performance.md) |

`useHud((s) => s.codeSessions)` redefines the selector on every
render. Zustand handles primitives correctly, but selectors that
derive arrays or objects produce a new reference each call, defeating
the comparison and re-rendering downstream consumers.

**Fix.** Hoist all selectors to module scope (`const
selectCodeSessions = (s: HudState) => s.codeSessions`). For derived
selections that build a fresh array, wrap with `useShallow` from
`zustand/shallow`. Mechanical change, zero risk.

---

## H5 — `HudProvider` mixes three contexts of very different frequencies

| | |
|---|---|
| **Location** | `apps/hud/app/_components/live/HudProvider.tsx:19-51` |
| **Phase** | [Phase 2 — Client performance](../phases/phase-2-client-performance.md) |

`SseStatusContext` changes on every reconnect (rare but bursty).
`HudStoreContext` never changes (it is the store ref). Both live in
the same provider, so a status change forces every `useHud` consumer
to re-render even though their store has not changed.

**Fix.** Split into two nested providers: the store at the outer
layer (stable forever), the SSE status and hydration flag in an
inner provider. Consumers that read only the store stop re-rendering
on reconnects.

---

## H6 — Initial bus snapshot serializes up to 1 000 events into the SSR HTML

| | |
|---|---|
| **Location** | `apps/hud/app/layout.tsx:67` (`bus.snapshot()`) |
| **Phase** | [Phase 3 — Server & bus](../phases/phase-3-server-and-bus.md) |

With the bus full, the initial HTML carries ~200 KB of event JSON
inline. The client reduces and discards that history; the network
transit and the parse time are pure waste.

**Fix.** Extend `bus.snapshot(limit)` to accept an optional cap and
call `bus.snapshot(200)` from the layout. The mascot derivation uses
only the last 16 (`RECENT_EVENTS_CAP`); 200 covers session-snapshot
hydration with margin.

---

## H7 — `localStorage` writes are synchronous on every keystroke

| | |
|---|---|
| **Location** | `apps/hud/lib/pins.ts:28-34`, `apps/hud/lib/sessions-filters.ts:94-109` |
| **Phase** | [Phase 2 — Client performance](../phases/phase-2-client-performance.md) |

`localStorage.setItem` is synchronous. On iPad it costs ~1–5 ms per
call. Typing in the sessions search field calls it on every
keystroke; rapid pin toggles do the same.

**Fix.** Debounce writes by 300 ms. Flush in `useEffect` cleanup and
in a `beforeunload` listener so no state is lost. Pattern applies to
both hooks.

---

## H8 — `/tmp/hud-pending-agent-*` files have no TTL

| | |
|---|---|
| **Location** | `hooks/claude-hook.sh:111-199` |
| **Phase** | [Phase 1 — Security & Disk](../phases/phase-1-security-and-disk.md) |

`PreToolUse(Agent)` writes a stash file that `PostToolUse(Agent)`
reads and removes. When `PostToolUse` never fires (crash, abort),
the stash is orphaned. `/tmp` is cleared on reboot so the disk risk
is small, but a long-running host accumulates drift.

**Fix.** Every invocation of `claude-hook.sh` is an opportunity to
clean up. At the top of the script, run
`find "$PENDING_AGENT_DIR" -name 'hud-pending-agent-*' -mmin +60 -delete`
silently.

---

## H9 — `sessions-poller.sh` issues ~10 000 syscalls per minute

| | |
|---|---|
| **Location** | `hooks/sessions-poller.sh:108-204` (`build_activity_map` + `build_standalone_map`) |
| **Phase** | [Phase 4 — Pollers](../phases/phase-4-pollers.md) |

Each tick walks `~/.claude/projects`, calls `stat` on every JSONL
(244 on the audit host), and re-parses the head of every standalone
JSONL via `head + jq`. At 30–60 ticks per minute that is around
10 000 syscalls per minute, dominated by `stat`.

**Fix.** Cache the previous maps in process memory. Recompute only
when the `find` result differs from the prior tick. For files whose
`mtime` did not advance, reuse the cached `cwd` instead of re-
reading the head of the JSONL.

---

## H10 — `transcript-poller.sh` silently fails to persist state

| | |
|---|---|
| **Location** | `hooks/transcript-poller.sh:103, 128` |
| **Phase** | [Phase 4 — Pollers](../phases/phase-4-pollers.md) |

The `mkdir -p "$TRANSCRIPT_STATE_DIR"` call swallows errors with
`|| true`. If the directory cannot be created (permissions,
unexpanded variable), the state file is never written and every
tick reprocesses every JSONL from scratch — defeating the very
optimisation the state file was added for.

**Fix.** Check `existsSync` (or its bash equivalent) after the
`mkdir`. If creation failed, log an explicit error and bail. Do
not swallow.
