# Repository Configuration

## Repository Path

| ID    | Path                                                              | Remote   | Default Branch |
|-------|-------------------------------------------------------------------|----------|----------------|
| `hud` | `/Users/hiperezr/Code/github/livoclouds/livo-clouds-claude-hud`   | `origin` | `main`         |

GitHub slug: `livoclouds/livo-clouds-claude-hud`.

## Files That Can Be Discarded on User Approval

- `tsconfig.tsbuildinfo` (any package — root or `apps/hud/`, `packages/contracts/`, etc.) — TypeScript incremental build cache. Regenerates on next build. Safe to discard with `git checkout -- <path>` **only after user confirms**.
- `.turbo/`, `.next/`, `dist/`, `node_modules/` — never tracked; ignore entirely.

## Files That Must Never Be Touched

- Any `.env*` file — contains `HUD_INGEST_TOKEN` and similar secrets (CLAUDE.md §12).
- `data/events-*.jsonl` — rolling event logs written by the live HUD; never staged, never discarded.

## Branch Naming Conventions Observed

Feature branches follow patterns observed in `main`'s history (`git log --oneline` shows merged PRs):

- `feat/<description>` — features (e.g., `feat/sse-stream`)
- `fix/<description>` — bug fixes
- `docs/<description>` — documentation-only changes
- `chore/<description>` — tooling, deps, CI
- `phase-<N>-<description>` — phase-aligned work (matches the project's phase roadmap)
- `worktree-<description>` — branches spawned from a Claude Code worktree

These branches are routinely merged via squash PR and the remote copy is deleted. Their local copies may lag behind (upstream: `gone`) — see `edge-cases.md`.
