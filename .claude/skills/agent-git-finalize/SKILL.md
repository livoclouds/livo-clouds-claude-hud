---
name: agent-git-finalize
description: Finalize agent work by committing, pushing, creating a PR, detecting and resolving merge conflicts, auto-merging to main when clean, verifying and force-deleting the remote branch, deleting the local branch, removing the worktree only after a successful merge, and delivering a consolidated visual summary with a prominent PR delivery block as the last visible element. Tailored for the livo-clouds-claude-hud monorepo (pnpm workspaces, Zod-based contracts). Use when an agent or background job has completed its implementation and needs to ship the changes through the full Git flow.
---

# Agent Git Finalize Skill

Use this skill when an agent has completed its work and needs to ship changes through the full Git flow: pre-commit gate → commit → push → PR → conflict check → merge → remote branch cleanup → worktree removal → local branch cleanup → verification → visual summary.

This repo is a **single-repo pnpm monorepo** (CLAUDE.md §13). There is no companion API repo to coordinate with — every step targets `livoclouds/livo-clouds-claude-hud` directly.

## Activation

**Slash command:** `/agent-git-finalize`

Invoke this skill when the user says any of the following (or a clear equivalent in any language):

- `/agent-git-finalize`
- "finalize the changes"
- "ship the work"
- "wrap it up and PR"
- "commit, push, and PR"
- "make the PR and clean up the worktree"

**Record the activation reason** — it will appear in the Step 0 banner. Classify it as one of:
- `Explicit user request — /agent-git-finalize`
- `Explicit user request (natural language): "<exact phrase used>"`
- `Invoked by Claude — background job completion`

## Objective

Execute the full workflow in strict order. Do not skip steps. Do not reorder them. Report progress at each step. Deliver the PR block as the absolute last element of the response.

## Execution Procedure

Follow the step sequence defined below. For detailed output format and visual templates, read `references/output-format.md`. For conflict resolution strategy, read `references/conflict-resolution.md`. For commit message guidelines, read `references/commit-guidelines.md`.

---

## Step 0 — Announce Activation

Before taking any action, print the activation banner defined in `references/output-format.md § Activation Banner`.

Fill in:
- Activation reason (classified in the Activation section above)
- Current branch name
- Repository `livoclouds/livo-clouds-claude-hud`
- Current ISO timestamp

---

## Step 1 — Review Repository State

Run `git status` and `git diff --stat`.

Report:
- Current branch name
- Files with pending changes
- Files that are staged vs unstaged

Stop and report to the user if the working directory is in an unexpected state (e.g., mid-merge, detached HEAD, unrelated staged files).

---

## Step 1.5 — Pre-commit Gate (Typecheck)

Before staging any file, run from the repo root:

```bash
pnpm -w typecheck
```

If the command exits non-zero:
- Stop. Do not commit.
- Report the failing package(s) and the first error block verbatim.
- Wait for user input.

**Rationale.** `packages/contracts/*` (Zod schemas) is the shared event contract between the Claude Code hook, the ingest API, and the HUD UI (CLAUDE.md §8). A broken contract must never reach `main`. The pnpm workspace `typecheck` script propagates to every package, so a single command guards the whole monorepo.

If the repo's root `package.json` does not yet expose a `typecheck` script, fall back to `pnpm -r exec tsc --noEmit`. If neither works, stop and ask the user.

---

## Step 2 — Commit

### Step 2-a — Secrets check

Before any `git add`, run:

```bash
git status --porcelain
git diff --name-only
git diff --cached --name-only
```

Inspect the file list. If **any** of these patterns appear, stop and report:

- `.env`, `.env.local`, `.env.development`, `.env.production`, `.env.test`
- Any file with extension `.env` or basename starting with `.env`
- Any path matching `**/secrets/**` or `**/credentials/**`
- Any file whose contents include `HUD_INGEST_TOKEN=` (when in doubt, `grep -r HUD_INGEST_TOKEN <file>` before staging)

Per CLAUDE.md §12, the ingest token and any `.env*` file must never be committed.

### Step 2-b — Stage and commit

Stage only files related to the work completed in this session. Never use `git add -A` or `git add .` blindly.

Create a single commit following the format in `references/commit-guidelines.md`.

---

## Step 2.5 — Docs Tracker Reminder

If any staged file matches one of these patterns, render a non-blocking notice (do not stop the flow):

- `docs/v1/phase-*/**`
- `docs/v1/tracker*`
- `docs/index.html`

Notice template:

```
ℹ️  This change touches phase docs. Remember to regenerate the animated
   overall progress tracker before merge (reference commit: 2e99deb).
   The reviewer should sanity-check that the tracker reflects the new
   phase status.
```

This is a reminder for the human reviewer only. Do not modify the tracker yourself unless the user asks.

---

## Step 3 — Push

Run `git fetch origin` first to detect remote divergence.

Then push the current branch with `git push -u origin <branch>`.

