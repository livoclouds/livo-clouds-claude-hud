# UI/UX findings (U1 – U13)

Thirteen findings about the HUD's visual and interaction quality across
device surfaces. The primary target (iPad) currently works, but desktop and
mobile experiences are incomplete, touch targets are too small, and several
visual states are missing.

Findings in this file are frozen as of 2026-05-24. Fixes are tracked in
[Phase 2](../phases/phase-2-device-adaptive-ux.md) (layout) and
[Phase 3](../phases/phase-3-visual-polish.md) (polish).

---

## U1 — Touch targets below 44 × 44 pt minimum

| | |
|---|---|
| **Severity** | High |
| **Location** | Multiple components — see below |
| **Phase** | [Phase 2](../phases/phase-2-device-adaptive-ux.md) |
| **Budget broken** | CLAUDE.md §10 — "Tap targets ≥ 44 × 44 pt" |

**Affected elements:**

| Element | Measured size | Location |
|---------|--------------|----------|
| Pin/unpin button | 28 × 28 px | `AgentsDashboard.tsx` line ~81, `SessionsDashboard.tsx` line ~124 |
| Collapse chevron | ~32 × 32 px | `SessionsDashboard.tsx` — section headers |
| SessionsFilterBar chips | 36 px height | `SessionsFilterBar.tsx` |

On an iPad, users frequently mis-tap these elements during normal session
monitoring, triggering accidental pin/unpin or collapse/expand.

**Fix.** Add `min-h-[44px] min-w-[44px]` to all affected elements.
Where the visual size must remain small (e.g., inline icons), add invisible
touch padding via `p-2` or `after:` pseudo-element expansion.

---

## U2 — Sessions table has no responsive variant for mobile/tablet portrait

| | |
|---|---|
| **Severity** | Medium |
| **Location** | `apps/hud/app/sessions/page.tsx` |
| **Phase** | [Phase 2](../phases/phase-2-device-adaptive-ux.md) |

**Symptom.** The sessions view renders as a full-width table with small
font (`text-[10px]`) and tight horizontal padding (`px-4 py-3`). On iPad
portrait (768 px) and narrower viewports, header cells become truncated,
columns overlap, and the horizontal scroll introduced by overflow-x is
not discoverable. There is no alternative layout for narrow screens.

**Fix.** Add a `<SessionsCardList>` variant that renders below the `md:`
breakpoint (768 px), showing each session as a card with the key fields
stacked vertically. The existing table stays for `md:+` (tablet landscape
and desktop).

---

## U3 — No `xl:` breakpoint variants; kiosk displays left with dead space

| | |
|---|---|
| **Severity** | Medium |
| **Location** | All pages — metric grids and container widths |
| **Phase** | [Phase 2](../phases/phase-2-device-adaptive-ux.md) |

**Symptom.** The largest responsive variant is `lg:` (1024 px), which
produces a 3-column metric grid (`lg:grid-cols-3`) and `max-w-6xl` (72 rem)
containers. On a Raspberry Pi with a 1080p HDMI panel (1920 px), or any
wide desktop monitor, ~35% of the viewport is empty. The HUD looks like a
small card in the centre of a dark screen — not a "heads-up display".

**Fix.** Add `xl:grid-cols-4` to the metric grid. Add a `kiosk` Tailwind
screen size (e.g., `1440px`) with `max-w-screen-kiosk` containers and a
4-column grid that fills the viewport width.

---

## U4 — Hover-only affordances; no `active:` states for touch

| | |
|---|---|
| **Severity** | Medium |
| **Location** | Multiple components — NavBar, AgentCard, SessionCardRow, filter chips, theme toggle |
| **Phase** | [Phase 2](../phases/phase-2-device-adaptive-ux.md) |

**Symptom.** State-implying affordances (border colour shift, background
tint, text colour change) are implemented only with `hover:` pseudo-classes.
On touch devices, `hover:` does not fire during a tap — it may fire on the
first tap (the infamous iOS hover-lock) or not at all. Users on iPad get
no visual feedback that a tap is registering until the action completes.

**Specific cases:**
- `AgentCard`: `hover:border-[color:...]` — no press feedback
- `SessionCardRow`: `hover:bg-[color:...]` — no press feedback
- `NavBar` items: `hover:text-[color:...]` — no active state
- `SessionsFilterBar` chips: `hover:text-[color:...]` — no active state

