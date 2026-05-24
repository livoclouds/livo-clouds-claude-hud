---
name: agent-git-finalize
description: Finalize agent work by committing, pushing, creating a PR, detecting and resolving merge conflicts, auto-merging to main when clean, verifying and force-deleting the remote branch, deleting the local branch, removing the worktree only after a successful merge, and delivering a consolidated visual summary with a prominent PR delivery block as the last visible element. Tailored for the livo-clouds-claude-hud monorepo (pnpm workspaces, Zod-based contracts). Use when an agent or background job has completed its implementation and needs to ship the changes through the full Git flow.
---

# Agent Git Finalize Skill

Use this skill when an agent has completed its work and needs to ship changes through the full Git flow: pre-commit quality gate → commit → push → PR → branch protection check → CI wait → conflict check → merge → remote branch cleanup → worktree removal → local branch cleanup → verification → visual summary → push notification.

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

Execute the full workflow in strict order. Do not skip steps. Do not reorder them. Report progress at each step. Deliver the PR block as the absolute last visible element of the response.

## Execution Procedure

Follow the step sequence defined below. Load the referenced files on demand:

- Visual templates → `references/output-format.md`
- Conflict resolution strategy → `references/conflict-resolution.md`
- Commit message guidelines → `references/commit-guidelines.md`
- Quality gate details → `references/quality-gates.md`
- CI check wait strategy → `references/ci-checks.md`
- Recovery procedures → `references/rollback.md`

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

## Step 1.5 — Pre-commit Quality Gate

Before staging any file, run the three quality gates in sequence. Each gate must pass before the next runs. For full details — commands, expected output, and failure handling — read `references/quality-gates.md`.

```bash
pnpm -w typecheck
pnpm -w lint
pnpm -w build
```

If any gate exits non-zero:
- Stop. Do not commit.
- Report which gate failed, the failing package(s), and the first error block verbatim.
- Wait for user input. Do not proceed until all three gates pass.

**Typecheck gate rationale.** `packages/contracts/*` (Zod schemas) is the shared event contract between the Claude Code hook, the ingest API, and the HUD UI (CLAUDE.md §8). A broken contract must never reach `main`.

**Lint gate rationale.** Catches code style violations and common logic errors that typecheck alone does not catch (unused variables, React hook violations, import order). A lint failure can hide real bugs.

**Build gate rationale.** A project that typechecks and lints may still fail to bundle. The Next.js build catches dynamic import issues, missing env vars, and route configuration errors that only surface at compile time.

If the repo's root `package.json` does not expose one of the three scripts, fall back to:
- typecheck: `pnpm -r exec tsc --noEmit`
- lint: `pnpm -r exec eslint .`
- build: `pnpm --filter hud build`

If none work, stop and ask the user.

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

Then push with retry logic — up to **3 attempts** with exponential back-off:

| Attempt | Command | Wait before next attempt |
|---|---|---|
| 1 | `git push -u origin <branch>` | 5 s on transient failure |
| 2 | `git push -u origin <branch>` | 15 s on transient failure |
| 3 | `git push -u origin <branch>` | — |

**Retry only for transient failures** (connection timeout, DNS failure, connection reset). Do not retry on `rejected` (non-fast-forward or permission denied) — report the exact error and stop immediately.

If all 3 attempts fail, report the raw error from the last attempt, stop, and consult `references/rollback.md § Post-Commit Rollback` for recovery options.

**Never force-push** unless the user explicitly approves.

---

## Step 4 — Create Pull Request

### Step 4-a — Draft detection

Count files that differ from `main`:

```bash
git diff --name-only origin/main...HEAD | wc -l
```

If the count is **> 20 files**, output:

```
⚠️  This PR touches <N> files. Consider opening it as a draft for review
   before merging. Proceeding with a standard (non-draft) PR by default.
   Reply "draft" to open as draft instead.
```

If the user responds "draft" (or equivalent), add `--draft` to the `gh pr create` call and include this note in the PR body:

```
> **Note:** Opened as draft due to large change set (N files). Convert to ready when review is complete.
```

