# Phase 7 — Polish & Secondary Views

| Field | Value |
|---|---|
| Phase ID | `phase-7` |
| Status | ⚪ Not Started |
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

## Open Decisions

### D-7.1 — Sessions aggregation horizon

**Default proposal**: show the last **14 days** by default, with a "show all"
expand. Aggregation reads `data/events-YYYY-MM-DD.jsonl` files lazily.

### D-7.2 — Cost-chart axis

**Default proposal**: x = time bucketed by day in default view, by hour when a
single day is selected. y = USD; secondary y axis = tokens (toggleable).

### D-7.3 — Gesture map

**Default proposal**:

| Gesture | Action |
|---|---|
| Swipe left/right on `/` | Navigate to `/sessions` or `/cost` |
| Long-press on a metric | Open `MetricSheet` for that metric |
| Swipe down on a sheet | Dismiss |
| Tap the mascot | Easter-egg: wave animation |

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

## Related

- [`./phase-0-design-decisions.md`](./phase-0-design-decisions.md) — D-0.2 visual tone.
- [`./phase-5-live-view.md`](./phase-5-live-view.md) — base for the polish pass.
- [`./phase-8-pwa-ipad.md`](./phase-8-pwa-ipad.md) — next phase, builds on this.
