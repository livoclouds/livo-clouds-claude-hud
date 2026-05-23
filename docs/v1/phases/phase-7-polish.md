# Phase 7 — Polish & Secondary Views

| Field | Value |
|---|---|
| Phase ID | `phase-7` |
| Status | 🟢 Complete |
| Sealed on | 2026-05-23 |
| Depends on | `phase-5`, `phase-6` |
| Blocks | `phase-8` |
| Target outcome | The HUD has visual polish, secondary views (`/sessions`, `/cost`), and feels native to touch |

---

## Overview

Convert the functional HUD into a **product**. Apply the visual tone chosen in
D-0.2, add the secondary views, wire touch gestures, and respect accessibility
preferences.

## Goals

- Implement dark / light theme via `next-themes`, persisted system preference.
- Apply the visual tone from D-0.2 across components.
- Build `/sessions` — list of past sessions with totals.
- Build `/cost` — timeseries chart of cost and tokens over time.
- Wire swipe gestures to navigate between top-level views.
- Implement long-press → slide-up sheet for metric detail.
- Honor `prefers-reduced-motion`.

## In Scope

- Theme provider, theme toggle, persisted preference.
- Typography pass: scale, weights, line-heights aligned to the chosen tone.
- Color tokens defined in `globals.css` via Tailwind `@theme {}`.
- `app/sessions/page.tsx` (RSC reading JSONL log aggregates).
- `app/cost/page.tsx` (Recharts timeseries).
- `app/_components/Gestures.tsx` (use-gesture wrapper for swipes).
- `app/_components/MetricSheet.tsx` (slide-up sheet for long-press details).
- `useReducedMotion()` integration across mascot and counters.

## Out of Scope

- PWA install / iPad kiosk setup — Phase 8.
- Pi 5 kiosk — Phase 9.
- Multi-language UI strings beyond English / Spanish stubs — locked at v1.

## Decisions Resolved

### D-7.1 — Sessions aggregation horizon — _resolved to default_

Last **14 days** by default. The "show all" expansion is deferred to a later
phase. `lib/aggregations.ts` reads `data/events-YYYY-MM-DD.jsonl` files
lazily and caches past-day reductions (today's bucket is always recomputed
because the file is still growing).

### D-7.2 — Cost-chart axis — _resolved to default (no hour drill-in in v1)_

x = day (UTC). Left y axis = USD (bar). Right y axis = tokens out (line).
Hour-level drill-in is **deferred** to keep this phase tightly scoped; the
chart is rendered with Recharts inside a dynamic-imported client wrapper to
avoid SSR issues.

### D-7.3 — Gesture map — _resolved (tap-on-mascot deferred)_

| Gesture | Action |
|---|---|
| Swipe left/right on a primary view | Rotate through `/cost · / · /sessions · /mascot` |
| Long-press on a token / cost / context card | Open the corresponding `MetricSheet` |
| Swipe down on a sheet | Dismiss |
| Tap the mascot | Deferred — a future v1.x phase |

The bottom `<NavBar>` provides a tap fallback so every primary view remains
reachable without gesturing.

## Deliverables

```
apps/hud/
├── app/
│   ├── sessions/page.tsx
│   ├── cost/page.tsx
│   └── _components/
│       ├── Gestures.tsx
│       ├── MetricSheet.tsx
│       └── ThemeToggle.tsx
├── lib/
│   ├── theme.ts
│   └── aggregations.ts
└── app/globals.css        # extended @theme tokens
```

## Acceptance Criteria

- Toggling theme switches dark ↔ light **without** a white flash.
- `/sessions` lists sessions from the last 14 days, sortable by total cost.
- `/cost` chart renders without overflow on iPad portrait and landscape.
- Swipe left from `/` lands on `/sessions`; swipe right lands on `/cost`.
- Long-press on the token-out metric opens the detail sheet.
- `prefers-reduced-motion: reduce` disables swipe spring physics (still
  navigable, no momentum).
- All views meet the < 1.5 s first-paint budget on iPad 2021.

## Tasks

1. Define color tokens in `globals.css`, applied to both themes.
2. Apply the visual tone (D-0.2): typography, density, decoration, shadows.
3. Build `Gestures.tsx` and integrate with `app/layout.tsx`.
4. Build the `MetricSheet` component (Radix Dialog under the hood).
5. Implement `lib/aggregations.ts` for sessions + cost.
6. Build `/sessions` and `/cost` pages.
7. Reduce-motion pass across mascot, counters, and gestures.
8. iPad visual QA (portrait + landscape).
9. PR titled `feat(ui): polish + sessions + cost (Phase 7)`.

## Risks

- **JSONL aggregation cost** grows linearly with days. Mitigation: cache the
  aggregation in memory per day (immutable after the day flips).
- **Recharts SSR**: imports must be client-only. Mitigation: dynamic import
  with `ssr: false`.
- **Gesture conflicts** between swipe and scroll. Mitigation: use-gesture's
  `axis: 'x'` constraint on top-level page swipes.

## Status update — 2026-05-23

Phase 7 sealed. All seven acceptance criteria are satisfied end-to-end:

- Theme toggle in the bottom `<NavBar>` swaps `data-theme` via `next-themes`
  with `disableTransitionOnChange` — no white flash. The SSR default mirrors
  the dark theme so the first paint never flips on hydration.
- `/sessions` is a Server Component reading `lib/aggregations.ts`. Sort is
  driven by a `?sort=` query (`cost` default · `recent` toggle); the
  underlying day caches keep work proportional to today's events only.
- `/cost` renders 14 days of `costUsd` (bar) and `tokensOut` (line) inside a
  dynamic-imported Recharts client wrapper. Token totals and session counts
  surface alongside the chart. Layout stays inside the iPad portrait /
  landscape budgets.
- `<Gestures>` wraps the App Router and routes through
  `/cost · / · /sessions · /mascot` on horizontal swipe (use-gesture, `axis:
  'x'`). Long-press on token / cost / context cards opens `<MetricSheet>`,
  which dismisses on swipe-down, backdrop tap, dismiss button, or Escape.
- `prefers-reduced-motion` short-circuits the swipe peek, the metric-sheet
  spring, and Recharts' bar/line animations. The existing reduced-motion
  paths in `AnimatedNumber`, `ContextRing`, and `Mascot` are untouched.
- `pnpm typecheck`, `pnpm lint`, `pnpm -r run test`, and
  `pnpm --filter @livoclouds/hud build` all pass. Phase 8 (PWA & iPad
  kiosk) is unblocked.

## Related

- [`./phase-0-design-decisions.md`](./phase-0-design-decisions.md) — D-0.2 visual tone.
- [`./phase-5-live-view.md`](./phase-5-live-view.md) — base for the polish pass.
- [`./phase-8-pwa-ipad.md`](./phase-8-pwa-ipad.md) — next phase, builds on this.