**Do not force-push.** If the push is rejected for any reason other than "Everything up-to-date", report the exact error and stop. Do not retry silently.

---

## Step 4 — Create Pull Request

Create a PR targeting `main` using `gh pr create`.

The PR body must include:
- **Summary**: bullet points describing what changed and why
- **Files changed**: list of modified files (or affected packages, if many)
- **Test plan**: steps to verify the change works

Do not merge yet. Save the PR number and URL — required for Steps 5 and 9.

---

## Step 5 — Check for Merge Conflicts

After PR creation, check merge status:

```bash
gh pr view <PR_NUMBER> --json mergeable,mergeStateStatus
```

Decision gates:

| `mergeable` | `mergeStateStatus` | Action |
|---|---|---|
| `MERGEABLE` | `CLEAN` | Proceed to Step 6A |
| `CONFLICTING` | any | Proceed to Step 6B |
| `UNKNOWN` | any | Wait 10 s, retry up to 3 times. If still UNKNOWN → report and stop |

---

## Step 6A — Merge to Main (no conflicts)

```bash
gh pr merge <PR_NUMBER> --squash --delete-branch
```

Confirm the merge completed before continuing.

### Step 6A-1 — Verify remote branch deletion

```bash
git ls-remote --heads origin <branch-name>
```

- Output is empty → remote branch is confirmed deleted → proceed to Step 6A-4
- Output is non-empty → `--delete-branch` did not take effect → proceed to Step 6A-2

### Step 6A-2 — Force-delete remote branch (fallback)

```bash
git push origin --delete <branch-name>
```

### Step 6A-3 — Re-verify remote branch deletion

```bash
git ls-remote --heads origin <branch-name>
```

- Output is empty → deletion confirmed → proceed to Step 6A-4
- Output is non-empty → stop, report the exact output, and wait for user input. Do not continue to Step 7.

### Step 6A-4 — Prune remote-tracking refs

```bash
git fetch --prune
```

Always run this step after confirmed deletion, regardless of which path (6A-1 or 6A-3) confirmed it.

---

## Step 6B — Resolve Conflicts

```bash
git fetch origin main
git merge origin/main
```

Resolve all conflicts using the strategy table in `references/conflict-resolution.md`.

After resolving:
1. Stage all resolved files
2. Commit with message: `Resolve merge conflicts with main`
3. Push the branch
4. Return to **Step 5** to re-check merge status

---

## Step 7 — Remove Worktree and Delete Local Branch

Execute this step **only after Step 6A (including 6A-4) or Step 6B completed successfully**.

### Step 7-a — Remove worktree

```bash
git worktree remove <worktree-path> --force
git worktree prune
```

`git worktree remove --force` only removes git-tracked files; gitignored directories (`.next/`, `.turbo/`, `node_modules/`, `dist/`) and Claude-internal metadata (`.claude/`) are left behind. After prune, forcibly delete the physical directory if it still exists:

```bash
[ -d "<worktree-path>" ] && rm -rf "<worktree-path>"
```

### Step 7-b — Delete local branch

Because this skill always uses squash merge, `git branch -d` will fail (squashed commits are not present in `main`'s linear history). Use force-delete directly:

```bash
git branch -D <branch-name>
```

### Step 7-c — Verify local branch is gone

```bash
git branch --list <branch-name>
```

- Empty output → local branch confirmed deleted → proceed to Step 8
- Any output → stop, report the branch name still present, and wait for user input. Do not proceed to Step 8.

---

## Step 8 — Verify Cleanup (two passes)

Each pass checks **three signals**:

| Signal | Command | Expected result |
|--------|---------|-----------------|
| Worktree directory | `ls <worktree-path>` | `No such file or directory` |
| Worktree list | `git worktree list` | Branch entry absent |
| Local branch | `git branch --list <branch-name>` | Empty output |

**First pass** — immediately after Step 7-c.

**Second pass** — 30 seconds after the first pass.

If any signal fails in either pass: remove remaining residuals, report exactly what was found, and re-run that signal before marking the pass complete.

Do not report cleanup as successful until all three signals pass in both passes.

---

## Step 9 — Final Report

Render the consolidated summary table from `references/output-format.md § Final Summary Table`, then immediately render the PR delivery block from `references/output-format.md § PR Delivery Block`.

**The PR delivery block must be the absolute last element of the response. Nothing may appear after it.**

---

## Safety Rules

- Never commit or push `.env*` files or anything matching `HUD_INGEST_TOKEN`
- Never bypass the Step 1.5 typecheck gate
- Never force-push without explicit user approval
- Never delete the worktree before the merge is confirmed
- Never skip the conflict check (Step 5)
- Never skip the remote branch verification (Steps 6A-1 through 6A-4)
- Never skip the local branch deletion (Step 7-b and 7-c)
- Never report cleanup success without completing both verification passes with all three signals
- If any step fails unexpectedly, stop, report the error in full, and wait for user input
