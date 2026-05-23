# Setup — Claude Code → HUD Hook

This guide wires a real Claude Code session to the local HUD so events appear
on the live stream as soon as Claude Code emits them.

The hook is a small bash script registered in `~/.claude/settings.json`. It
reads each Claude Code hook payload on stdin, normalizes it to the shared
[`HudEventSchema`](../../../packages/contracts/src/event.ts), and POSTs it to
`POST /api/events`. It is **non-blocking**: every failure path exits 0 so
Claude Code is never delayed by the HUD.

---

## Prerequisites

- `jq` — JSON wrangling. macOS: `brew install jq`. Debian/Ubuntu: `apt-get install jq`.
- `curl` — HTTP client. Ships with macOS and most Linuxes.
- Node ≥ 20.9 and `pnpm` (see the repo root [`README`](../../../README.md)).
- Claude Code installed on the same machine as the HUD.

---

## One-time setup

### 1. Generate the ingest token

From the repo root:

```sh
pnpm hud:token
```

This writes `HUD_INGEST_TOKEN=<random hex>` into `apps/hud/.env.local`
(gitignored). Run again later if you ever rotate the token.

If `pnpm hud:token` reports "command not found" because of pnpm's
colon-handling, use:

```sh
pnpm -w run hud:token
```

### 2. Copy the token into the hook's config file

The hook reads its configuration from `~/.claude/livo-clouds-hud.env` —
deliberately **outside** the repo so it is not git-tracked. Create it:

```sh
mkdir -p ~/.claude
TOKEN=$(grep '^HUD_INGEST_TOKEN=' apps/hud/.env.local | cut -d= -f2)
cat > ~/.claude/livo-clouds-hud.env <<EOF
HUD_INGEST_TOKEN=$TOKEN
HUD_URL=http://127.0.0.1:3000
EOF
chmod 600 ~/.claude/livo-clouds-hud.env
```

Optional keys:

| Key              | Default                  | Purpose                                          |
| ---------------- | ------------------------ | ------------------------------------------------ |
| `HUD_URL`        | `http://127.0.0.1:3000`  | Base URL of the running HUD (no trailing path)   |
| `HUD_HOOK_LOG`   | `~/.claude/hud-hook.log` | Where the hook writes diagnostic lines           |
| `HUD_TIMEOUT_MS` | `250`                    | Per-request budget; over this, hook logs + exits |

The token is never written to `HUD_HOOK_LOG`. Hook payloads are not logged
either — only `ts`, `type`, and HTTP status.

### 3. Register the hook in Claude Code

```sh
pnpm -w run hud:install-hook -- --dry-run    # preview
pnpm -w run hud:install-hook                 # apply
```

The installer:

- Writes (or merges into) `~/.claude/settings.json` for these events:
  `SessionStart`, `SessionEnd`, `UserPromptSubmit`, `PostToolUse`, `Stop`,
  `SubagentStop`, `PreCompact`.
- Copies the prior file to `~/.claude/settings.json.bak` before writing.
- Is idempotent: re-running prints `already installed (no-op)`.
- Preserves any unrelated keys or hooks you already had.

Verify:

```sh
jq '.hooks' ~/.claude/settings.json
```

---

## Verify end-to-end

In one terminal, run the HUD:

```sh
pnpm dev
```

In another, subscribe to the live stream:

```sh
TOKEN=$(grep '^HUD_INGEST_TOKEN=' apps/hud/.env.local | cut -d= -f2)
curl -N -H "Authorization: Bearer $TOKEN" http://127.0.0.1:3000/api/stream
```

In a third, start any Claude Code session (`claude` in any project). The SSE
stream should print `session.start` immediately, then `prompt.submit`,
`tool.use`, `turn.stop`, `session.end` as the session progresses.

If nothing arrives, check `~/.claude/hud-hook.log` — every hook invocation
writes exactly one line with the resolved event type and HTTP status.

---

## Uninstall

```sh
pnpm -w run hud:uninstall-hook -- --dry-run  # preview
pnpm -w run hud:uninstall-hook               # apply
```

Only entries pointing at this repo's `hooks/claude-hook.sh` are removed.
Other hooks and top-level keys are untouched. Re-running is a no-op.

---

## Troubleshooting

### `missing_jq` in the log

`jq` is not on the hook's `PATH`. Install it (`brew install jq` or
`apt-get install jq`) and the next hook invocation will succeed.

### `missing_curl` in the log

Install `curl` for your platform.

### `missing_config` or `missing_token` in the log

`~/.claude/livo-clouds-hud.env` is missing or has an empty
`HUD_INGEST_TOKEN`. Repeat step 2 above.

### `hud_unreachable` in the log

The HUD is not listening at `HUD_URL`. Start `pnpm dev`, or check that
nothing else is squatting on port 3000. The hook still exited 0, so Claude
Code was not blocked.

### `status=401` in the log

The token in `~/.claude/livo-clouds-hud.env` does not match the one in
`apps/hud/.env.local`. Re-copy from `apps/hud/.env.local` to the env file.

### Restoring settings.json

If something goes wrong, the prior file is at
`~/.claude/settings.json.bak`:

```sh
mv ~/.claude/settings.json.bak ~/.claude/settings.json
```

The installer overwrites `.bak` on every write that changes the file, so
the backup always reflects the state immediately before the most recent
change.

### `unsupported_hook` in the log

A Claude Code hook event arrived that this version of the hook does not
map. Safe — the event is dropped, Claude Code is not blocked. File an
issue with the hook name so it can be added to `MANAGED_HOOK_EVENTS`.

---

## Related

- [`CLAUDE.md §2`](../../../CLAUDE.md) — transport contract.
- [`phase-4-hook-script.md`](../phases/phase-4-hook-script.md) — phase spec.
- [`packages/contracts/src/event.ts`](../../../packages/contracts/src/event.ts) — `HudEventSchema`.