**Fix.** Add `active:` counterparts to every `hover:` that implies state.
Use `active:scale-[0.97] active:opacity-80 transition-transform duration-75`
as the baseline press feedback pattern. Apply consistently via a Tailwind
plugin or shared class constant.

---

## U5 — Muted text likely fails WCAG AA contrast on glass-card backgrounds

| | |
|---|---|
| **Severity** | Medium |
| **Location** | `apps/hud/app/globals.css` — CSS custom properties |
| **Phase** | [Phase 3](../phases/phase-3-visual-polish.md) |

**Symptom.** Two CSS variables use low-opacity white/black:

```css
--color-hud-fg-soft:  rgba(244, 244, 244, 0.70); /* dark theme */
--color-hud-fg-muted: rgba(244, 244, 244, 0.45); /* dark theme */
```

On the glass-card background (`rgba(255,255,255,0.05)` over a gradient),
the effective contrast ratio of `--color-hud-fg-muted` is estimated at
~2.8:1, well below the WCAG AA requirement of 4.5:1 for normal text.
`--color-hud-fg-soft` at 70% opacity is borderline (~3.8:1 estimated).
Neither has been measured against the actual rendered background.

**Fix.** Run a WCAG contrast audit with axe-core (see
[methodology §Budget 9](../methodology.md)). Increase opacity values
until both variables pass AA: targeting `--color-hud-fg-soft ≥ 80%` and
`--color-hud-fg-muted ≥ 60%`. Apply the same correction to the light theme.

---

## U6 — Loading states are text-only; no skeleton loaders

| | |
|---|---|
| **Severity** | Medium |
| **Location** | Multiple components — metric cards, session list, agent list, cost chart |
| **Phase** | [Phase 3](../phases/phase-3-visual-polish.md) |

