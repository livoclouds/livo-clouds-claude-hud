# Conflict Resolution Reference

This file defines how to handle merge conflicts during Step 6B.

---

## Resolution Strategy by File Type

| File type | Strategy |
|---|---|
| Documentation (`.md`) | Keep current branch version unless `main` is clearly more recent or complete |
| Source code (`.ts`, `.tsx`, `.js`) | Inspect both sides carefully — do not silently discard logic. If in doubt, stop and ask the user |
| Config files (`*.json`, `*.yaml`, `*.toml`) | Merge both sides manually, preserving all valid keys from both versions |
| Lock files (`pnpm-lock.yaml`) | Regenerate using `pnpm install` (this repo uses pnpm workspaces) — never merge lock file conflicts manually. Run from the repo root. |
| Generated files | Accept the current branch version |

---

## Resolution Process

```bash
# 1. Fetch latest main
git fetch origin main

# 2. Merge main into current branch
git merge origin/main

# 3. List conflicting files
git diff --name-only --diff-filter=U

# 4. Resolve each conflict
#    Edit the file, remove conflict markers (<<<<<<<, =======, >>>>>>>)

# 5. Mark resolved
git add <resolved-file>

# 6. Re-run the typecheck gate (Step 1.5) — a textual conflict resolution
#    can still produce a broken contract.
pnpm -w typecheck

# 7. Complete the merge
git commit -m "Resolve merge conflicts with main"

# 8. Push
git push origin <branch>
```

---

## When to Stop and Ask

Stop and ask the user before resolving if:

- The conflict is in `packages/contracts/src/event.ts` or any other shared Zod schema (CLAUDE.md §8). These files are the **source of truth** for the event contract between hook, API, and UI — never resolve a conflict here without user confirmation.
- The conflict is in any cost or token calculation (`apps/hud/lib/**`, anything that derives `costUsd` or `contextPct`).
- The conflict is in auth-related code (anything touching `HUD_INGEST_TOKEN`, the `Authorization` header validation, or the SSE upgrade handshake).
- Both sides contain significant and incompatible logic changes.
- The conflict is in a mascot state machine file — visual states are declarative (CLAUDE.md §7) and a silent merge could produce ambiguous states.
- You cannot determine which version is correct without domain context.

In these cases, do not guess. Report the conflicting file, show both versions (current branch vs main), and wait for user input.

---

## After Resolution

Return to **Step 5** to re-check `gh pr view --json mergeable,mergeStateStatus`.

The loop is: resolve → typecheck → push → Step 5 → if still conflicting → resolve again.

Maximum 3 resolution attempts before stopping and escalating to the user.

---

## § Escalation After 3 Failed Attempts

If the conflict loop has run 3 times and the PR is still `CONFLICTING`, execute the following escalation procedure instead of retrying.

### Step 1 — Abort the in-progress merge

```bash
git merge --abort
```

This restores the branch to the clean state before the last merge attempt.

### Step 2 — Push the clean branch state

```bash
git push --force-with-lease origin <branch-name>
```

`--force-with-lease` is safe here: it only pushes if the remote branch matches what we last fetched, preventing accidental overwrites. This is the one approved force-push scenario in this skill.

### Step 3 — Convert PR to draft

```bash
gh pr ready <PR_NUMBER> --undo
```

This signals to the reviewer that manual intervention is needed before merge.

### Step 4 — Output recovery checklist

Report the following block verbatim, filling in the placeholders:

```
⛔ Conflict escalation after 3 failed attempts

Branch    : <branch-name>
PR        : #<PR_NUMBER> (converted to draft)
Conflicts : <list of files that could not be resolved automatically>

Manual resolution required. Steps for the user:

1. git fetch origin
2. git checkout <branch-name>
3. git merge origin/main
4. Resolve conflicts in the listed files (see "When to Stop and Ask" above)
5. git add <resolved-files>
6. pnpm -w typecheck
7. git commit -m "Resolve merge conflicts with main"
8. git push origin <branch-name>
9. gh pr ready <PR_NUMBER>   # mark PR ready when done
10. Re-run /agent-git-finalize to complete the merge flow
```

Do not attempt any further automated merge steps. Wait for the user to complete the manual resolution and explicitly re-invoke the skill.
