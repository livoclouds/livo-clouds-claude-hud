# Output Format Reference

This file defines the exact visual format for Step 0 (activation banner) and Step 9 (final report) of the agent-git-finalize skill.

---

## § Activation Banner

Render this block as the very first output of the skill, before any action is taken.

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🚀  agent-git-finalize  —  ACTIVATED
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Reason  : <activation reason>
Branch  : <branch-name>
Repo    : livoclouds/livo-clouds-claude-hud
Time    : <ISO 8601 timestamp>
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

**Activation reason values:**
- `Explicit user request — /agent-git-finalize`
- `Explicit user request (natural language): "<exact phrase used>"`
- `Invoked by Claude — background job completion`

---

## § Final Summary Table

Render this table at Step 9, before the PR Delivery Block. Every executed step gets one row. Use the emoji key for status. Include retry counts and brief inline notes.

**Emoji key:**
| Emoji | Meaning |
|-------|---------|
| ✅ | Success |
| ❌ | Failed — execution stopped |
| ⚠️ | Completed with intervention (fallback used, conflict resolved, CI skipped by user) |
| 🔁 | Retried — show count as `🔁×N` |
| ℹ️ | Informational notice (tracker reminder, no CI checks configured, etc.) |
| 🔄 | Rollback triggered — recovery procedure from `references/rollback.md` was executed |

### Happy-path template

```markdown
## ✅ agent-git-finalize — Complete

| #   | Step                           | Status | Notes |
|-----|--------------------------------|--------|-------|
| 0   | Activation                     | ✅ | <activation reason> |
| 1   | Repo state reviewed            | ✅ | Branch: `<branch>` · <N> files changed |
| 1.5 | Quality gate                   | ✅ | typecheck · lint · build passed |
| 2   | Secrets check + committed      | ✅ | "<commit title>" |
| 2.5 | Docs tracker reminder          | ✅ | (or ℹ️ shown — phase docs touched) |
| 3   | Pushed to remote               | ✅ | `origin/<branch>` |
| 4   | Pull Request created           | ✅ | PR #<number> |
| 4.5 | Branch protection check        | ✅ | No blocking rules |
| 5   | Conflict check                 | ✅ | CLEAN |
| 5.5 | CI checks                      | ✅ | All checks passed |
| 6   | Merged to main                 | ✅ | Squash merge |
| 6′  | Remote branch deleted          | ✅ | Verified via `git ls-remote` |
| 6″  | Remote refs pruned             | ✅ | `git fetch --prune` |
| 7   | Worktree removed               | ✅ | `<worktree-path>` |
| 7′  | Local branch deleted           | ✅ | `<branch>` |
| 8   | Cleanup verified (×2)          | ✅ | Worktree dir · worktree list · local branch |
```

### Variant rows for non-happy paths

Use these rows to replace the corresponding happy-path rows when applicable:

```markdown
| 1.5 | Quality gate                   | ❌ | typecheck failed in `<package>` — commit blocked |
| 1.5 | Quality gate                   | ❌ | lint failed in `<file>` — commit blocked |
| 1.5 | Quality gate                   | ❌ | build failed — commit blocked |
| 2   | Secrets check + committed      | ❌ | `.env.local` was staged — commit blocked |
| 3   | Pushed to remote               | 🔁×2 | Transient network failure · succeeded on attempt 3 |
| 4   | Pull Request created           | 🔁×2 | Transient failure · succeeded on attempt 3 |
| 4.5 | Branch protection check        | ⚠️ | N required reviews — paused for user approval |
| 4.5 | Branch protection check        | ℹ️ | No branch protection configured |
| 5   | Conflict check                 | ⚠️ | CONFLICTING — resolved automatically |
| 5   | Conflict check                 | 🔁×3 | UNKNOWN state — could not determine mergeability |
| 5.5 | CI checks                      | ❌ | `<check-name>` failed — merge blocked |
| 5.5 | CI checks                      | ⚠️ | CI wait skipped by user request |
| 5.5 | CI checks                      | ⚠️ | Timeout — user approved merge with pending checks |
| 5.5 | CI checks                      | ℹ️ | No CI checks configured |
| 6   | Merged to main                 | ✅ | Squash merge after conflict resolution |
| 6   | Merged to main                 | ✅ | Merge commit (squash disabled in repo settings) |
| 6   | Merged to main                 | ✅ | Rebase merge (squash + merge commit disabled) |
| 6   | Merged to main                 | ❌ | Conflicts could not be resolved — PR converted to draft |
| 6   | Merged to main                 | 🔄 | Post-merge failure — rollback procedure executed |
| 6′  | Remote branch deleted          | ⚠️ | `--delete-branch` missed · fallback `git push --delete` used |
| 6′  | Remote branch deleted          | ❌ | Could not delete remote branch — manual intervention required |
| 7′  | Local branch deleted           | ❌ | `git branch -D` failed — manual intervention required |
| 7   | Worktree removed               | 🔄 | Partial failure — rollback cleanup executed |
| 8   | Cleanup verified (×2)          | ⚠️ | Pass 1 found residuals · Pass 2 clean |
| 8   | Cleanup verified (×2)          | ❌ | Residuals remain after both passes — manual cleanup required |
```

