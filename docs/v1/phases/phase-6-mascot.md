# Phase 6 — Mascot

| Field | Value |
|---|---|
| Phase ID | `phase-6` |
| Status | 🟢 Complete |
| Depends on | `phase-0`, `phase-5` |
| Blocks | `phase-7` |
| Target outcome | An animated mascot sits at the visual center of the HUD and reacts to every subscribed event in real time |

---

## Overview

Bring the mascot to life. The mascot is the emotional center of the HUD — it
is what makes the screen feel **alive** rather than analytical. Its visible
state is a pure function of the event log; never an imperative animation call.

Per Phase 0 decision D-0.1 the mascot ships as a **stylized Claude `✦`
glyph** animated with **`motion/react` + Tailwind/CSS**. No Lottie runtime is
introduced, so first paint stays cheap and we can swap the artwork later
without rewriting the state machine.

## Goals

- Implement a **state machine** that derives the mascot's current state from
  the latest validated event envelope (latest-event-wins).
- Animate transitions with Motion (no hard cuts) using only
  compositor-friendly properties.
- Author idle micro-animations so the mascot never freezes.
- Fall back to `idle` after 30 s of silence.
- Honor `prefers-reduced-motion`.
- Provide a `/mascot` diagnostics route so every canonical state is reachable
  for QA without a real Claude Code session.

## In Scope

- `apps/hud/app/_components/mascot/Mascot.tsx` — animated SVG glyph driven by
  Motion variants per state.
- `apps/hud/app/_components/mascot/MascotGlyph.tsx` — inline SVG mark.
- `apps/hud/app/_components/mascot/MascotDiagnostics.tsx` — QA panel.
- `apps/hud/lib/mascot/state.ts` — pure derivation function
  `deriveMascotState({ recentEvents, nowMs })` + `classifyTool`.
- `apps/hud/lib/mascot/timeouts.ts` — timing constants and ring-buffer cap.
- `apps/hud/lib/mascot/state.test.ts` — Vitest unit tests.
- `apps/hud/app/mascot/page.tsx` — hidden `/mascot` diagnostics route.
- Store extension: `HudState` keeps a bounded `recentEvents` ring (cap 16) so
  the mascot can derive across RSC snapshot and live SSE updates.

## Out of Scope

- Lottie integration. Phase 0 sealed D-0.1 as the stylized `✦` glyph
  approach; Lottie remains a future-version upgrade path.
- Producing custom mascot artwork (Phase 0 Option B).
- Sound effects — out of scope for v1.

## Open Decisions

### D-6.1 — Asset format

Resolved per D-0.1 = Option A: **inline SVG + Motion + Tailwind**, no Lottie.
The Mascot component reads color, glow, and motion from a per-state variants
map and tints the shared `<MascotGlyph />` mark via `currentColor`.

### D-6.2 — State priority on conflicting signals

Resolved: **latest event wins**. Encoded in `state.ts` as a single switch over
the most recent envelope. The only look-back is for `compact.end` once its
small post-compact window expires (so the mascot surfaces what was happening
before compaction instead of getting stuck).

### D-6.3 — Idle timeout

Resolved: **30 s** of silence → `idle`. Constants colocated in
`lib/mascot/timeouts.ts`.

## Deliverables

```
apps/hud/
├── app/
│   ├── _components/mascot/
│   │   ├── Mascot.tsx
│   │   ├── MascotGlyph.tsx
│   │   └── MascotDiagnostics.tsx
│   └── mascot/page.tsx
├── lib/mascot/
│   ├── state.ts
│   ├── state.test.ts
│   └── timeouts.ts
└── vitest.config.ts
```

## Acceptance Criteria

- Every state listed in [`CLAUDE.md §7`](../../../CLAUDE.md) is reachable from
  the `/mascot` diagnostics route.
- A live session triggers state transitions matching the event log.
- 60 fps target: animations only mutate `transform`, `opacity`, and `filter`.
- `prefers-reduced-motion: reduce` swaps motion variants for a static frame.
- After 30 s of silence the mascot is back in `idle`.

## Tasks

1. Pure derivation function + Vitest unit tests.
2. Extend the Zustand store with a bounded `recentEvents` ring.
3. Build `Mascot.tsx` driving `<MascotGlyph />` via Motion variants per state;
   handle `useReducedMotion`.
4. Integrate the mascot into the Live View without obscuring metrics.
5. Implement the `/mascot` diagnostics route.
6. Update docs and tracker.
7. PR titled `feat(mascot): state machine and Motion animations (Phase 6)`.

## Risks

- **Animation drift** with React 19 transitions. Mitigation: the mascot lives
  in its own client island; selectors return reference-stable arrays and the
  per-second tick is gated on the override.
- **Layout thrash** if a state animates layout properties by accident.
  Mitigation: only `transform`, `opacity`, and `filter` appear in the
  variants map.
- **Stale derivation on long silences**. Mitigation: a 1 Hz tick re-derives so
  the 30 s idle fallback fires without relying on a new event.

## Related

- [`./phase-0-design-decisions.md`](./phase-0-design-decisions.md) — D-0.1 art direction.
- [`./phase-5-live-view.md`](./phase-5-live-view.md) — provides the event store this consumes.
- [`../../CLAUDE.md §7`](../../../CLAUDE.md) — full state table.
