# Claude Code HUD — Documentation v1

Welcome to the first version of the HUD documentation. This set covers the
project from its initial design decisions through the v1 product milestone:
a touch-first, hooks-driven, real-time dashboard for Claude Code, designed
primarily for an iPad and secondarily for a Raspberry Pi 5 kiosk or any
modern browser.

---

## Status snapshot

> **Current Phase: 0 — Design Decisions** · Status: **🟠 Blocked**
>
> Two design decisions must be resolved before Phase 1 can begin. See
> [phase-0-design-decisions.md](./phases/phase-0-design-decisions.md).

| Phase | Title | Status |
|---|---|---|
| 0 | Design Decisions | 🟠 Blocked |
| 1 | Scaffold | ⚪ Not Started |
| 2 | Event Contract | ⚪ Not Started |
| 3 | Backend (Ingest, Bus, SSE) | ⚪ Not Started |
| 4 | Hook Script & Installer | ⚪ Not Started |
| 5 | Live View | ⚪ Not Started |
| 6 | Mascot | ⚪ Not Started |
| 7 | Polish & Secondary Views | ⚪ Not Started |
| 8 | PWA & iPad Kiosk | ⚪ Not Started |
| 9 | Raspberry Pi 5 Kiosk | ⚪ Not Started |

For the interactive view with expandable details and persistent progress,
open [`progress.html`](./progress.html) in any browser.

---

## Directory layout

```
docs/v1/
├── README.md           # This file
├── architecture.md     # System topology and data flow
├── conventions.md      # Badges, phase lifecycle, doc rules
├── glossary.md         # Recurring term definitions
├── progress.html       # Interactive single-file tracker
└── phases/
    ├── README.md       # Phases index with per-phase one-liners
    ├── phase-0-design-decisions.md
    ├── phase-1-scaffold.md
    ├── phase-2-event-contract.md
    ├── phase-3-backend.md
    ├── phase-4-hook-script.md
    ├── phase-5-live-view.md
    ├── phase-6-mascot.md
    ├── phase-7-polish.md
    ├── phase-8-pwa-ipad.md
    └── phase-9-raspberry-pi.md
```

---

## Reading order

1. [`architecture.md`](./architecture.md) — understand the system at a glance.
2. [`conventions.md`](./conventions.md) — learn the badge system.
3. [`phases/README.md`](./phases/README.md) — see the full roadmap.
4. [`progress.html`](./progress.html) — open in browser; bookmark it.
5. Individual phase files — read the one you're about to start.

---

## How phases are scoped

Each phase is sized to be **mergeable in one or a small handful of PRs** and to
deliver a **visible, testable outcome**. The roadmap is intentionally
sequential: Phase N's deliverables become Phase N+1's foundation.

There is one explicit exception: Phase 9 (Raspberry Pi 5) is **opt-in** and
not on the critical path to v1.

---

## Out of scope for v1

The following are documented in the project [`CLAUDE.md §14`](../../CLAUDE.md)
and are intentionally **not** part of v1:

- Multi-user / shared HUDs.
- Cloud deployment.
- Per-tool analytics dashboards (only aggregate metrics in v1).
- Editing Claude Code settings from the HUD.
- Voice / audio reactions to events.

These may be revisited in v2.
