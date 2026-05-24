# Rollback Reference

This file defines recovery procedures for each failure stage in the agent-git-finalize workflow. Consult the relevant section when a step fails and you need to leave the repository in a clean, known state.

---

## Stage Map

| Stage | Entered after | Rollback section |
|---|---|---|
| Quality gate failure | Step 1.5 failed | § Quality Gate Failure |
| Post-commit | Step 2 succeeded | § Post-Commit Rollback |
| Post-push | Step 3 succeeded | § Post-Push Rollback |
| Post-PR | Step 4 succeeded | § Post-PR Rollback |
| Post-merge failure | Step 6A-1 failed mid-way | § Post-Merge Failure |
| Post-worktree-delete | Step 7 failed | § Post-Worktree-Delete Failure |

---

## § Quality Gate Failure

No changes have been made to git history. The working tree is unchanged.

**Recovery:** Fix the failing gate (typecheck / lint / build error), re-run Step 1.5, and continue from Step 2 when all gates pass. No git operations required.

---

## § Post-Commit Rollback

The commit exists locally but has not been pushed.

**To undo the commit and return to the pre-commit state:**
```bash
git reset --soft HEAD~1   # keeps changes staged
# or
git reset HEAD~1          # unstages changes, keeps files on disk
```

**To keep the commit and push anyway:** continue from Step 3. The commit is safe — it passed the quality gate and the secrets check.

---

## § Post-Push Rollback

The branch exists on the remote. No PR has been created yet.

**Options:**
1. **Continue from Step 4** (preferred) — the push succeeded; create the PR and proceed normally.
2. **Delete the remote branch and start over:**
   ```bash
   git push origin --delete <branch-name>
   git reset HEAD~1   # undo the commit locally if needed
   ```

---

## § Post-PR Rollback

The PR exists on GitHub. It has not been merged.

The PR is safe to leave open — GitHub will not auto-merge it. Options:

1. **Continue from Step 4.5** — resume the workflow where it failed.
2. **Close the PR without merging:**
   ```bash
   gh pr close <PR_NUMBER>
   ```
3. **Delete the remote branch (also closes the PR):**
   ```bash
   git push origin --delete <branch-name>
   ```

---

## § Post-Merge Failure

The merge command was run but its outcome is uncertain (e.g., the process was interrupted).

**First, determine the actual state:**
```bash
gh pr view <PR_NUMBER> --json state,mergedAt
git log origin/main --oneline -5
```

| Observed state | Action |
|---|---|
| PR is merged, `main` has the commit | Proceed from Step 6A-2 (verify remote branch deletion) |
| PR is open, `main` does not have the commit | Retry Step 6A-1 |
| PR is closed (not merged) | Re-open with `gh pr reopen <PR_NUMBER>` and retry |

Never push directly to `main`. All merges go through the PR.

---

## § Post-Worktree-Delete Failure

The merge succeeded. The worktree or local branch was not fully cleaned up.

**Check what remains:**
```bash
git worktree list
git branch --list <branch-name>
ls <worktree-path>
```

**Remove worktree manually:**
```bash
git worktree remove <worktree-path> --force
git worktree prune
rm -rf <worktree-path>
```

**Delete local branch manually:**
```bash
git branch -D <branch-name>
```

The merge is already on `main` — this is cleanup only, no code is at risk.

---

## General Principles

- Never push directly to `main`.
- Never amend a commit that has been pushed.
- When in doubt about the repository state, run `git status`, `git log --oneline -10`, and `gh pr view <PR_NUMBER>` before taking any action.
- If the state is ambiguous, stop and ask the user.
