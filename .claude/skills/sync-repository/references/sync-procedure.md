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

```bash
git -C <hud-path> fetch --prune origin
```

Capture any output (pruned branch names, new commit ranges) for the summary.

**On fetch failure:** See `edge-cases.md § Network or Authentication Failure`. Stop the sync immediately.

---

## Step 2 — Inspect status

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

---

## Step 3 — Pull

Branch state determines the path. Pick exactly one case.

### Case A — On `main`, no upstream gone

```bash
git -C <hud-path> pull --ff-only origin main
```

- If pull succeeds → record the commit range (`before..after`) and new commit count for the summary.
- If pull fails due to a local file conflict → see `edge-cases.md § Pull Blocked by Local File Conflict`. Stop and ask the user.
- If already up to date → record "up to date" and the current HEAD SHA for the summary.

### Case B — On a feature branch with upstream `[gone]`

The remote tracking branch was deleted (typically after a squash merge). The local copy is now stale.

```bash
# 1. Check working tree for locally modified files before switching
git -C <hud-path> status --short

# 2. Switch to main
git -C <hud-path> switch main

# 3. Pull
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

## Step 5 — Collect summary data and render output

After the pull completes, gather:

```bash
# Last 3 commits in main (for "last commit" display in up-to-date state)
git -C <hud-path> log --oneline -3 main

# Any remaining local modifications
git -C <hud-path> status --short
```

Render the activation banner (already printed at Step 0) followed by the progress summary table and changes section using `output-format.md`.
