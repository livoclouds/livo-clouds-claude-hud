---
name: sync-repository
description: Synchronize the livo-clouds-claude-hud repository with its GitHub remote. Invoke ONLY when the user explicitly requests a repo sync via natural language ("sync repo", "actualiza el repositorio", "pull latest", "trae los cambios") or the slash command /sync-repository. Never auto-trigger alongside other skills or infer from unrelated context.
---

# Sync Repository Skill

Synchronize the `livo-clouds-claude-hud` repository with its `origin` remote, handle all known edge cases safely, and deliver a structured visual summary with step-by-step progress visibility.

This repo is a single-repo pnpm monorepo. There is no companion API repo — every step targets `livo-clouds-claude-hud` only.

## Activation — Explicit Only

This skill activates **only** when the user explicitly asks for a sync. It must **never** be triggered automatically alongside other skills or inferred from unrelated context.

**Valid triggers:**
- `/sync-repository`
- Natural language: "sync repo", "actualiza el repositorio", "pull latest", "trae los cambios", "update repository", "fetch and pull", or any clear intent to sync.
- Invoked by Claude as a post-finalize follow-up (after `/agent-git-finalize` completes a merge).

**Never activate when:**
- The user is asking about code, bugs, or features (even if they mention "latest changes")
- The task is about commits, PRs, or deployments
- This skill would be invoked as a sub-skill by another skill without explicit user instruction

**Record the activation reason** — it will appear in the Step 0 banner. Classify it as one of:
- `Explicit user request — /sync-repository`
- `Explicit user request (natural language): "<exact phrase used>"`
- `Invoked by Claude — post-finalize workflow`

## Objective

Pull the latest commits from `origin/main` into the local repository, clean up stale remote references, handle branch mismatches and local modifications safely, and report the results in a consistent visual format with full step-by-step visibility.

## Execution Procedure

Follow the 6-step sequence defined in `references/sync-procedure.md` exactly:

- **Step 0** — Announce activation
- **Step 1** — Fetch (with retry + 120 s timeout)
- **Step 2** — Inspect status (with proactive tsconfig check)
- **Step 3** — Pull (Cases A / B / C)
- **Step 4** — Post-pull verification and cleanup (HEAD check, stale branch scan, contextual reminders)
- **Step 5** — Render output and send push notification

Handle all edge cases as documented in `references/edge-cases.md`.
Render the output using the templates in `references/output-format.md`.
Repository path and configuration live in `references/repo-config.md`.

## Safety Constraints

- Always use `--ff-only` on pull. Never rebase or merge silently.
- Always use `--prune` on fetch to clean stale remote refs.
- Never commit, push, or modify any source file during a sync — git read/sync operations only.
- Never discard local modifications without explicit user approval.
- Never delete a local branch with `-D` (force). Only `-d` (safe — git refuses if not merged).
- If a pull is blocked by a local file conflict, stop and ask the user before acting.
- If `main` has diverged (local commits ahead of origin), abort and report. Never reset.
- If the fetch step fails (network error, auth failure), retry transient failures up to 2 times; stop and report on permanent failures or after retries are exhausted.
- If fetch exceeds 120 seconds, kill the process and apply the retry logic.
- If `main` is checked out inside an active worktree (not the primary), stop and ask — never try to force the pull from the primary worktree.
- Never delete stale local branches automatically — report them and let the user decide.

## Output

Always respond with the markdown summary defined in `references/output-format.md`. The response begins with the activation banner (Step 0) and ends with the progress summary table. No prose before or after the structured report.
