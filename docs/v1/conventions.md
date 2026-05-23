# Documentation Conventions

These conventions apply to every document under [`v1/`](./README.md). Future
versions (`v2/`, …) may revise them, but `v1/` remains frozen at these rules.

---

## Phase lifecycle

Each phase moves through these states. **Only one state is current at a time**.

| Badge | State | Meaning |
|---|---|---|
| ⚪ | **Not Started** | Phase exists in the roadmap but no work has begun |
| 🔵 | **Planned** | Scoped and ready to start once dependencies clear |
| 🟡 | **In Progress** | Active development on the phase's deliverables |
| 🟠 | **Blocked** | Cannot proceed until a decision or dependency resolves |
| 🟢 | **Complete** | All acceptance criteria met and merged to `main` |
| 🔴 | **Cancelled** | Removed from scope; the file is preserved for context |

### Transition rules

- ⚪ → 🔵 when scope is approved and dependencies are met.
- 🔵 → 🟡 when the first commit lands in a feature branch for the phase.
- 🟡 → 🟠 if a blocking decision is discovered mid-flight.
- 🟡 → 🟢 only after acceptance criteria are verified, **including manual
  verification on the target device** when relevant.
- Any → 🔴 only by explicit decision recorded in `docs/CHANGELOG.md`.

---

## Phase document structure

Every file in [`phases/`](./phases/) follows this skeleton. Sections are
**required** unless marked optional.

```
# Phase <N> — <Title>

| Field | Value |
|---|---|
| Phase ID | phase-<n> |
| Status | <badge + word> |
| Depends on | <phase IDs or "—"> |
| Blocks | <phase IDs that depend on this one> |
| Target outcome | <one sentence> |

## Overview            (one paragraph)
## Goals               (bulleted, each testable)
## In Scope            (what this phase delivers)
## Out of Scope        (what this phase will not deliver, with reason)
## Open Decisions      (questions to resolve, each with a default proposal)
## Deliverables        (concrete artifacts: files, endpoints, scripts)
## Acceptance Criteria (how we verify the phase is done)
## Tasks               (ordered implementation steps)
## Risks               (known concerns and mitigations)
## Related             (links to other docs / external references)
## Change Log          (optional — per-phase notable updates)
```

---

## Language

- All documentation is written in **English**, matching
  [`CLAUDE.md §4`](../../CLAUDE.md).
- Spanish is allowed only in conversational session context, never in committed
  documents.

---

## File naming

| Type | Pattern | Example |
|---|---|---|
| Phase | `phase-<n>-<kebab-name>.md` | `phase-3-backend.md` |
| Topic doc | `<kebab-name>.md` | `architecture.md` |
| Setup guide | `setup-<target>.md` | `setup-ipad.md` |

**Phase numbers are stable.** If a phase is cancelled or split, its number is
never reused. Cancelled phases keep their file and are marked 🔴.

---

## Diagrams

- **ASCII first.** Use box-drawing characters for system diagrams.
- **SVG only if ASCII cannot express the idea** (e.g., complex state machines).
- SVGs live under `docs/v1/assets/` and are referenced with relative paths.

---

## Cross-references

Use relative links from the current file. Never hardcode the host or branch.

```md
✅ [Architecture](../architecture.md)
✅ [Phase 3](./phase-3-backend.md)
❌ https://github.com/livoclouds/livo-clouds-claude-hud/blob/main/docs/v1/architecture.md
```

---

## Change tracking

- Edits **within** a documentation version (e.g. updating Phase 3 inside
  `v1/`) are tracked through normal git history and PR descriptions — no
  changelog entry is required.
- A new documentation version (`v2/`) **does** require an entry in
  [`docs/CHANGELOG.md`](../CHANGELOG.md).
