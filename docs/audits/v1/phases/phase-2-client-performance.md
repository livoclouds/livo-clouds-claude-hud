# Phase 2 — Client performance

| | |
|---|---|
| **Severity** | Critical |
| **Status** | ⏳ Pending |
| **PR** | — |
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

## Before / after metrics

Filled in when this phase merges.

| Metric | Before | After | Target |
|---|---|---|---|
| First paint (iPad LAN, median of 5) | TBD | TBD | < 1500 ms |
| Mascot median fps (50 sessions, 30 s scroll) | ~38 (estimated) | TBD | ≥ 55 |
| Re-renders on SSE reconnect (CostStat) | TBD | 0 | 0 |
| SSR HTML payload size | ~200 KB (bus full) | ≤ 40 KB | ≤ 40 KB |

## Status updates

- **2026-05-24** — Phase scoped, awaiting implementation.

## What was deferred

(filled in if any item in scope is split out)
