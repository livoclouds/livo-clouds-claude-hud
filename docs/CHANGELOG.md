# Documentation Changelog

All notable changes to the documentation are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com), and documentation versioning
uses [Semantic Versioning](https://semver.org) at the major-version level only
(minor and patch revisions are tracked through git history, not version bumps).

---

## [v1.0.5] — 2026-05-23

### Changed

- Phase 7 sealed on 2026-05-23 — polish + secondary views landed. See
  [phase-7](./v1/phases/phase-7-polish.md). The HUD now ships with:
  - `next-themes` driving a `data-theme` attribute, light + dark token sets
    in `apps/hud/app/globals.css`, a `<ThemeToggle>` mounted in the bottom
    `<NavBar>`, and `disableTransitionOnChange` to avoid hydration flashes.
  - `apps/hud/lib/aggregations.ts` — server-only daily reducer with an
    immutable past-day cache; consumed by `/sessions` (last 14 days,
    sortable by cost or recency) and `/cost` (14-day USD bar + tokens-out
    line chart). The Recharts client is dynamic-imported with `ssr: false`.
  - `<Gestures>` wrapper around the App Router using `@use-gesture/react`
    to swipe through `/cost · / · /sessions · /mascot`. `<LongPressable>`
    wraps token / cost / context cards to open a bottom `<MetricSheet>`
    that dismisses on swipe-down, backdrop tap, dismiss button, or Escape.
  - Reduced-motion gates on the swipe peek, sheet spring, and chart bar /
    line animations layer on top of the existing
    `AnimatedNumber` / `ContextRing` / `Mascot` paths.
  - **D-7.1** resolved to the default (last 14 days; no "show all" in v1).
  - **D-7.2** resolved to day buckets only (hour drill-in deferred).
  - **D-7.3** resolved to the gesture map above; tap-on-mascot deferred.
- Phase 7 status moved from ⚪ Not Started to 🟢 Complete in
  [`v1/phases/README.md`](./v1/phases/README.md) and
  [`v1/progress.html`](./v1/progress.html). Phase 8 (PWA & iPad kiosk) is
  now unblocked.

---

## [v1.0.4] — 2026-05-23

### Changed

- Phase 5 sealed on 2026-05-23 — the live view is now the entry view at `/`.
  See [phase-5](./v1/phases/phase-5-live-view.md). The Server Component
  hydrates from `bus.snapshot()` and folds events through `reduce()` from
  `apps/hud/lib/store.ts`; the same reducer runs in the SSE client so the
  RSC snapshot and live updates produce identical state. `EventSource`
  reconnects via the browser's automatic `Last-Event-ID` header, with an
  extra `visibilitychange` re-open for iPad Safari and exponential backoff
  on persistent errors. Counter animations use `motion`'s `useSpring`
  (stiffness 200, damping 30) and honor `prefers-reduced-motion`.
  - **D-5.1** resolved to the default Motion spring (200/30; settles <600 ms).
  - **D-5.2** resolved to thresholds `{ warn: 70, critical: 90 }` in
    `apps/hud/lib/thresholds.ts`. Boundary transitions verified end-to-end.
  - **D-5.3** resolved to "latest `tool.use` for the active session";
    sub-agent activity is folded into the parent session in v1.
- Added `apps/hud/scripts/synth-event.sh` — bash helper that posts synthetic
  events to a running HUD for local QA without Claude Code.
- Phase 5 status moved from ⚪ Not Started to 🟢 Complete in
  [`v1/phases/README.md`](./v1/phases/README.md) and
  [`v1/progress.html`](./v1/progress.html). Phase 6 is now unblocked.

---

## [v1.0.3] — 2026-05-23

### Changed

- Phase 2 sealed on 2026-05-23 — `@livoclouds/contracts` now exports
  `HudEventSchema` (Zod discriminated union over 8 event variants) plus
  inferred TypeScript types and per-variant `Extract<>` aliases. Vitest suite
  covers 10 positive fixtures and 9 negative cases asserting precise Zod
  error paths. See [phase-2](./v1/phases/phase-2-event-contract.md).
  - **D-2.1** resolved to the default 8-hook proposal.
  - **D-2.2** resolved to the default numeric units (tokens integer, `costUsd`
    float, `contextPct` 0–100 float, `durationMs` / `ts` integers).
- Phase 2 status moved from ⚪ Not Started to 🟢 Complete in
  [`v1/phases/README.md`](./v1/phases/README.md) and
  [`v1/progress.html`](./v1/progress.html). Phases 3 and 4 are now unblocked.

---

## [v1.0.2] — 2026-05-23

### Changed

- Phase 1 sealed on 2026-05-23 — monorepo scaffold landed (see
  [phase-1](./v1/phases/phase-1-scaffold.md)). pnpm workspace + `apps/hud`
  (Next.js 16, React 19, Tailwind 4) + `packages/contracts` skeleton +
  `hooks/claude-hook.sh` stub. Root scripts `dev`, `build`, `lint`, `typecheck`,
  `test`, `format` wired across workspaces.
- Phase 1 status moved from ⚪ Not Started to 🟢 Complete in
  [`v1/phases/README.md`](./v1/phases/README.md) and
  [`v1/progress.html`](./v1/progress.html). Phase 2 is now unblocked.

---

## [v1.0.1] — 2026-05-22

### Changed

- Phase 0 sealed on 2026-05-22 — design decisions D-0.1 through D-0.4 resolved
  (see [phase-0](./v1/phases/phase-0-design-decisions.md)):
  - **D-0.1 Mascot art**: Option A — stylized Claude `✦` glyph, animated with
    Motion + CSS.
  - **D-0.2 Visual tone**: Glassmorphism.
  - **D-0.3 Package manager**: pnpm.
  - **D-0.4 Local port**: 3000.
- Phase 0 status moved from 🟠 Blocked to 🟢 Complete in
  [`v1/phases/README.md`](./v1/phases/README.md) and
  [`v1/progress.html`](./v1/progress.html). Phase 1 is now unblocked.

---

## [v1.0.0] — 2026-05-22

### Added

- Initial documentation set under [`v1/`](./v1).
- 10-phase roadmap covering the path from design decisions to a Raspberry Pi 5
  kiosk deployment:
  - Phase 0 — Design Decisions
  - Phase 1 — Scaffold
  - Phase 2 — Event Contract
  - Phase 3 — Backend (Ingest, Bus, SSE)
  - Phase 4 — Hook Script & Installer
  - Phase 5 — Live View
  - Phase 6 — Mascot
  - Phase 7 — Polish & Secondary Views
  - Phase 8 — PWA & iPad Kiosk
  - Phase 9 — Raspberry Pi 5 Kiosk
- Interactive HTML progress tracker ([`v1/progress.html`](./v1/progress.html))
  with status badges, expandable phase detail cards, filtering, and persistent
  local progress via `localStorage`.
- [`v1/architecture.md`](./v1/architecture.md) — system topology and data-flow
  reference.
- [`v1/glossary.md`](./v1/glossary.md) — definitions of recurring terms.
- [`v1/conventions.md`](./v1/conventions.md) — phase lifecycle, status badges,
  documentation rules.
- Top-level [`README.md`](./README.md) — versioning policy and navigation map.

### Notes

- Phase 0 is the only phase that is **🟠 Blocked** at v1.0.0. All other phases
  are **⚪ Not Started** and depend on Phase 0 resolution.
- All future doc edits within `v1/` are tracked through git history; only major
  doc rewrites trigger a version bump (e.g. `v2/`).
