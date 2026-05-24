# Sync Procedure

Execute in the order below. All steps are sequential.

The repo path is `/Users/hiperezr/Code/github/livoclouds/livo-clouds-claude-hud` (see `repo-config.md`). Use `git -C <hud-path>` so the sync works regardless of the current working directory.

---

## Step 0 — Announce Activation

Before taking any action, print the activation banner defined in `output-format.md § Activation Banner`.

Fill in:
- Activation reason (classified in SKILL.md § Activation)
- Current ISO timestamp

---

## Step 1 — Fetch

Run with a **120-second timeout**. If the process has not exited after 120 seconds, kill it and treat it as a timeout failure — see `edge-cases.md § Fetch Timeout`.

```bash
git -C <hud-path> fetch --prune origin
```

Capture any output (pruned branch names, new commit ranges) for the summary.

**Retry logic:** On transient network failures only (connection timeout, DNS failure, connection reset), retry up to **2 additional times** with 10-second back-off between attempts. Do not retry on authentication failures (`Permission denied`) or permanent permission errors — these require user action.

| Attempt | Wait before next attempt |
|---|---|
| 1 | 10 s on transient failure |
| 2 | 10 s on transient failure |
| 3 | — |

To distinguish transient from permanent: if the error message contains `Permission denied`, `403`, `404`, `authentication failed`, or `repository not found` → permanent, stop immediately. Any other failure (timeout, DNS, connection reset, `Connection timed out`) → transient, retry.

If all 3 attempts fail with transient errors, or if a permanent failure occurs on any attempt: see `edge-cases.md § Network or Authentication Failure`.

**On fetch success:** Note any refs pruned (lines containing `[deleted]`) — include them in the Step 5 summary as pruned remote-tracking refs.

---

## Step 2 — Inspect Status

```bash
git -C <hud-path> status --short --branch
git -C <hud-path> log --oneline main..origin/main
git -C <hud-path> worktree list
```

> Note: `git log` uses `main..origin/main` — not `HEAD..origin/main`. This ensures the behind-count reflects `main` regardless of what branch is currently checked out.

From this output, determine:
- Is `main` currently checked out (and where — primary worktree or another worktree)?
- Is `main` behind `origin/main`? By how many commits?
- Does the current branch (if not `main`) have an upstream marked as `[gone]`?
- Are there locally modified files (`M` prefix in status)?
- Are there active worktrees beyond the primary one?

**On detached HEAD:** See `edge-cases.md § Detached HEAD`.

### Step 2-a — Proactive tsconfig.tsbuildinfo check

Before attempting the pull, scan for the known recurring blocker:

```bash
git -C <hud-path> status --short | grep 'tsconfig.tsbuildinfo'
```

If any `tsconfig.tsbuildinfo` file appears as modified (`M`) **and** `origin/main` has new commits (the pull would not be a no-op), proactively notice:

```
ℹ️  Modified tsconfig.tsbuildinfo detected. This file is a TypeScript build
   cache that commonly blocks fast-forward pulls. Discarding it before the pull
   prevents a known failure. Run `git checkout -- <path>` to clear it now, or
   proceed — it will be offered as Option A if the pull is blocked.
```

Do **not** discard it automatically. Only act if the user responds affirmatively. If the user does not respond, proceed to Step 3 — the blocker edge case will handle it if needed.

---

## Step 3 — Pull

Branch state determines the path. Pick exactly one case.

### Case A — On `main`, no upstream gone

```bash
git -C <hud-path> pull --ff-only origin main
```

- If pull succeeds → record the before-SHA (HEAD before pull) and after-SHA (HEAD after pull) for Step 4 and the summary.
- If pull fails due to a local file conflict → see `edge-cases.md § Pull Blocked by Local File Conflict`. Stop and ask the user.
- If already up to date → record "up to date" and the current HEAD SHA for the summary.

### Case B — On a feature branch with upstream `[gone]`

The remote tracking branch was deleted (typically after a squash merge). The local copy is now stale.

