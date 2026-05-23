# Phase 5 — Live View

| Field | Value |
|---|---|
| Phase ID | `phase-5` |
| Status | 🟢 Complete |
| Sealed on | 2026-05-23 |
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

## Decisions Resolved

### D-5.1 — Number-change animation style — _resolved to default_

`useSpring` from `motion` with `{ stiffness: 200, damping: 30 }`. The spring
settles in well under 600 ms, so no extra duration cap is needed. The shared
`AnimatedNumber` component lives at
`apps/hud/app/_components/live/AnimatedNumber.tsx` and is used by both
`TokenStat` and `CostStat`. When `prefers-reduced-motion: reduce` is set, the
spring jumps directly to the target value (no easing).

### D-5.2 — Context-ring redline — _resolved to default_

Thresholds centralized in `apps/hud/lib/thresholds.ts` as
`CONTEXT_THRESHOLDS = { warn: 70, critical: 90 }`. The band helper
`contextBand(pct)` returns `'neutral' | 'warn' | 'critical'`. `ContextRing`
maps each band to a CSS variable (`--color-hud-accent` / `--color-hud-warn` /
`--color-hud-critical`) so the visual identity stays consistent with the
Phase 0 palette.

### D-5.3 — What counts as "last tool" — _resolved to default_

`lastTool` is set from the most recent `tool.use` event for the active
session. Sub-agent activity is folded into the parent session in v1.
Long names truncate at 28 characters with the full string preserved in
`title=` for accessible inspection.

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

## Implementation Notes

- **Snapshot path is RSC-direct.** `app/page.tsx` runs in the Node runtime,
  imports the in-process `bus` from `apps/hud/lib/bus.ts`, calls
  `bus.snapshot()`, and folds the envelopes through `reduceAll` (exported from
  `apps/hud/lib/store.ts`). The same `reduce` function is used by the SSE
  client to fold live envelopes, guaranteeing identical hydration shape and
  avoiding the need for a separate `/api/snapshot` route.
- **Page is dynamic.** `export const dynamic = 'force-dynamic'` keeps the
  snapshot fresh on every hard refresh during an active session.
- **Reducer semantics.** `tokens`, `costUsd`, and `contextPct` use
  latest-snapshot semantics (each `turn.stop` replaces, not sums) to match how
  Claude Code reports running totals per turn. `session.start` resets all
  per-session counters. `session.end` freezes the session and applies the
  final totals if present.
- **Reconnect.** `EventSource` reconnects natively after the first `id:`
  frame it receives, sending `Last-Event-ID` automatically. The client adds a
  `visibilitychange` listener that re-opens the stream when the tab returns
  from background (iPad Safari may suspend backgrounded EventSources). On
  persistent errors the client backs off exponentially (200 ms → 5 s cap).
- **Defense-in-depth on the wire.** The SSE client revalidates every payload
  with `HudEventSchema.safeParse` before dispatching, so a malformed or
  spoofed frame cannot crash the store.
- **i18n deferred.** Per the resolved plan, Phase 5 ships English literals.
  A later phase introduces `next-intl` and migrates user-visible strings to
  `t('namespace.key')` keys; the conventions in CLAUDE.md §5 remain the long-
  term target.
- **`scripts/synth-event.sh`** is the only new dev tool. It posts synthetic
  events of every type to a running HUD, reading `HUD_INGEST_TOKEN` from
  `.env.local` and caching a session id in `$TMPDIR/hud-synth-session` so
  successive events affect the same session card.

## Status update — 2026-05-23

Phase 5 sealed. All five acceptance criteria validated end-to-end:
hard-refresh hydration, `< 500 ms` event-to-screen latency, `Last-Event-ID`
replay, context-ring band transitions at exact 70 and 90 boundaries, and
responsive layout at iPad portrait and landscape dimensions. `pnpm typecheck`,
`pnpm lint`, `pnpm -r run test`, and `pnpm --filter @livoclouds/hud build`
all pass. Phase 6 (mascot) is unblocked.

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
