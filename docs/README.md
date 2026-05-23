# Documentation — Claude Code HUD

This directory contains the project's design, planning, and engineering
documentation. It is the **source of truth** for what the HUD is, how it works,
and how it evolves over time.

---

## Current version

→ **[v1](./v1)** — Initial release documentation

## Versioning policy

Documentation is versioned by **major product milestones**, not by minor edits.
Each major version lives in its own subdirectory (`v1/`, `v2/`, …). Older
versions are preserved verbatim for historical reference; they are never
rewritten in place.

When a new major version is created:

1. Copy the most recent version directory into a new one (`cp -r v1 v2`).
2. Update `docs/README.md` to point to the new "Current version".
3. Add an entry to [`CHANGELOG.md`](./CHANGELOG.md) describing the version bump.
4. Edit only the new version; never modify a sealed prior version.

This guarantees future readers can trace any decision back to the version of the
documentation that was current when the decision was made.

See [`CHANGELOG.md`](./CHANGELOG.md) for the full history of documentation
versions.

---

## How to navigate

| Need                                    | Go to                                                                            |
| --------------------------------------- | -------------------------------------------------------------------------------- |
| **Persona-routed quickstart**           | [`v1/getting-started.md`](./v1/getting-started.md)                               |
| **Setup — hook (Claude Code → HUD)**    | [`v1/setup/setup-hook.md`](./v1/setup/setup-hook.md)                             |
| **Setup — iPad kiosk**                  | [`v1/setup/setup-ipad.md`](./v1/setup/setup-ipad.md)                             |
| **Setup — Raspberry Pi 5 kiosk**        | [`v1/setup/setup-raspberry-pi-kiosk.md`](./v1/setup/setup-raspberry-pi-kiosk.md) |
| **Phases & roadmap**                    | [`v1/phases/`](./v1/phases)                                                      |
| **Live progress tracker (interactive)** | [`v1/progress.html`](./v1/progress.html)                                         |
| **System architecture**                 | [`v1/architecture.md`](./v1/architecture.md)                                     |
| **Glossary of terms**                   | [`v1/glossary.md`](./v1/glossary.md)                                             |
| **Status badges & conventions**         | [`v1/conventions.md`](./v1/conventions.md)                                       |

---

## Reading order for new contributors

1. The repo's top-level [`CLAUDE.md`](../CLAUDE.md) — architectural constitution.
2. [`v1/architecture.md`](./v1/architecture.md) — system at a glance.
3. [`v1/conventions.md`](./v1/conventions.md) — badge system and phase lifecycle.
4. [`v1/phases/README.md`](./v1/phases/README.md) — the roadmap.
5. [`v1/progress.html`](./v1/progress.html) — bookmark this; it persists state
   locally so you can mark progress without committing changes.

---

## Conventions summary

- All documentation is written in **English**.
- Files use **kebab-case** (`phase-3-backend.md`).
- Phase numbers are **stable**; cancelled phases keep their number and are
  marked 🔴.
- Diagrams are ASCII first, SVG only if ASCII cannot express the idea.
