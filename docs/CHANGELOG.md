# Documentation Changelog

All notable changes to the documentation are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com), and documentation versioning
uses [Semantic Versioning](https://semver.org) at the major-version level only
(minor and patch revisions are tracked through git history, not version bumps).

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
