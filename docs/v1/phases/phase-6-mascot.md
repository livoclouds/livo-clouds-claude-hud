# Phase 6 — Mascot

| Field | Value |
|---|---|
| Phase ID | `phase-6` |
| Status | ⚪ Not Started |
| Depends on | `phase-0`, `phase-5` |
| Blocks | `phase-7` |
| Target outcome | An animated mascot sits at the visual center of the HUD and reacts to every subscribed event in real time |

---

## Overview

Bring the mascot to life. The mascot is the emotional center of the HUD — it is
what makes the screen feel **alive** rather than analytical. Its visible state
is a pure function of the event log; never an imperative animation call.

## Goals

- Integrate Lottie React.
- Implement a **state machine** that derives the mascot's current state from
  the latest events.
- Author idle micro-animations so the mascot never freezes.
- Implement transitions between states (no hard cuts).
- Honor `prefers-reduced-motion`.

## In Scope

- `apps/hud/app/_components/mascot/Mascot.tsx` — renders the current Lottie.
- `apps/hud/lib/mascot/state.ts` — derivation function `eventsToMascotState(events)`.
- `apps/hud/lib/mascot/timeouts.ts` — fallback-to-idle logic after 30 s silence.
- `apps/hud/app/_components/mascot/assets/` — Lottie JSON files for each state.
- A "diagnostics" hidden route `/mascot` that lets us cycle through all states
  manually — used to QA each animation in isolation.

## Out of Scope

- Producing the artwork. Phase 0 chose the art direction; this phase **consumes**
  the assets. If D-0.1 picked path A (stylized `✦`), we generate the Lottie
  files in this phase from SVG sources. If B or C, the assets arrive from the
  illustrator / generator and we integrate them.
- Sound effects — out of scope for v1.

## Open Decisions

### D-6.1 — Asset format

If D-0.1 = A → SVG-source Lottie generated from a small script; ships in repo.
If D-0.1 = B → vendor-delivered Lottie JSON; ships in repo.
If D-0.1 = C → AI-generated frames composited into Lottie; ships in repo.

### D-6.2 — State priority on conflicting signals

When two events could imply different states within the same tick (e.g.
`tool.use` followed immediately by `turn.stop`), the **most recent event
wins**. Document this explicitly in `state.ts`.

### D-6.3 — Idle timeout

**Default proposal**: 30 s without any event → return to `idle`. Long-running
tool invocations should still emit periodic `tool.use` events; if they don't,
the mascot will fall back to idle even mid-execution. Acceptable trade-off.

## Deliverables

```
apps/hud/
├── app/_components/mascot/
│   ├── Mascot.tsx
│   └── assets/
│       ├── idle.json
│       ├── listening.json
│       ├── thinking.json
│       ├── editing.json
│       ├── running.json
│       ├── succeeded.json
│       ├── errored.json
│       └── compacting.json
├── lib/mascot/
│   ├── state.ts
│   └── timeouts.ts
└── app/mascot/
    └── page.tsx          # diagnostics route
```

## Acceptance Criteria

- Every state listed in [`CLAUDE.md §7`](../../../CLAUDE.md) is reachable from
  the diagnostics route.
- A live session triggers state transitions matching the event log.
- 60 fps sustained on iPad 2021 hardware (verified via Safari Web Inspector).
- `prefers-reduced-motion: reduce` swaps Lottie playback for a static frame
  per state.
- After 30 s of silence the mascot is back in `idle`.

## Tasks

1. Build `Mascot.tsx` that loads the correct Lottie based on a prop.
2. Build `state.ts` as a pure function over the event array.
3. Wire the mascot to the Zustand store via a selector.
4. Implement the diagnostics route.
5. Produce each Lottie asset per D-6.1.
6. Tune transitions with Motion (cross-fade or morph between Lotties).
7. Performance pass on iPad 2021.
8. PR titled `feat(mascot): state machine and Lottie integration (Phase 6)`.

## Risks

- **Lottie file size** balloons on iPad — large rigs hurt first paint.
  Mitigation: budget each Lottie to under 60 KB gzipped; vector-only assets.
- **Cross-fade flicker** if two Lotties render simultaneously during transition.
  Mitigation: a small Motion `AnimatePresence` wrapper with `mode="wait"`.
- **Animation drift** with React 19 transitions. Mitigation: render the mascot
  outside the page-transition boundary.

## Related

- [`./phase-0-design-decisions.md`](./phase-0-design-decisions.md) — D-0.1 art direction.
- [`./phase-5-live-view.md`](./phase-5-live-view.md) — provides the event store this consumes.
- [`../../CLAUDE.md §7`](../../../CLAUDE.md) — full state table.