---

## § PR Delivery Block

Render this block immediately after the Final Summary Table. It must be the **absolute last element** of the response — no prose, no newlines with text, no additional notes after it.

```markdown
---

## 🎉 Pull Request — Delivered

| | |
|---|---|
| **Repo** | `livoclouds/livo-clouds-claude-hud` |
| **PR** | #`<number>` |
| **Title** | <PR title> |
| **Status** | ✅ Squash merged to `main` |

### 🔗 [Open Pull Request →](<full GitHub PR URL>)

---
```

The `### 🔗 [Open Pull Request →]` line renders as a large heading-level clickable link, visually isolated from surrounding content.

**When merge was skipped (unresolvable conflicts), replace the Status row:**

```markdown
| **Status** | ❌ Not merged — manual intervention required |
```

---

## Complete Example

```markdown
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🚀  agent-git-finalize  —  ACTIVATED
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Reason  : Explicit user request — /agent-git-finalize
Branch  : worktree-phase-3-sse-stream
Repo    : livoclouds/livo-clouds-claude-hud
Time    : 2026-05-23T09:32:00Z
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

[... steps execute ...]

## ✅ agent-git-finalize — Complete

| #   | Step                           | Status | Notes |
|-----|--------------------------------|--------|-------|
| 0   | Activation                     | ✅ | Explicit user request — /agent-git-finalize |
| 1   | Repo state reviewed            | ✅ | Branch: `worktree-phase-3-sse-stream` · 4 files changed |
| 1.5 | Quality gate                   | ✅ | typecheck · lint · build passed |
| 2   | Secrets check + committed      | ✅ | "feat(hud): SSE stream endpoint + client subscriber" |
| 2.5 | Docs tracker reminder          | ℹ️ | Phase 3 docs touched — regenerate tracker before merge |
| 3   | Pushed to remote               | ✅ | `origin/worktree-phase-3-sse-stream` |
| 4   | Pull Request created           | ✅ | PR #12 |
| 4.5 | Branch protection check        | ℹ️ | No branch protection configured |
| 5   | Conflict check                 | ✅ | CLEAN |
| 5.5 | CI checks                      | ✅ | All checks passed |
| 6   | Merged to main                 | ✅ | Squash merge |
| 6′  | Remote branch deleted          | ✅ | Verified via `git ls-remote` |
| 6″  | Remote refs pruned             | ✅ | `git fetch --prune` |
| 7   | Worktree removed               | ✅ | `.claude/worktrees/phase-3-sse-stream` |
| 7′  | Local branch deleted           | ✅ | `worktree-phase-3-sse-stream` |
| 8   | Cleanup verified (×2)          | ✅ | Worktree dir · worktree list · local branch |

---

## 🎉 Pull Request — Delivered

| | |
|---|---|
| **Repo** | `livoclouds/livo-clouds-claude-hud` |
| **PR** | #12 |
| **Title** | feat(hud): SSE stream endpoint + client subscriber |
| **Status** | ✅ Squash merged to `main` |

### 🔗 [Open Pull Request →](https://github.com/livoclouds/livo-clouds-claude-hud/pull/12)

---
```