**Symptom.** When the SSE connection is not yet established (first paint,
reconnect), all panels show plain text placeholders: "Waiting for a Claude
Code session…", "Waiting for sessions snapshot…", "No agents invoked yet".
The HUD looks dead and empty on first load, violating CLAUDE.md §6
("Optimistic skeletons, never blank pages, on first paint. The HUD must
look alive even before the first event arrives.").

**Fix.** Implement a `<Skeleton>` shimmer component. Replace text
placeholders in metric cards, session list, agent list, and cost chart
with appropriately-sized shimmer rectangles while the SSE stream is in
`connecting` or `reconnecting` state. The shimmer animation should respect
`prefers-reduced-motion`.

---

## U7 — Bottom navigation is wrong on desktop (≥1024 px)

| | |
|---|---|
| **Severity** | Medium |
| **Location** | `apps/hud/components/layout/NavBar.tsx` |
| **Phase** | [Phase 2](../phases/phase-2-device-adaptive-ux.md) |

**Symptom.** The NavBar is a fixed bottom bar (`fixed bottom-0`) on all
screen sizes. This is the correct pattern for mobile and tablet (mirrors
iOS tab bar, thumb-reachable). On desktop (≥1024 px), a bottom bar
violates decades of desktop UX conventions — users expect left sidebar
navigation or a top nav bar for a data dashboard.

Additionally, on desktop the right side of the screen is wasted — a left
sidebar would expose the full viewport to content, which matters for the
wide-layout goals in U3.

**Fix.** Make NavBar responsive: `md:hidden` on the current bottom nav;
render a `hidden md:flex flex-col` left sidebar at the same breakpoint
that the layout shifts to desktop mode.

---

## U8 — MetricSheet grab-bar too small for reliable touch interaction

| | |
|---|---|
| **Severity** | Low |
| **Location** | `apps/hud/components/metrics/MetricSheet.tsx` |
| **Phase** | [Phase 3](../phases/phase-3-visual-polish.md) |

**Symptom.** The grab-bar indicator at the top of the MetricSheet is 6 px
tall and 48 px wide. While the sheet can be swiped down to dismiss from
anywhere, the visual indicator does not communicate this affordance
clearly enough. Users unfamiliar with the pattern may not know the sheet
is dismissible by swipe.

**Fix.** Increase to `h-[5px] w-16 rounded-full` with `opacity-40` (a
more visible but still subtle pill). Consider adding a subtle `opacity-60`
on hover/press to reinforce the grab affordance.

---

## U9 — No pull-to-refresh gesture on live view

| | |
|---|---|
| **Severity** | Low |
| **Location** | `apps/hud/app/(live)/page.tsx` |
| **Phase** | [Phase 3](../phases/phase-3-visual-polish.md) |

**Symptom.** Mobile and tablet users expect swipe-down from the top of a
feed to trigger a manual refresh. The HUD has no such gesture. While SSE
reconnects automatically, a user who suspects the stream is stale has no
explicit way to force a snapshot refresh without reloading the page.

**Fix.** Add a `<PullToRefresh>` component wrapping the live view. On
swipe-down > 80 px: trigger `close()` then re-open the SSE connection and
re-fetch the server snapshot. Animate a spinner at the top during the
refresh. Respect `prefers-reduced-motion`.

---

## U10 — StickyMascot shrink threshold not adapted for landscape orientation

| | |
|---|---|
| **Severity** | Low |
| **Location** | `apps/hud/components/mascot/StickyMascot.tsx` |
| **Phase** | [Phase 3](../phases/phase-3-visual-polish.md) |

**Symptom.** The mascot shrinks when `scrollY > 80` and reaches full
compact mode at `scrollY > 240`. These thresholds were designed for
portrait orientation (tall viewport). In iPad Pro landscape (1024 × 768),
the viewport height is significantly shorter. A user scrolling the
sessions list in landscape mode will trigger the compact mascot within
the first few hundred pixels, making the mascot feel jittery or
disappearing too early.

**Fix.** Use a `@media (orientation: landscape)` query (or
`window.matchMedia` via a hook) to raise thresholds to e.g. `40` / `120`
in landscape mode.

---

## U11 — Mascot sticky container lacks `env(safe-area-inset-bottom)` guard

| | |
|---|---|
| **Severity** | Low |
| **Location** | `apps/hud/components/mascot/StickyMascot.tsx` |
| **Phase** | [Phase 3](../phases/phase-3-visual-polish.md) |

**Symptom.** The sticky mascot uses `bottom: 0` or equivalent without
accounting for the iOS home indicator safe area. On iPad models with Face
ID (no Home button), the mascot may render behind or overlap the system
home indicator zone, causing it to be visually clipped or tapped
accidentally when reaching for the home indicator.

**Fix.** Apply `pb-[max(env(safe-area-inset-bottom),0.75rem)]` (or
equivalent Tailwind utility) to the mascot sticky container bottom
padding — matching the pattern already used in `NavBar.tsx`.

---

## U12 — No kiosk/widescreen layout for Raspberry Pi HDMI displays

| | |
|---|---|
| **Severity** | Low |
| **Location** | All pages — `max-width` containers |
| **Phase** | [Phase 2](../phases/phase-2-device-adaptive-ux.md) |

**Symptom.** All page containers use `max-w-6xl` (72 rem = 1152 px) or
`max-w-7xl` (80 rem = 1280 px). A Raspberry Pi 5 connected to a 1080p
HDMI panel displays the HUD centred in a ~30% of the available width,
leaving significant dark margins. For a physical desk display meant to
be visible from across the room, this wastes screen real estate.

**Fix.** Add a `kiosk` Tailwind screen breakpoint at `1440px`. At `kiosk:`
and above: remove `max-width` constraints; use a full-viewport grid with
the mascot taking up ~40% of the left panel and metrics/sessions filling
the right panel. This layout is purely additive and does not affect
tablet/desktop.

---

## U13 — `SessionsFilterBar` chips below touch target threshold

| | |
|---|---|
| **Severity** | Low |
| **Location** | `apps/hud/components/sessions/SessionsFilterBar.tsx` |
| **Phase** | [Phase 2](../phases/phase-2-device-adaptive-ux.md) |

**Symptom.** Filter chips in the sessions filter bar use `h-9` (36 px).
This is 8 px below the 44 px minimum touch target. The chips also lack
`:active` press feedback — they change background on `hover:` but not on
tap. On iPad, the combination of small size and no tactile-equivalent
feedback makes the filter bar feel unresponsive.

**Fix.** Increase to `h-11` (44 px). Add `active:scale-[0.97]
active:opacity-80 transition-transform duration-75` matching the
global press feedback pattern from U4.