```bash
# 1. Check working tree for locally modified files before switching
git -C <hud-path> status --short

# 2. Switch to main
git -C <hud-path> switch main

# 3. Pull (record before/after SHAs)
git -C <hud-path> pull --ff-only origin main

# 4. Conditionally delete the stale local branch (safe delete only)
git -C <hud-path> branch --merged main | grep -qE '^\s*<branch-name>\s*$' \
  && git -C <hud-path> branch -d <branch-name> \
  || echo "Branch not merged — keeping"
```

If `git switch main` fails due to a file conflict, see `edge-cases.md § Switch Blocked by Local Modifications`.

### Case C — On a feature branch with an ACTIVE upstream (not gone)

Do not switch branches. Pull the current branch normally:

```bash
git -C <hud-path> pull --ff-only origin <current-branch>
```

Also check if `origin/main` has moved separately:

```bash
git -C <hud-path> log --oneline main..origin/main
```

Report in the summary that the HUD is on a feature branch (not `main`), show the branch name, and note how many commits behind local `main` is.

---

## Active Worktrees Note

If `git worktree list` (Step 2) shows worktrees besides the primary one:

- If `main` is checked out **in the primary worktree** (default case): proceed normally. Other worktrees on feature branches are unaffected by `pull --ff-only origin main`.
- If `main` is checked out **inside another worktree** (not the primary): the pull from the primary worktree will fail with `fatal: '<branch>' is already used by worktree at '<path>'`. See `edge-cases.md § Active Worktrees`.

---

## Step 4 — Post-pull Verification and Cleanup

Execute this step only after Step 3 completes successfully (pull succeeded or repo was already up to date). Skip entirely — record as `⏭️` — if Step 3 ended in an error.

### Step 4-a — Verify HEAD matches origin/main

```bash
LOCAL=$(git -C <hud-path> rev-parse main)
REMOTE=$(git -C <hud-path> rev-parse origin/main)
[ "$LOCAL" = "$REMOTE" ] && echo "OK" || echo "MISMATCH: $LOCAL vs $REMOTE"
```

- `OK` → local `main` is in sync with `origin/main`. Proceed.
- `MISMATCH` → stop, report both SHAs, and record the sync as `⚠️`. This should not happen after a clean fast-forward pull — if it does, ask the user to investigate before proceeding.

### Step 4-b — Stale local branch scan

```bash
git -C <hud-path> branch -v | grep '\[gone\]'
```

If any stale branches are found (upstream marked `[gone]`), collect their names for the `⚠️ Attention` section of the summary. Do not delete them automatically. Attention item template:

```
⚠️ Stale local branches (upstream deleted): `<branch-1>`, `<branch-2>`.
   Review and delete with `git branch -d <name>` if no longer needed.
```

### Step 4-c — Contextual post-pull reminders

If new commits were pulled (not "up to date"), inspect the changed files:

```bash
git -C <hud-path> diff --name-only <before-sha>..<after-sha>
```

Trigger the following notices based on what changed. Include any triggered notices in the `⚠️ Attention` section:

| File pattern matched | Notice |
|---|---|
| `pnpm-lock.yaml` | "Dependencies changed — run `pnpm install` before starting the dev server." |
| `packages/contracts/src/event.ts` | "Shared event contract changed (CLAUDE.md §8) — restart the HUD server to pick up the new schema." |
| `apps/hud/app/api/` | "API routes changed — restart the HUD server." |
| `.env.example` | "`.env.example` changed — check if `.env.local` needs updating." |

These are non-blocking notices. They do not stop the sync. Omit the Attention section entirely if no notices apply, no stale branches were found, and no protected files were detected.

---

## Step 5 — Collect Summary Data and Render Output

After Step 4 completes, gather:

```bash
# Last 3 commits in main (for "last commit" display in up-to-date state)
git -C <hud-path> log --oneline -3 main

# Any remaining local modifications
git -C <hud-path> status --short
```

Render the activation banner (already printed at Step 0) followed by the progress summary table, changes table, and attention section using `output-format.md`.

After rendering the visible output, call the `PushNotification` harness tool with:

```
title: "sync-repository complete"
message: "<N> new commit(s) pulled | up to date — hud"
```

Use "up to date" if no new commits were pulled. This ensures background syncs (e.g., via `/loop`) surface as alerts even when the terminal is not visible.

**The rendered summary must be the last visible output. The `PushNotification` call is a tool invocation and does not appear in the visible output.**
