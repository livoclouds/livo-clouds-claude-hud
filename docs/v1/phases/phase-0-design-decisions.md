# Phase 0 — Design Decisions

| Field | Value |
|---|---|
| Phase ID | `phase-0` |
| Status | 🟢 Complete |
| Depends on | — |
| Blocks | `phase-1`, `phase-6`, `phase-7` |
| Target outcome | All four design questions are answered and documented, unblocking implementation |

---

## Overview

This phase resolves the design questions that downstream code is too expensive
to undo. Two questions touch visual identity (mascot art, tone) and two touch
operational defaults (package manager, local port). Until they are answered,
Phase 1 cannot begin without risking rework.

## Goals

- Decide the **mascot art direction** and record the rationale.
- Decide the **visual tone** and record the rationale.
- Confirm the **package manager** (default proposal: pnpm).
- Confirm the **local port** (default proposal: 3000).

## In Scope

- Discussion, comparison, and final decision for each question below.
- Recording the decision (and discarded options) in this file.
- A short note in `docs/CHANGELOG.md` once decisions are sealed.

## Out of Scope

- Producing the mascot artwork itself. Asset production happens in Phase 6
  using the direction chosen here.
- Committing any design tokens or theme files. That is part of Phase 1.

## Open Decisions

### D-0.1 — Mascot art direction

| Option | Description | Cost | Identity |
|---|---|---|---|
| **A** | Stylize the official Claude `✦` glyph with Motion + CSS animations | Low | Inherits Anthropic identity |
| **B** | Commission an original mascot (illustrator + Lottie files per state) | High | Unique to LivoClouds |
| **C** | Generate sprite states with image AI, rig in Lottie | Medium | Distinct but iterative |

**Default proposal**: A — fastest path to a working HUD; can upgrade to B in a
future version without rewriting the state machine.

### D-0.2 — Visual tone

| Option | Tagline | Best fit |
|---|---|---|
| **Glassmorphism** | Apple-like blurs, translucency | Looks lush on iPad's display |
| **Neo-terminal** | Monospace, dark, amber/green accents | "Retro monitor on the desk" |
| **Minimalist** | Linear/Vercel style, whitespace-heavy | Maximally readable, low ornament |
| **Editorial Anthropic** | Cream/orange palette, serif titles | Hews close to Claude's brand |

**Default proposal**: Glassmorphism — the iPad display is the primary surface
and benefits the most from depth and blur.

### D-0.3 — Package manager

**Default proposal**: **pnpm** (matches `livo-clouds-web-app` and
`livo-clouds-api-app`). Reason: workspace support, fast installs, deterministic
lockfile, no surprises for contributors who already work in sibling repos.

### D-0.4 — Local port

**Default proposal**: **3000**. The Next.js default. If a developer also runs
`livo-clouds-web-app` on 3000, document the override pattern in Phase 1's
README (`PORT=3010 pnpm dev`).

## Deliverables

- This file, with the **Decisions Resolved** section below filled in.
- A `docs/CHANGELOG.md` entry under the next version stamp recording the
  decisions.

## Acceptance Criteria

- Each of D-0.1 through D-0.4 has an answer recorded below.
- The status badge on this phase moves from 🟠 Blocked to 🟢 Complete in
  `phases/README.md` and `progress.html`.
- A note "Phase 0 sealed on YYYY-MM-DD" appears in `docs/CHANGELOG.md`.

## Tasks

1. Review options for D-0.1 and D-0.2 with the project owner.
2. Confirm D-0.3 and D-0.4 (or document the override).
3. Fill in the **Decisions Resolved** section below.
4. Add the CHANGELOG entry.
5. Move status to 🟢 in the index and tracker.

## Risks

- **Reversibility**: D-0.1 is the most expensive to change after Phase 6; D-0.2
  is moderately expensive after Phase 7. D-0.3 and D-0.4 are trivial to flip.
- **Bikeshedding**: Visual tone debates can stall. Cap the decision window at
  one session — if no consensus, fall back to the default proposal and revisit
  in v2.

## Related

- [`../../CLAUDE.md §7`](../../../CLAUDE.md) — Mascot state contract.
- [`./phase-1-scaffold.md`](./phase-1-scaffold.md) — first phase blocked by these.
- [`./phase-6-mascot.md`](./phase-6-mascot.md) — consumes the art-direction decision.
- [`./phase-7-polish.md`](./phase-7-polish.md) — consumes the visual-tone decision.

## Decisions Resolved

> Phase 0 sealed on **2026-05-22**. See [`docs/CHANGELOG.md`](../../CHANGELOG.md).

| Decision | Resolution | Date | Rationale |
|---|---|---|---|
| D-0.1 Mascot art | **Option A** — stylized Claude `✦` glyph, animated with Motion + CSS | 2026-05-22 | Fastest path to a working HUD; inherits Anthropic identity; the state machine in Phase 6 can later swap to Option B (custom mascot) without rewriting `lib/mascot/state.ts`. |
| D-0.2 Visual tone | **Glassmorphism** | 2026-05-22 | The iPad's high-DPI display is the primary surface and benefits the most from depth, blur, and translucency. |
| D-0.3 Package manager | **pnpm** | 2026-05-22 | Matches sibling repos `livo-clouds-web-app` and `livo-clouds-api-app`; workspace support, deterministic lockfile, fast installs. |
| D-0.4 Local port | **3000** | 2026-05-22 | Next.js default; per-developer conflicts with `livo-clouds-web-app` are resolved via `PORT=3010 pnpm dev`, documented in Phase 1's README. |