### Step 4-b — Create PR with retry

Create a PR targeting `main` with retry logic — up to **3 attempts** with exponential back-off (5 s → 15 s → 30 s).

The PR body must include:
- **Summary**: bullet points describing what changed and why
- **Files changed**: list of modified files (or affected packages, if many)
- **Test plan**: steps to verify the change works

On each attempt, if `gh pr create` returns "already exists", the PR was created on a prior attempt — retrieve the existing PR number with `gh pr list --head <branch> --json number,url` and continue. Do not create a duplicate PR.

If all 3 attempts fail with a non-duplicate error, report the raw error, stop, and consult `references/rollback.md § Post-Push Rollback` for recovery options.

Save the PR number and URL — required for Steps 4.5, 5, 5.5, and 9.

---

## Step 4.5 — Branch Protection Check

After PR creation, read the branch protection rules for `main`:

```bash
gh api repos/livoclouds/livo-clouds-claude-hud/branches/main/protection \
  --jq '{required_reviews: .required_pull_request_reviews.required_approving_review_count, required_checks: [.required_status_checks.contexts[]?]}'
```

Decision table:

| Condition | Action |
|---|---|
| `required_reviews > 0` and PR has 0 approvals | Report: "⚠️ Branch protection requires N approving review(s). Merge will be blocked." — pause and wait for user input |
| `required_checks` lists checks not yet run | Note the check names — Step 5.5 will monitor them |
| Protection not configured (404 response) | Log "ℹ️ No branch protection rules found — proceeding" and continue |
| Any other API error | Log the error and continue (non-blocking) |

Do not attempt to merge if `required_reviews > 0` and the PR has 0 approvals. The merge will fail and will have wasted the CI wait in Step 5.5.

---

## Step 5 — Check for Merge Conflicts

Query merge status:

```bash
gh pr view <PR_NUMBER> --json mergeable,mergeStateStatus
```

Decision gates:

| `mergeable` | `mergeStateStatus` | Action |
|---|---|---|
| `MERGEABLE` | `CLEAN` | Proceed to Step 5.5 |
| `CONFLICTING` | any | Proceed to Step 6B |
| `UNKNOWN` | any | Wait 10 s, retry up to 3 times. If still UNKNOWN → report and stop |

---

## Step 5.5 — CI Checks Wait Loop

Before merging, verify all required CI checks pass. Read `references/ci-checks.md` for the full polling strategy, timeout handling, and escalation rules.

```bash
gh pr checks <PR_NUMBER> --watch
```

**Timeout: 10 minutes.** If `gh pr checks --watch` has not returned by then, kill it and evaluate the last known state.

Decision after the command exits or times out:

| Condition | Action |
|---|---|
| All checks passed (exit 0) | Proceed to Step 6A |
| Any required check failed | Report check names + log URLs. Stop. Wait for user input. |
| Timeout — all visible checks passed | Ask user: "CI timed out but all visible checks passed. Proceed with merge?" |
| Timeout — some checks still pending | Report pending check names. Stop. Consult `references/rollback.md § Post-PR Rollback`. |
| No checks configured (empty output) | Log "ℹ️ No CI checks found — proceeding to merge" and continue |

The user may say "skip CI" or "merge now" to bypass this step. If so, log the override as `⚠️` in the Step 9 summary table.

---

## Step 6A — Merge to Main (no conflicts)

### Step 6A-0 — Detect merge strategy

Query the repo's allowed merge methods:

```bash
gh api repos/livoclouds/livo-clouds-claude-hud \
  --jq '{squash: .allow_squash_merge, merge: .allow_merge_commit, rebase: .allow_rebase_merge}'
```

Select the merge flag in priority order:

| Priority | Condition | Flag used |
|---|---|---|
| 1 (preferred) | `squash: true` | `--squash` |
| 2 (fallback) | `squash: false`, `merge: true` | `--merge` |
| 3 (last resort) | `squash: false`, `merge: false`, `rebase: true` | `--rebase` |

If all three are false or the API call fails, default to `--squash` and log the assumption.

