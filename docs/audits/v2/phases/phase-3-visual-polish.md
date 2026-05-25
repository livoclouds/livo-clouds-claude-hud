# Phase 3 — Visual Polish

| | |
|---|---|
| **Severity** | Medium |
| **Status** | ⏳ Pending |
| **PR** | — |
| **Estimated effort** | ~6 hours |
| **Risk of regression** | Medium — adds new components and changes colour variables; contrast changes must not break the visual theme |

---

## Scope

Seven UI/UX findings addressing loading states, animations, colour
contrast, and micro-interactions.

| Finding | Summary |
|---|---|
| [U5](../findings/ux-responsive.md#u5--muted-text-likely-fails-wcag-aa-contrast-on-glass-card-backgrounds) | Fix muted/soft text contrast to pass WCAG AA |
| [U6](../findings/ux-responsive.md#u6--loading-states-are-text-only-no-skeleton-loaders) | Shimmer skeleton loaders for all cards while SSE connecting |
| [U8](../findings/ux-responsive.md#u8--metricsheet-grab-bar-too-small-for-reliable-touch-interaction) | Larger grab-bar indicator on MetricSheet |
| [U9](../findings/ux-responsive.md#u9--no-pull-to-refresh-gesture-on-live-view) | Pull-to-refresh gesture on live view |
| [U10](../findings/ux-responsive.md#u10--stickymascot-shrink-threshold-not-adapted-for-landscape-orientation) | Landscape-aware mascot shrink thresholds |
| [U11](../findings/ux-responsive.md#u11--mascot-sticky-container-lacks-envsafe-area-inset-bottom-guard) | Safe-area-inset guard on mascot container |
| [U12](../findings/ux-responsive.md#u12--no-kiosk-widescreen-layout-for-raspberry-pi-hdmi-displays) | Kiosk full-viewport styles at ≥ 1440 px |

---

## New components

**`apps/hud/components/ui/Skeleton.tsx`** — Shimmer loader component.

```tsx
// Usage:
<Skeleton className="h-20 w-full rounded-xl" />
<Skeleton className="h-4 w-1/2" />
```

- CSS: `animate-[shimmer_1.6s_ease-in-out_infinite]` with a gradient
  `background-size: 200%` sweep.
- Respects `prefers-reduced-motion`: renders a static muted background
  instead of the shimmer animation.
- Used in: `TokenStat`, `CostStat`, `ContextRing` wrapper, session card
  list while `sessions === null`, agent card list while `agents === null`,
  cost chart while data loads.

**`apps/hud/components/gestures/PullToRefresh.tsx`** — Swipe-down refresh.

- Activates when `scrollY === 0` and pointer moves down > 80 px.
- Rubber-band animation: `transform: translateY(min(overscroll, 80px))`.
- On release: trigger `reconnect()` from the SSE client store + re-fetch
  server snapshot. Show spinner for the reconnect duration.
- Respects `prefers-reduced-motion`: no rubber-band, instant trigger.

---

## Files changed

_(To be filled in after implementation.)_

Key files expected to change:
- `apps/hud/components/ui/Skeleton.tsx` (new)
- `apps/hud/components/gestures/PullToRefresh.tsx` (new)
- `apps/hud/app/globals.css` — increase `--color-hud-fg-soft` and `--color-hud-fg-muted` opacity values
- `apps/hud/components/mascot/StickyMascot.tsx` — landscape threshold + safe-area guard
- `apps/hud/components/metrics/MetricSheet.tsx` — grab-bar size
- `apps/hud/app/(live)/page.tsx` — wrap with `<PullToRefresh>`; kiosk styles
- Any metric card / session list components — replace text placeholders with `<Skeleton>`

---

## Test plan

```
pnpm -w typecheck
pnpm -w lint
pnpm -w build
pnpm -w test
```

**Contrast check:**
```bash
npm install -g @axe-core/cli
axe http://localhost:4000/ --rules color-contrast
axe http://localhost:4000/?theme=light --rules color-contrast
# Expected: 0 violations
```

**Skeleton loaders:**
- Open HUD with no events server running (or with network throttling).
- Confirm all metric cards, session list, agent list, and cost chart show
  shimmer skeletons — not blank areas or error text.
- With `prefers-reduced-motion` enabled: shimmer should be replaced by a
  static placeholder.

**Pull-to-refresh:**
- On mobile/tablet: pull down from the top of the live view; confirm
  spinner appears and SSE reconnects.
- Confirm it does not trigger during a mid-page scroll (only when `scrollY === 0`).

**Mascot (landscape):**
- On iPad in landscape: scroll the sessions list; confirm the mascot
  compact threshold does not fire within the first ~100 px of scroll.

---

## Before / after metrics

| Metric | Before | After | Target |
|---|---|---|---|
| WCAG AA failures (dark theme) | ~4 (estimated) | 0 | 0 |
| WCAG AA failures (light theme) | ~4 (estimated) | 0 | 0 |
| First-paint skeleton coverage | 0% (text placeholders) | 100% | 100% |
| MetricSheet grab bar size | 6 × 48 px | 5 × 64 px | ≥ 5 × 60 px |
| Pull-to-refresh available | No | Yes | Yes |

---

## Status updates

- **2026-05-24** — Phase scoped, awaiting implementation.

## What was deferred

_(To be filled in after implementation.)_
