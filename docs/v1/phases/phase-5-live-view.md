# Phase 5 — Live View

| Field | Value |
|---|---|
| Phase ID | `phase-5` |
| Status | ⚪ Not Started |
| Depends on | `phase-3`, `phase-4` |
| Blocks | `phase-6` |
| Target outcome | Opening `/` in a browser shows live tokens, cost, model, context %, and last tool, all updating without a refresh |

---

## Overview

The first **visible** phase. Render a minimal but production-shaped HUD layout
that consumes the SSE stream and animates incoming numbers. No mascot yet — the
data layer is the gate.

## Goals

- Build the live view: session card, token counters, cost, model, context-%
  ring, last-tool chip.
- Subscribe to `/api/stream` from the client and hydrate a Zustand store.
- Animate counter changes with Motion (`<motion.span layout>` or `useSpring`).
- Server-render the initial snapshot (RSC) so first paint is non-blank.
- Implement reconnection with `Last-Event-ID`.

## In Scope

- `apps/hud/app/page.tsx` (RSC; reads bus snapshot from `lib/bus.ts`).
- `apps/hud/app/_components/live/SessionCard.tsx`.
- `apps/hud/app/_components/live/TokenStat.tsx`.
- `apps/hud/app/_components/live/CostStat.tsx`.
- `apps/hud/app/_components/live/ContextRing.tsx`.
- `apps/hud/app/_components/live/LastTool.tsx`.
- `apps/hud/lib/store.ts` (Zustand store: current session totals, last event).
- `apps/hud/lib/sse-client.ts` (`useEventStream(url)` hook).

## Out of Scope

- The mascot — Phase 6.
- Theme toggle (dark/light), `/sessions`, `/cost` pages, gestures — Phase 7.
- PWA install — Phase 8.

## Open Decisions

### D-5.1 — Number-change animation style

**Default proposal**: `useSpring` from Motion with `stiffness: 200, damping: 30`.
Numbers slide upward when increasing, downward when decreasing. Cap animation
duration at 600 ms to prevent visible "ticker scroll" on rapid bursts.

### D-5.2 — Context-ring redline

**Default proposal**: ring color is neutral 0–70 %, amber 70–90 %, red 90–100 %.
Threshold values can be tuned without code changes via `apps/hud/lib/thresholds.ts`.

### D-5.3 — What counts as "last tool"

**Default proposal**: the most recent `tool.use` event for the active session,
regardless of which agent emitted it. Sub-agent activity is folded into the
parent session in v1 (multi-agent breakdown deferred to v2).

## Deliverables

```
apps/hud/
├── app/
│   ├── page.tsx
│   ├── globals.css
│   └── _components/live/
│       ├── SessionCard.tsx
│       ├── TokenStat.tsx
│       ├── CostStat.tsx
│       ├── ContextRing.tsx
│       └── LastTool.tsx
└── lib/
    ├── store.ts
    └── sse-client.ts
```

## Acceptance Criteria

- Hard-refreshing the page during an active session shows the current totals
  **without** a "Loading…" state.
- Posting a synthetic `tool.use` event updates the "Last tool" chip and the
  token counters within 500 ms.
- Closing the browser tab and reopening reconnects to the stream and catches
  up via `Last-Event-ID`.
- The `ContextRing` color crosses thresholds correctly at boundary values.
- The view is readable on a 1024×768 viewport (iPad portrait) and a 1366×1024
  (iPad landscape).

## Tasks

1. Build `lib/store.ts` reducing events into session totals.
2. Build `lib/sse-client.ts` with `EventSource` lifecycle + reconnect.
3. Build presentational components in the order listed in Deliverables.
4. Wire `app/page.tsx` to read a snapshot from the bus (server-side) and pass
   it to the client via a `<HudLiveProvider initial=…>` boundary.
5. Add a tiny `scripts/synth-event.sh` for local testing without Claude Code.
6. Visual review on iPad over LAN.
7. PR titled `feat(ui): live view (Phase 5)`.

## Risks

- **Hydration mismatch** between RSC snapshot and client store. Mitigation:
  pass the exact same shape; never compute "now-based" values during render.
- **EventSource on iPad Safari quirks**: backgrounded tabs may suspend.
  Mitigation: reconnect logic + `visibilitychange` handler that re-opens.
- **Layout jank** when long tool names land. Mitigation: truncate with a
  tooltip; reserve fixed width.

## Related

- [`./phase-3-backend.md`](./phase-3-backend.md) — the data source.
- [`./phase-6-mascot.md`](./phase-6-mascot.md) — next to land on this view.
- [`../../CLAUDE.md §6`](../../../CLAUDE.md) — real-time rendering rules.
