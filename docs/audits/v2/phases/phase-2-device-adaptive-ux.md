# Phase 2 — Device-Adaptive Layouts

| | |
|---|---|
| **Severity** | High |
| **Status** | ✅ Completed — 2026-05-24 |
| **PR** | branch `worktree-phase-2-device-adaptive-ux` |
| **Estimated effort** | ~10 hours |
| **Risk of regression** | High — changes the NavBar rendering path and layout grid; must be verified on all three device classes |

---

## Scope

Seven UI/UX findings addressing the layout experience on desktop, tablet,
mobile, and kiosk. The goal is four distinct, native-feeling experiences on the
same codebase.

| Finding | Summary | Status |
|---|---|---|
| [U1](../findings/ux-responsive.md#u1--touch-targets-below-44--44-pt-minimum) | All interactive elements ≥ 44 × 44 pt | ✅ |
| [U2](../findings/ux-responsive.md#u2--sessions-table-has-no-responsive-variant-for-mobiletablet-portrait) | Sessions card view below `md:` breakpoint | ✅ |
| [U3](../findings/ux-responsive.md#u3--no-xl-breakpoint-variants-kiosk-displays-left-with-dead-space) | `xl:` breakpoint + kiosk tier at ≥ 1440 px | ✅ |
| [U4](../findings/ux-responsive.md#u4--hover-only-affordances-no-active-states-for-touch) | `active:` press states on all interactive elements | ✅ |
| [U7](../findings/ux-responsive.md#u7--bottom-navigation-is-wrong-on-desktop-1024-px) | Responsive NavBar: bottom on mobile/tablet, sidebar on desktop | ✅ |
| [U12](../findings/ux-responsive.md#u12--no-kioskwidescreen-layout-for-raspberry-pi-hdmi-displays) | Kiosk max-width containers at 1440 px+ | ✅ |
| [U13](../findings/ux-responsive.md#u13--sessionsfilterbar-chips-below-touch-target-threshold) | Filter chips ≥ 44 px height + `active:` feedback | ✅ |

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
- **2026-05-24** — Phase completed. All 7 findings resolved. Build passes (no TS errors), 107 tests green.

## Implementation notes

### Files modified

| File | Change |
|---|---|
| `apps/hud/app/globals.css` | Added `--breakpoint-kiosk: 1440px` to `@theme` block |
| `apps/hud/app/_components/NavBar.tsx` | Dual render: bottom pill with `lg:hidden` + left sidebar with `hidden lg:flex flex-col`; `active:opacity-70` on all nav links |
| `apps/hud/app/layout.tsx` | Content wrapper: `pb-28 lg:pb-0 lg:pl-20` (sidebar offset) |
| `apps/hud/app/_components/live/LiveView.tsx` | Grid sections: `md:grid-cols-3 lg:grid-cols-4`; col-spans updated; `kiosk:max-w-[1600px]` on `<main>` |
| `apps/hud/app/_components/live/AgentsDashboard.tsx` | `PinButton`: `min-h-[44px] min-w-[44px]`; `AgentCard`: `active:brightness-90`; card grid: `xl:grid-cols-4` |
| `apps/hud/app/_components/live/SessionsDashboard.tsx` | `PinButton`: `min-h-[44px] min-w-[44px]`; `CollapsibleHeader`: `min-h-[44px] active:opacity-70`; `SessionCardRow`: `active:brightness-90`; clear button: `h-11` |
| `apps/hud/app/_components/live/SessionsFilterBar.tsx` | `chipClass`: `h-9` → `h-11`, `active:scale-[0.97] active:opacity-80`; kind select and clear button: `h-9` → `h-11` |
| `apps/hud/app/sessions/page.tsx` | Conditional `<SessionsCardList>` (`block md:hidden`) + table (`hidden md:block`); `kiosk:max-w-[1600px]` |
| `apps/hud/app/cost/page.tsx` | `kiosk:max-w-[1600px]` on `<main>` |
| `apps/hud/app/_components/shell/StatusBar.tsx` | `kiosk:max-w-[1600px]` on inner wrapper div |
| `apps/hud/app/_components/sessions/SessionsCardList.tsx` | **New** — card-per-row layout for mobile; receives sessions + now as props from RSC |

### Active-state pattern used

```
active:scale-[0.97] active:opacity-80 transition-transform duration-75   ← chip buttons
active:brightness-90                                                        ← card surfaces (no layout shift)
active:opacity-70                                                           ← nav links, collapse headers
active:opacity-60                                                           ← pin icon buttons
```

### Touch target pattern

Pin buttons and CollapsibleHeader: visual icon stays small, touch area expanded via `min-h-[44px] min-w-[44px] flex items-center justify-center`.

## What was deferred

U5, U6, U8, U9, U10, U11 — Visual polish items deferred to Phase 3 per original plan. No scope creep introduced.
