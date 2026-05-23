# Phase 4 — Hook Script & Installer

| Field          | Value                                                                               |
| -------------- | ----------------------------------------------------------------------------------- |
| Phase ID       | `phase-4`                                                                           |
| Status         | 🟢 Complete                                                                         |
| Depends on     | `phase-2`, `phase-3`                                                                |
| Blocks         | `phase-5`                                                                           |
| Target outcome | A real Claude Code session emits live events into the HUD without manual `curl`-ing |

---

## Overview

Wire Claude Code's lifecycle hooks to the HUD's ingest endpoint. The
deliverable is a single bash script registered in `~/.claude/settings.json`,
plus an idempotent installer that modifies that settings file safely.

## Goals

- A robust `hooks/claude-hook.sh` that reads Claude Code's stdin JSON,
  normalizes it to `HudEventSchema`, and `POST`s to `/api/events`.
- An installer (`pnpm hud:install-hook`) that writes / updates the hook block
  in `~/.claude/settings.json` idempotently with a backup.
- An uninstaller (`pnpm hud:uninstall-hook`) that removes the block cleanly.
- A `--dry-run` flag on both installer and uninstaller.

## In Scope

- `hooks/claude-hook.sh` — the hook itself.
- `apps/hud/scripts/install-hook.ts` — installer.
- `apps/hud/scripts/uninstall-hook.ts` — uninstaller.
- Hook normalization: map raw Claude Code event shapes to `HudEventSchema`.
- Failure handling: when the HUD is down, the hook must **not** block Claude
  Code. It logs to `~/.claude/hud-hook.log` and exits 0.
- Documentation: a step-by-step `setup-hook.md` under `docs/v1/setup/` (if the
  setup directory does not exist, this phase creates it).

## Out of Scope

- A GUI for hook configuration. CLI only in v1.
- Remote installation (installing the hook on a host different from the one
  running Claude Code). Local only in v1.
- The `Notification` → mascot mapping nuances — handled in Phase 6 as a
  client-side reduction; the hook just forwards the payload.

## Open Decisions

### D-4.1 — Hook script language

**Default proposal**: **bash** (POSIX-leaning) with `jq` and `curl` as
hard dependencies. Reason: every developer machine running Claude Code already
has these or can `brew install` them in seconds. Avoids shipping a Node script
that itself loads npm at hook time.

### D-4.2 — Settings.json merge strategy

**Default proposal**: read the existing JSON, deep-merge the HUD block under
`hooks`, write back with a 2-space-indent. Always copy the previous file to
`~/.claude/settings.json.bak` before writing.

### D-4.3 — Failure budget

**Default proposal**: the hook has a 250 ms total budget (`curl --max-time 0.25`).
If exceeded, it logs and exits 0. Claude Code must never wait on the HUD.

## Deliverables

```
hooks/
└── claude-hook.sh

apps/hud/scripts/
├── install-hook.ts
└── uninstall-hook.ts

docs/v1/setup/
└── setup-hook.md
```

## Acceptance Criteria

- Running `pnpm hud:install-hook` on a clean `~/.claude/settings.json` adds the
  hook block and creates `.bak`.
- Running it again is a **no-op** (idempotent).
- Running `pnpm hud:uninstall-hook` removes only the HUD block and leaves
  unrelated keys intact.
- Triggering each subscribed hook in a real Claude Code session produces a
  matching event on the HUD stream.
- Stopping the HUD process and triggering a hook **does not block Claude Code**;
  the failure is recorded in `~/.claude/hud-hook.log`.
- `pnpm hud:install-hook --dry-run` prints the proposed JSON diff without writing.

## Tasks

1. Author the hook bash script: read stdin → derive `type` from `$CLAUDE_HOOK_NAME`
   (or the environment Claude Code provides) → build the event JSON → POST.
2. Source the ingest token from `~/.claude/livo-clouds-hud.env` (kept outside
   the repo).
3. Implement the installer in TypeScript using Node's `fs` and a small JSON
   reader / writer that preserves comments where possible (or document we
   strip them since Claude Code uses pure JSON).
4. Implement the uninstaller as the inverse, preserving the rest of the file.
5. Write `setup-hook.md` with copy-paste-ready commands.
6. End-to-end smoke: run Claude Code, watch the HUD stream tick.
7. PR titled `feat(hooks): real Claude Code → HUD hook + installer (Phase 4)`.

## Risks

- **Claude Code settings.json schema changes**: every minor version may add
  new hook names. Mitigation: keep the installer's known-hooks list in one
  place, easy to update.
- **`jq` not installed**: rare on Macs, common on minimal Linux. Mitigation:
  the script detects and prints a clear install hint, then exits 0 (never
  blocks Claude Code).
- **Settings file corruption**: any write to user settings is sensitive.
  Mitigation: the `.bak` policy and the `--dry-run` mode.

## Related

- [`./phase-3-backend.md`](./phase-3-backend.md) — the endpoint this phase produces for.
- [`./phase-5-live-view.md`](./phase-5-live-view.md) — first end-to-end visible result.
- [`../setup/setup-hook.md`](../setup/setup-hook.md) — installation & troubleshooting guide.
- [`../../CLAUDE.md §2`](../../../CLAUDE.md) — transport contract.

## Change Log

- 2026-05-23 — Phase implemented. Hook event coverage as shipped:
  `SessionStart`, `SessionEnd`, `UserPromptSubmit`, `PostToolUse`, `Stop`,
  `SubagentStop`, `PreCompact`. `Notification` and `PreToolUse` are accepted
  and explicitly skipped (logged, exit 0); `compact.end` is not synthesized
  from `PreCompact` and will be derived client-side in Phase 6 if needed.
  Installer / uninstaller are TypeScript scripts invoked via `tsx`; the
  `tsx` devDependency lives at the workspace root because pnpm 10 routes
  colon-named scripts through the root. Scripts are invoked as
  `pnpm -w run hud:install-hook` / `pnpm -w run hud:uninstall-hook`.
