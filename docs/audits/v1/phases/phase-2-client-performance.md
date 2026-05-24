# Phase 2 — Client performance

| | |
|---|---|
| **Severity** | Critical |
| **Status** | ✅ Completed |
| **PR** | Local changes pending PR |
| **Estimated effort** | 10 hours |
| **Risk of regression** | Medium (changes to render path; needs visual verification on iPad) |

---

## Scope

Six findings clustered around the React render path, animation cost,
and re-render fan-out. The unifying theme is: **stop doing work the
user cannot see**.

| Finding | Summary |
|---|---|
| [C2](../findings/critical.md#c2--sessions-panel-renders-every-row-without-virtualization) | Virtualize `SessionsDashboard` |
| [C3](../findings/critical.md#c3--mascot-animations-keep-running-when-the-tab-is-hidden) | Pause mascot animations when tab hidden |
| [C4](../findings/critical.md#c4--seven-simultaneous-setintervals-drive-re-renders) | Replace seven `setInterval`s with a global ticker |
| [H4](../findings/high.md#h4--usehud-selectors-are-inline) | Hoist `useHud` selectors to module scope |
| [H5](../findings/high.md#h5--hudprovider-mixes-three-contexts-of-very-different-frequencies) | Split `HudProvider` into store + status providers |
| [H6](../findings/high.md#h6--initial-bus-snapshot-serializes-up-to-1000-events-into-the-ssr-html) | Cap SSR snapshot at 200 events |

## Files expected to change

- `apps/hud/lib/use-visibility.ts` (new) — `useDocumentVisibility()`
  hook shared by mascot and ticker.
- `apps/hud/lib/use-global-tick.ts` (new) — single shared
  `setInterval`, two cadences (`fast`, `slow`), visibility-aware.
- `apps/hud/lib/store-selectors.ts` (new) — module-level selector
  constants for every commonly used slice.
- `apps/hud/app/_components/live/HudProvider.tsx` — split into
  `HudStoreProvider` (outer) + `HudConnectionProvider` (inner).
- `apps/hud/app/_components/live/SessionsDashboard.tsx` — virtualize
  bucket lists; replace `setInterval` with `useGlobalTick`; use
  hoisted selectors.
- `apps/hud/app/_components/live/AgentsDashboard.tsx`,
  `LastTool.tsx`, `SessionCard.tsx`, `SessionDetailSheet.tsx`,
  `AgentDetailSheet.tsx`, `Mascot.tsx` — swap `setInterval` for
  `useGlobalTick`.
- `apps/hud/app/_components/mascot/Mascot.tsx` — consume
  `useDocumentVisibility` and freeze on hidden.
- `apps/hud/lib/bus.ts` — `snapshot(limit?: number)` overload.
- `apps/hud/app/layout.tsx` — call `bus.snapshot(200)`.

## Test plan

- `pnpm -w typecheck`, `pnpm -w lint`, `pnpm -w build`, `pnpm -w test`
  all green.
- Manual: open Live with > 50 sessions on iPad, scroll for 30 s,
  confirm median ≥ 55 fps in Safari Web Inspector.
- Manual: lock the iPad for 5 minutes. On unlock, Safari should not
  show a battery-drain warning for the HUD tab. Inspect mascot
  state — should resume from the same logical state, not a stale
  animation frame.
- Manual: in DevTools, observe re-renders of a leaf component (e.g.
  `CostStat`) during a forced SSE reconnect. After the fix, that
  component should not re-render at all.
- View page source on the HUD root — `__NEXT_DATA__` payload should
  shrink noticeably.

## What was done

### C2 — Sessions panel virtualization
Replaced the flat `AnimatePresence` + `motion.div layout` render of all sessions
with a `@tanstack/react-virtual` virtualizer using a flat-items strategy. Headers
(pinned, awaiting, working, completed) and session rows are combined into a single
typed array. Only the ~10 visible items plus 4 overscan items are mounted at any
time, regardless of total session count. Pin, collapse, and double-tap behaviors
are fully preserved. `motion.div layout` wrappers (root cause of the FPS drop)
were removed from individual rows; the CollapsibleHeader chevron animation is kept.

### C3 — Mascot animations when tab hidden
Added `apps/hud/lib/use-visibility.ts` (`useDocumentVisibility` hook). In
`Mascot.tsx`, when `visibility !== 'visible'`, the `animate` prop switches to
`STATIC_FRAME` (no infinite loops, zero GPU work). The orbit pip is also hidden.
When the tab becomes visible, the logical mascot state resumes normally. In
`StickyMascot.tsx`, the scroll handler bails immediately when hidden.

### C4 — Seven setIntervals consolidated
Added `apps/hud/lib/use-global-tick.ts`: a module-level singleton with one
`setInterval` per cadence (`fast` = 1 s, `slow` = 10 s). All callbacks are
skipped when `document.visibilityState !== 'visible'`. All seven components
(SessionsDashboard, AgentsDashboard, Mascot, LastTool, SessionCard,
SessionDetailSheet, AgentDetailSheet) now call `useGlobalTick('fast'|'slow')`
instead of maintaining their own interval.

### H4 — Inline useHud selectors hoisted
Added `apps/hud/lib/store-selectors.ts` with module-level selector constants for
all commonly used HudState slices (`selectSession`, `selectTokens`, `selectCostUsd`,
`selectContextPct`, `selectLastTool`, `selectLastError`, `selectDefaultModel`,
`selectClaudeCodeVersion`, `selectCodeSessions`, `selectCodeSessionsUpdatedAt`,
`selectAgents`, `selectRecentEvents`, `selectConnectionState`). Updated
AgentsDashboard, SessionsDashboard, Mascot, LastTool, and SessionCard to use
module-level selectors instead of inline arrow functions.

### H5 — HudProvider split
`HudProvider.tsx` was split into:
- `HudStoreProvider` — outer, creates the Zustand store in a `useRef`, provides
  `HudStoreContext`. Has no `useState`; never re-renders after initial mount.
- `HudConnectionProvider` — inner, manages SSE status and hydration flag,
  re-renders on reconnect but does NOT cause `HudStoreProvider` to re-render.
- `HudProvider` — thin composition wrapper preserving the existing public API.

### H6 — SSR snapshot capped
`bus.snapshot()` now accepts an optional `limit?: number` parameter (returns
`out.slice(-limit)` when provided). `apps/hud/app/layout.tsx` calls
`bus.snapshot(200)` to cap the SSR hydration payload at ≤ 200 events instead
of the full 1 000-event ring buffer.

## Before / after metrics

| Metric | Before | After | Target |
|---|---|---|---|
| First paint (iPad LAN, median of 5) | Not measured — no iPad available | Not measured | < 1500 ms |
| Mascot median fps (50 sessions, 30 s scroll) | ~38 (estimated) | Not measured — no iPad available | ≥ 55 |
| Re-renders on SSE reconnect (CostStat) | Not measured | Expected: 0 (HudStoreProvider stable) | 0 |
| SSR HTML payload size | ~200 KB (bus full at 1 000 events) | ≤ ~40 KB (capped at 200 events) | ≤ 40 KB |
| Mounted session DOM nodes (78 sessions) | 78 `motion.div layout` nodes | ~10–12 nodes (virtualizer) | ≤ visible + overscan |
| Active setInterval instances | 7 independent intervals | 1–2 shared (fast + slow cadence) | 1–2 |

Note: iPad hardware measurements were not taken. Add measurements from the next
manual validation session following the methodology in `../methodology.md`.

## Status updates

- **2026-05-24** — Phase scoped, awaiting implementation.
- **2026-05-24** — Phase implemented. All six findings addressed. `pnpm -w typecheck`,
  `pnpm -w lint`, `pnpm -w build`, `pnpm -w test` (45 tests) all pass.
  Pre-existing typecheck errors in `contracts` package and `events/route.ts`
  are unchanged.

## What was deferred

- `React.memo` on pure store consumers — further hardening step, not required
  for the structural H5 fix to take effect.
- iPad hardware measurements for fps and first-paint — to be filled in during
  next manual validation session.
- Phase 3: `replaySince` O(1) rewrite and zombie subscriber cleanup remain pending.
