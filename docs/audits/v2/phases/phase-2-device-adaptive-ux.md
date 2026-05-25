# Phase 2 — Device-Adaptive Layouts

| | |
|---|---|
| **Severity** | High |
| **Status** | ⏳ Pending |
| **PR** | — |
| **Estimated effort** | ~10 hours |
| **Risk of regression** | High — changes the NavBar rendering path and layout grid; must be verified on all three device classes |

---

## Scope

Six UI/UX findings addressing the layout experience on desktop, tablet,
and mobile. The goal is three distinct, native-feeling experiences on the
same codebase.

| Finding | Summary |
|---|---|
| [U1](../findings/ux-responsive.md#u1--touch-targets-below-44--44-pt-minimum) | All interactive elements ≥ 44 × 44 pt |
| [U2](../findings/ux-responsive.md#u2--sessions-table-has-no-responsive-variant-for-mobiletablet-portrait) | Sessions card view below `md:` breakpoint |
| [U3](../findings/ux-responsive.md#u3--no-xl-breakpoint-variants-kiosk-displays-left-with-dead-space) | `xl:` breakpoint + kiosk tier at ≥ 1440 px |
| [U4](../findings/ux-responsive.md#u4--hover-only-affordances-no-active-states-for-touch) | `active:` press states on all interactive elements |
| [U7](../findings/ux-responsive.md#u7--bottom-navigation-is-wrong-on-desktop-1024-px) | Responsive NavBar: bottom on mobile/tablet, sidebar on desktop |
| [U13](../findings/ux-responsive.md#u13--sessionsfilterbar-chips-below-touch-target-threshold) | Filter chips ≥ 44 px height + `active:` feedback |

---

## Design intent

Three surfaces, one codebase:

| Device | Breakpoint | Experience |
|--------|------------|------------|
| **Mobile** | < 768 px (`sm:`) | Bottom NavBar; single-column metric grid; compact mascot row; card list for sessions |
| **Tablet / iPad** | 768–1023 px (`md:`) | Bottom NavBar (current); 3-column metric grid; card list for sessions; swipe nav preserved |
| **Desktop** | ≥ 1024 px (`lg:`) | Left sidebar nav (96 px); 4-column metric grid (`xl:grid-cols-4`); sessions as sortable table; side-by-side live + agents panel |
| **Kiosk / Pi** | ≥ 1440 px (`kiosk:`) | Full-viewport layout; mascot takes ~40% left panel; right panel fills with metrics/sessions |

---

## Files changed

_(To be filled in after implementation.)_

Key files expected to change:
- `apps/hud/components/layout/NavBar.tsx` — conditional bottom/sidebar
- `apps/hud/app/(live)/page.tsx` — `xl:grid-cols-4`; desktop side-by-side panels
- `apps/hud/app/sessions/page.tsx` — `<SessionsCardList>` for `< md:`
- `apps/hud/components/sessions/SessionsFilterBar.tsx` — `h-11`, `active:` states
- `apps/hud/components/live/AgentsDashboard.tsx` — pin button `min-h-[44px]`
- `apps/hud/components/sessions/SessionsDashboard.tsx` — collapse button + pin `min-h-[44px]`
- `apps/hud/tailwind.config.*` — add `kiosk` screen breakpoint at 1440 px

---

## Test plan

```
pnpm -w typecheck
pnpm -w lint
pnpm -w build
```

**Device matrix (manual):**

| Viewport | Nav | Grid | Sessions | Tap targets |
|---|---|---|---|---|
| 375 × 812 (mobile) | Bottom | 1-col | Cards | ≥ 44 pt on all elements |
| 820 × 1180 (iPad portrait) | Bottom | 3-col | Cards | ≥ 44 pt on all elements |
| 1024 × 768 (iPad landscape / desktop breakpoint) | Left sidebar | 3→4 col transition | Table | ≥ 44 pt on all elements |
| 1280 × 800 (desktop) | Left sidebar | 4-col | Table | N/A (hover acceptable) |
| 1920 × 1080 (kiosk) | Left sidebar | 4-col, full width | Table | N/A |

Additional checks:
- Swipe navigation still works at mobile and tablet viewports.
- No horizontal overflow at any breakpoint (check with DevTools → Rendering → Scrolling Performance Issues).
- `active:` feedback visible on all buttons when tapped in iOS Safari.
- Pin/collapse buttons register correctly when tapped (no mis-taps at correct size).

---

## Before / after metrics

| Metric | Before | After | Target |
|---|---|---|---|
| Smallest pin button | 28 × 28 px | ≥ 44 × 44 px | ≥ 44 × 44 |
| Filter chip height | 36 px | ≥ 44 px | ≥ 44 |
| Desktop nav position | Bottom (wrong) | Left sidebar | Left sidebar |
| Max metric columns (all viewports) | 3 | 4 (`xl:`) | 4 |
| Sessions on 375 px | Cramped table | Card list | Card list |
| Kiosk dead space at 1920 px | ~35% viewport | ≤ 5% | ≤ 5% |

---

## Status updates

- **2026-05-24** — Phase scoped, awaiting implementation.

## What was deferred

_(To be filled in after implementation.)_
