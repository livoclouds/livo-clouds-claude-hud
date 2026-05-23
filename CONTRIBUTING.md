# Contributing to the Claude Code HUD

Thanks for your interest in contributing. This guide covers the development
setup, the conventions the codebase follows, and the workflow for getting a
change merged.

The project is a single-repo pnpm monorepo. The architectural constitution is
[`CLAUDE.md`](./CLAUDE.md) — please skim it before making non-trivial changes.

---

## Code of conduct

Be respectful, assume good faith, and keep technical discussion technical. Be
patient with reviewers and maintainers — this is a small project run on
volunteer time.

---

## Getting started

```bash
git clone git@github.com:livoclouds/livo-clouds-claude-hud.git
cd livo-clouds-claude-hud
pnpm install
pnpm dev                                # http://localhost:3000
```

To exercise the full Claude Code → HUD path locally:

```bash
pnpm hud:token                          # writes apps/hud/.env.local (gitignored)
pnpm hud:install-hook                   # idempotent merge into ~/.claude/settings.json
# run Claude Code in any project — events appear on the HUD in real time
```

Or inject synthetic events without Claude Code:

```bash
./apps/hud/scripts/synth-event.sh tool.use Bash
```

---

## Project structure

See [`README.md`](./README.md#project-structure) for the layout. Highlights:

- `apps/hud/` — the Next.js app (UI + API). Routes under `app/`, business logic
  under `lib/`, scripts under `scripts/`.
- `packages/contracts/` — `@livoclouds/contracts`, the shared Zod schemas. **This
  is the source of truth for every event the HUD consumes.** Any new field that
  surfaces on screen must be modeled here first.
- `hooks/claude-hook.sh` — the bash hook Claude Code calls. Non-blocking by
  design: every failure path exits 0.
- `deploy/raspberry-pi/` — the Pi 5 kiosk artifacts (`setup.sh`,
  `kiosk.service`, `xrandr-rotate.sh`).
- `docs/v1/` — versioned documentation. Phase files document scope; setup
  guides document operator workflows.

---

## Development workflow

The workflow is documented in [`CLAUDE.md`](./CLAUDE.md) §3:

```
EXPLORE → ANALYZE → PLAN → VALIDATE → IMPLEMENT → TEST → REFACTOR → DOCUMENT
```

**Stop and ask** when: a new Claude Code hook payload appears that the schema
does not model · a metric semantically overlaps another · a mascot state could
be ambiguous to the user.

---

## Commands

| Command             | Purpose                                                                 |
| ------------------- | ----------------------------------------------------------------------- |
| `pnpm dev`          | Run the HUD locally on `http://localhost:3000`.                         |
| `pnpm lint`         | ESLint across the workspace. **Must pass before opening a PR.**         |
| `pnpm typecheck`    | `tsc --noEmit` across the workspace. **Must pass before opening a PR.** |
| `pnpm test`         | Vitest across the workspace. **Must pass before opening a PR.**         |
| `pnpm build`        | Build every package. CI runs this against every PR.                     |
| `pnpm format`       | Prettier write.                                                         |
| `pnpm format:check` | Prettier check (CI-friendly).                                           |

Pre-commit gate (informal but expected before pushing):

```bash
pnpm lint && pnpm typecheck && pnpm test
```

---

## Conventions

### Language

**English only** for every technical artifact: file names, variables, functions,
components, API paths, hook payloads, event types, comments, git messages, log
messages, env vars, TypeScript types, Zod schemas. See [`CLAUDE.md`](./CLAUDE.md)
§4 for the rationale.

User-visible strings use translation keys (`t('hud.metrics.tokensIn')`), never
hardcoded literals. The translation values themselves may be in any locale —
default English at `messages/en/`, Spanish at `messages/es/`.

### TypeScript

- `strict: true` is non-negotiable.
- No `any`. Prefer `unknown` + a Zod schema at the boundary.
- All event shapes live in `@livoclouds/contracts`. Do not invent ad-hoc shapes
  inside route handlers.

### Real-time rendering

The HUD is **dynamic in every view**. See [`CLAUDE.md`](./CLAUDE.md) §6:

- No polling on the client. Subscribe once to `/api/stream` (SSE).
- The HUD must reflect a new event within 500 ms p95.
- Optimistic skeletons, never blank pages, on first paint.
- Touch is a first-class input. No hover-only affordances. Tap targets ≥ 44 × 44 pt.

### Mascot

States are **declarative**, derived from the latest events. Never imperatively
play an animation. See [`CLAUDE.md`](./CLAUDE.md) §7 for the state contract and
[`docs/v1/phases/phase-6-mascot.md`](./docs/v1/phases/phase-6-mascot.md) for the
implementation notes.

### Performance budgets

Non-negotiable per [`CLAUDE.md`](./CLAUDE.md) §11:

| Budget                                      | Target              |
| ------------------------------------------- | ------------------- |
| First paint on iPad (2021) over LAN         | < 1.5 s             |
| Event ingest → screen update                | < 500 ms p95        |
| Mascot animation framerate                  | 60 fps on iPad 2021 |
| Client memory after 24 h continuous session | < 150 MB RSS        |

If an animation cannot hold 60 fps, drop the animation — never the framerate.

### Security

Per [`CLAUDE.md`](./CLAUDE.md) §12:

- The HUD **never executes code** from event payloads. Every payload passes
  through Zod before reaching React state.
- Ingest endpoints require a bearer token. **Never commit a token.**
- No outbound network from the hook script except to the configured HUD origin.
- No third-party analytics. No telemetry leaving the LAN.

See [`SECURITY.md`](./SECURITY.md) for the full threat model.

---

## Commit messages

Conventional commit prefixes are required. Recent `main` history is the best
reference:

```
feat(<scope>):     new feature
fix(<scope>):      bug fix
docs(<scope>):     documentation only
chore(<scope>):    tooling, deps, CI
refactor(<scope>): no behavior change
test(<scope>):     tests only
```

Common scopes: `contracts`, `hud`, `hooks`, `mascot`, `pwa`, `ui`, `phase-N`,
`tracker`, `deploy`.

**Title rules:**

- Imperative mood ("Add", not "Added").
- 72 characters maximum.
- General enough to cover the full scope of the change.

**Body rules:**

- List each file (or group of files) modified.
- State _what_ changed and _why_ — not just what.
- Reference `CLAUDE.md` sections when a constraint drives the change
  (e.g., "per CLAUDE.md §8").
- No AI co-authorship attribution, no task IDs, no TODO notes.

Example:

```
feat(contracts): add compact.start/end event types

- packages/contracts/src/event.ts: added `compact.start` and `compact.end`
  to the HudEventSchema union. Required so the mascot can render the
  `compacting` state defined in CLAUDE.md §7.
- packages/contracts/tests/event.spec.ts: round-trip cases for both new
  event types.
```

---

## Pull requests

1. **Branch from `main`.** Feature branches named after the work (e.g.
   `feat/sessions-csv-export`).
2. **One topic per PR.** Smaller PRs land faster.
3. **Title** matches the commit prefix convention above.
4. **Body** includes:
   - Summary (1–3 bullets — what and why).
   - Files changed (or affected areas if many).
   - Test plan — exact steps the reviewer can run to verify locally.
5. **Acceptance gate.** Before requesting review:
   - `pnpm lint` clean
   - `pnpm typecheck` clean
   - `pnpm test` green
   - If the change touches the live view or mascot — verify on a real iPad
     and/or Pi, since the perf budgets only matter on target hardware.
6. **No force-pushes** on shared branches. Force-push to `main` is forbidden.

The default merge strategy is **squash merge** so `main` stays linear.

---

## Documentation changes

- Documentation is versioned by major product milestone — see
  [`docs/README.md`](./docs/README.md) for the policy. Currently `v1/`.
- Within `v1/`, edit in place; git history is the changelog. A
  `docs/CHANGELOG.md` entry is only required for a _new_ docs version (e.g.
  `v2/`).
- Phase files follow the structure defined in
  [`docs/v1/conventions.md`](./docs/v1/conventions.md). When a phase moves to
  ⚪ → 🔵 → 🟡 → 🟢, flip the status badge in the phase file, in
  [`docs/v1/phases/README.md`](./docs/v1/phases/README.md), and in
  [`docs/v1/progress.html`](./docs/v1/progress.html) (the tracker JS data
  block).

---

## What's out of scope for v1

Per [`CLAUDE.md`](./CLAUDE.md) §14:

- Multi-user / shared HUDs.
- Cloud deployment.
- Per-tool analytics dashboards.
- Editing Claude Code settings from the HUD.
- Voice / audio reactions to events.

These may land in `v2/`. Please open a discussion before sending a PR that
expands v1 scope.

---

## Reporting bugs

Use GitHub Issues. Include:

- HUD version (commit SHA from `git rev-parse HEAD`).
- Claude Code version.
- Node, pnpm, OS versions.
- Steps to reproduce.
- Expected vs actual.
- Screenshots / `journalctl` output for kiosk issues.

For security issues, **do not open a public issue** — follow
[`SECURITY.md`](./SECURITY.md).

---

## License

By contributing, you agree that your contributions will be licensed under the
[MIT License](./LICENSE).