### Step 6A-1 — Merge

```bash
gh pr merge <PR_NUMBER> <merge-flag> --delete-branch
```

Confirm the merge completed before continuing. If the merge command fails (conflicts still present, CI gate blocking, branch protection), stop and report the full error. Consult `references/rollback.md § Post-Merge Failure`.

### Step 6A-2 — Verify remote branch deletion

```bash
git ls-remote --heads origin <branch-name>
```

- Output is empty → remote branch confirmed deleted → proceed to Step 6A-4
- Output is non-empty → `--delete-branch` did not take effect → proceed to Step 6A-3

### Step 6A-3 — Force-delete remote branch (fallback)

```bash
git push origin --delete <branch-name>
```

### Step 6A-4 — Re-verify remote branch deletion

```bash
git ls-remote --heads origin <branch-name>
```

- Output is empty → deletion confirmed → proceed to Step 6A-5
- Output is non-empty → stop, report the exact output, and wait for user input. Do not continue to Step 7.

### Step 6A-5 — Prune remote-tracking refs

```bash
git fetch --prune
```

Always run this step after confirmed deletion, regardless of which path (6A-2 or 6A-4) confirmed it.

---

## Step 6B — Resolve Conflicts

```bash
git fetch origin main
git merge origin/main
```

Resolve all conflicts using the strategy table in `references/conflict-resolution.md`.

After resolving:
1. Stage all resolved files
2. Run `pnpm -w typecheck` — a textual resolution can still break the shared contract
3. Commit with message: `Resolve merge conflicts with main`
4. Push the branch
5. Return to **Step 5** to re-check merge status

Maximum **3 resolution attempts**. After the third failed attempt, follow the escalation procedure in `references/conflict-resolution.md § Escalation After 3 Failed Attempts`.

---

## Step 7 — Remove Worktree and Delete Local Branch

Execute this step **only after Step 6A (including 6A-5) completed successfully**.

### Step 7-a — Remove worktree

```bash
git worktree remove <worktree-path> --force
git worktree prune
```

`git worktree remove --force` only removes git-tracked files. Gitignored directories (`.next/`, `.turbo/`, `node_modules/`, `dist/`) and Claude-internal metadata (`.claude/`) are left behind. After prune, forcibly delete the physical directory if it still exists:

```bash
[ -d "<worktree-path>" ] && rm -rf "<worktree-path>"
```

### Step 7-b — Delete local branch

Because squash merge is the default, `git branch -d` will fail (squashed commits are not in `main`'s linear history). Use force-delete directly:

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

## Step 9 — Final Report and Notification

### Step 9-a — Render summary table

Render the consolidated summary table from `references/output-format.md § Final Summary Table`, then immediately render the PR delivery block from `references/output-format.md § PR Delivery Block`.

### Step 9-b — Send push notification

After rendering the PR delivery block, call the `PushNotification` harness tool with:

```
title: "agent-git-finalize complete"
message: "PR #<number> — <PR title> — <merged | draft | failed>"
```

This ensures the user is alerted even when the skill ran as a background agent and the terminal is not in view.

**The PR delivery block must be the absolute last element of the visible response. The `PushNotification` call is a tool invocation and does not appear in the visible output.**

---

## Safety Rules

- Never commit or push `.env*` files or anything matching `HUD_INGEST_TOKEN`
- Never bypass the Step 1.5 quality gate (typecheck + lint + build)
- Never force-push without explicit user approval
- Never delete the worktree before the merge is confirmed
- Never skip the branch protection check (Step 4.5)
- Never skip the conflict check (Step 5)
- Never skip the CI check wait (Step 5.5) — merging with a failing CI check is not acceptable
- Never skip the remote branch verification (Steps 6A-2 through 6A-5)
- Never skip the local branch deletion (Steps 7-b and 7-c)
- Never report cleanup success without completing both verification passes with all three signals
- If any step fails unexpectedly, stop, report the error in full, consult `references/rollback.md` for the appropriate recovery procedure, and wait for user input before proceeding
