# Claude Code HUD — Documentation v1

Welcome to the first version of the HUD documentation. This set covers the
project from its initial design decisions through the v1 product milestone:
a touch-first, hooks-driven, real-time dashboard for Claude Code, designed
primarily for an iPad and secondarily for a Raspberry Pi 5 kiosk or any
modern browser.

---

## Status snapshot

> **v1 shipped.** All ten phases are 🟢 Complete. The HUD is installable on
> iPad, deployable as a Raspberry Pi 5 kiosk (opt-in), and ready to consume a
> live Claude Code session.

| Phase | Title                           | Status      |
| ----- | ------------------------------- | ----------- |
| 0     | Design Decisions                | 🟢 Complete |
| 1     | Scaffold                        | 🟢 Complete |
| 2     | Event Contract                  | 🟢 Complete |
| 3     | Backend (Ingest, Bus, SSE)      | 🟢 Complete |
| 4     | Hook Script & Installer         | 🟢 Complete |
| 5     | Live View                       | 🟢 Complete |
| 6     | Mascot                          | 🟢 Complete |
| 7     | Polish & Secondary Views        | 🟢 Complete |
| 8     | PWA & iPad Kiosk                | 🟢 Complete |
| 9     | Raspberry Pi 5 Kiosk _(opt-in)_ | 🟢 Complete |

For the interactive view with expandable details and persistent progress,
open [`progress.html`](./progress.html) in any browser.

New here? Start with [`getting-started.md`](./getting-started.md) — it routes
you to the right setup guide for your use case.

---

## Directory layout

```
docs/v1/
├── README.md                          # This file
├── getting-started.md                 # Persona-routed quickstart
├── architecture.md                    # System topology and data flow
├── conventions.md                     # Badges, phase lifecycle, doc rules
├── glossary.md                        # Recurring term definitions
├── progress.html                      # Interactive single-file tracker
├── setup/
│   ├── setup-hook.md                  # Wire Claude Code → HUD
│   ├── setup-ipad.md                  # iPad PWA kiosk
│   └── setup-raspberry-pi-kiosk.md    # Raspberry Pi 5 kiosk (opt-in)
└── phases/
    ├── README.md                      # Phases index
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

If you're trying to **run** the HUD: jump straight to
[`getting-started.md`](./getting-started.md). It routes you to the right setup
guide for your use case.

If you're trying to **understand** the system:

1. [`../../CLAUDE.md`](../../CLAUDE.md) — architectural constitution (read this
   first if you plan to contribute).
2. [`architecture.md`](./architecture.md) — the system at a glance.
3. [`conventions.md`](./conventions.md) — badge system and phase lifecycle.
4. [`phases/README.md`](./phases/README.md) — the full roadmap, all 10 phases
   complete.
5. [`progress.html`](./progress.html) — open in browser; bookmark it.
6. Individual phase files — each documents that phase's scope, deliverables,
   and acceptance criteria.

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
