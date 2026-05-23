# Phases Index

The HUD roadmap is divided into **10 phases**, each sized to deliver a visible,
testable outcome and merge in one or a small handful of PRs. The roadmap is
sequential: Phase N's deliverables become Phase N+1's foundation, with one
explicit exception (Phase 9 is opt-in).

For the **live status** of each phase, see [`../progress.html`](../progress.html)
or the table below.

---

| ID | Title | Status | Depends on | Blocks | Headline outcome |
|---|---|---|---|---|---|
| [phase-0](./phase-0-design-decisions.md) | Design Decisions | 🟠 Blocked | — | 1, 6, 7 | Mascot art direction and visual tone chosen |
| [phase-1](./phase-1-scaffold.md) | Scaffold | ⚪ Not Started | 0 | 2 | Monorepo runs `pnpm dev` with empty Next.js shell |
| [phase-2](./phase-2-event-contract.md) | Event Contract | ⚪ Not Started | 1 | 3, 4 | `HudEventSchema` published in `packages/contracts` |
| [phase-3](./phase-3-backend.md) | Backend (Ingest, Bus, SSE) | ⚪ Not Started | 2 | 4, 5 | `POST /api/events` and `GET /api/stream` wired end-to-end in-process |
| [phase-4](./phase-4-hook-script.md) | Hook Script & Installer | ⚪ Not Started | 2, 3 | 5 | Real Claude Code session emits events to HUD |
| [phase-5](./phase-5-live-view.md) | Live View | ⚪ Not Started | 3, 4 | 6 | First UI: metrics update live without page refresh |
| [phase-6](./phase-6-mascot.md) | Mascot | ⚪ Not Started | 0, 5 | 7 | Animated mascot reacts to events in real time |
| [phase-7](./phase-7-polish.md) | Polish & Secondary Views | ⚪ Not Started | 5, 6 | 8 | Themes, gestures, `/sessions`, `/cost` views |
| [phase-8](./phase-8-pwa-ipad.md) | PWA & iPad Kiosk | ⚪ Not Started | 7 | — | HUD installs on iPad home screen, runs as kiosk |
| [phase-9](./phase-9-raspberry-pi.md) | Raspberry Pi 5 Kiosk | ⚪ Not Started | 7 | — | (Opt-in) Pi 5 boots into HUD in Chromium kiosk mode |

---

## Dependency graph

```
              ┌───────────────┐
              │ 0 Design      │
              └───────┬───────┘
                      │
              ┌───────▼───────┐
              │ 1 Scaffold    │
              └───────┬───────┘
                      │
              ┌───────▼───────┐
              │ 2 Contract    │
              └───────┬───────┘
              ┌───────┴────────────────┐
              ▼                        ▼
   ┌───────────────┐         ┌─────────────────┐
   │ 3 Backend     │         │ 4 Hook Script   │
   └───────┬───────┘         └────────┬────────┘
           └─────────┬──────────────────┘
                     ▼
              ┌───────────────┐
              │ 5 Live View   │
              └───────┬───────┘
                      │
              ┌───────▼───────┐
              │ 6 Mascot      │
              └───────┬───────┘
                      │
              ┌───────▼───────┐
              │ 7 Polish      │
              └───────┬───────┘
              ┌───────┴───────┐
              ▼               ▼
   ┌─────────────────┐  ┌─────────────────┐
   │ 8 PWA / iPad    │  │ 9 Pi 5 (opt-in) │
   └─────────────────┘  └─────────────────┘
```

---

## Reading any phase file

Every phase file follows the structure defined in
[`../conventions.md`](../conventions.md#phase-document-structure). At minimum
each contains: Overview, Goals, In Scope, Out of Scope, Open Decisions,
Deliverables, Acceptance Criteria, Tasks, Risks, Related.
