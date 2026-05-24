# Output Format

This file defines the exact visual format for Step 0 (activation banner) and Step 5 (final report) of the sync-repository skill. No prose before or after the structured output.

---

## § Activation Banner

Render this block as the very first output of the skill, before any fetch or pull is attempted.

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔄  sync-repository  —  ACTIVATED
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Reason  : <activation reason>
Repo    : hud (livoclouds/livo-clouds-claude-hud)
Time    : <ISO 8601 timestamp>
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

**Activation reason values:**
- `Explicit user request — /sync-repository`
- `Explicit user request (natural language): "<exact phrase used>"`
- `Invoked by Claude — post-finalize workflow`

---

## § Progress Summary Table

Render this table at Step 5, after the pull completes. Every step gets a row. Use the emoji key for status. Fill in actual values — never use placeholder text in a real run.

**Emoji key:**
| Emoji | Meaning |
|-------|---------|
| ✅ | Success / up to date |
| 🆕 | Updated — new commits pulled |
| ❌ | Failed — stopped |
| ⚠️ | Completed with attention item |
| 🔀 | Branch switched before pull |
| 🗑️ | Stale branch pruned |
| ⏭️ | Skipped — earlier failure prevented this step |
| 🔁 | Retried — show count as `🔁×N` |

### Happy-path template

```markdown
## 🔄 sync-repository — YYYY-MM-DD

| Step | Operation              | 📺 HUD |
|------|------------------------|--------|
| 0    | Activation             | ✅ <reason> |
| 1    | Fetch                  | ✅ |
| 2    | Status                 | `main` · <N> behind |
| 3    | Pull                   | 🆕 `<before>..<after>` · <N> commit(s) |
| 4    | Verify + cleanup       | ✅ HEAD verified · no stale branches |
```

### When the repo is already up to date

Show the last commit SHA so the user can confirm they are at the expected state:

```markdown
| 3    | Pull                   | ✅ Up to date · last: `<sha> <title>` |
| 4    | Verify + cleanup       | ✅ HEAD verified · no stale branches |
```

### Variant rows for non-happy paths

Use these rows to replace the corresponding happy-path rows when applicable:

```markdown
| 1    | Fetch                  | ❌ Network error — sync aborted |
| 1    | Fetch                  | ❌ Auth failure — sync aborted |
| 1    | Fetch                  | 🔁×2 Transient failure · succeeded on attempt 3 |
| 1    | Fetch                  | ❌ Timed out after 120 s (3 attempts) |
| 2    | Status                 | ❌ Detached HEAD — sync aborted |
| 2    | Status                 | `main` · 2 behind · ⚠️ worktree holds `main` |
| 2    | Status                 | ⚠️ tsconfig.tsbuildinfo modified — proactive discard offered |
| 3    | Pull                   | ❌ Blocked by `tsconfig.tsbuildinfo` — awaiting user |
| 3    | Pull                   | 🔀 Switched from `feat/x` · 🆕 `abc..def` · 🗑️ `feat/x` |
| 3    | Pull                   | ❌ Diverged — N local commits unpushed |
| 3    | Pull                   | ⚠️ On feature branch `<branch>` · `<before>..<after>` · local `main` <N> behind |
| 4    | Verify + cleanup       | ⏭️ Skipped — Step 3 failed |
| 4    | Verify + cleanup       | ⚠️ HEAD mismatch detected — investigate before proceeding |
| 4    | Verify + cleanup       | ⚠️ <N> stale local branch(es) found · see Attention section |
```

---

## § Changes Table

Render this table only when the pull brought new commits. Omit entirely if the repo was already up to date.

### PR attribution

- If the commit title contains `(#N)`, include `PR #N` in the row.
- If multiple commits were pulled, list each PR number separated by `·` (e.g., `PR #12 · PR #13`).
- If no PR number is apparent from the commit title, omit the PR reference — do not guess.

### HUD changes table — standard (≤ 8 areas)

```markdown
### 📺 HUD — Changes

| Area / File | What changed |
|---|---|
| `packages/contracts/src/event.ts` | Added `compact.start` / `compact.end` types |
| `apps/hud/components/mascot/` | Wired `compacting` state to new events |
| `docs/v1/phase-3/` | Added SSE backpressure decision doc |
```

**Table guidelines:**
- Group related files into one row (e.g., all i18n keys, all docs, all tests).
- Prefer module or component names over raw file paths when the meaning is obvious.
- Maximum ~8 rows before switching to the large changeset format below.
- For documentation-only changes, a single row is sufficient.
- Never list `tsconfig.tsbuildinfo`, `pnpm-lock.yaml` (mention only if intentionally regenerated), or build outputs.

### HUD changes table — large changeset (> 8 areas)

When a pull brings > 8 distinct areas of change, collapse into an area summary:

```markdown
### 📺 HUD — Changes (<N> files across <M> areas)

| Area | Files | What changed |
|---|---|---|
| Skill: `agent-git-finalize` | 6 | Hardened with quality gates, CI wait, rollback map |
| `apps/hud/components/` | 12 | Mascot state machine refactor |
| `packages/contracts/` | 3 | New event types for compact lifecycle |
| Docs (`docs/v1/`) | 8 | Phase 9 documentation |
| Config / tooling | 4 | pnpm workspace scripts updated |
```

Keep to ≤ 6 area rows even for very large changesets — group aggressively by domain.

---

## § Attention Section

Render this section only when something requires the user's awareness. Omit entirely when clean.

```markdown
### ⚠️ Attention

- ⚠️ Active worktrees detected: `worktree-phase-3-sse-stream`. Pull targeted `main` only.
- ⚠️ On feature branch `feat/cost-card` (active upstream). Local `main` is 3 commits behind `origin/main` — switch to `main` and re-run sync to update.
- ⚠️ `.env.local` shows local modifications. Left untouched (protected file).
- ⚠️ Stale local branches (upstream deleted): `worktree-phase-3`, `feat/old-card`. Review and delete with `git branch -d <name>` if no longer needed.
- ⚠️ Dependencies changed — run `pnpm install` before starting the dev server.
- ⚠️ Shared event contract changed (CLAUDE.md §8) — restart the HUD server to pick up the new schema.
```

---

## Complete Example — Repo updated

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔄  sync-repository  —  ACTIVATED
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Reason  : Explicit user request — /sync-repository
Repo    : hud (livoclouds/livo-clouds-claude-hud)
Time    : 2026-05-23T09:45:00Z
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

[... fetch, inspect, pull, and verify execute ...]

## 🔄 sync-repository — 2026-05-23

| Step | Operation              | 📺 HUD |
|------|------------------------|--------|
| 0    | Activation             | ✅ Explicit user request |
| 1    | Fetch                  | ✅ |
| 2    | Status                 | `main` · 1 behind |
| 3    | Pull                   | 🆕 `b4cf17f..f87c623` · 1 commit · PR #6 |
| 4    | Verify + cleanup       | ✅ HEAD verified · no stale branches |

### 📺 HUD — Changes

| Area / File | What changed |
|---|---|
| `packages/contracts/` | HudEventSchema introduced (Phases 1 + 2 scaffold) |
```

---

## Complete Example — Already up to date

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔄  sync-repository  —  ACTIVATED
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Reason  : Explicit user request (natural language): "pull latest"
Repo    : hud (livoclouds/livo-clouds-claude-hud)
Time    : 2026-05-23T10:00:00Z
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

## 🔄 sync-repository — 2026-05-23

| Step | Operation              | 📺 HUD |
|------|------------------------|--------|
| 0    | Activation             | ✅ Natural language request |
| 1    | Fetch                  | ✅ |
| 2    | Status                 | `main` · up to date |
| 3    | Pull                   | ✅ Up to date · last: `f87c623 feat(contracts): HudEventSchema + monorepo scaffold (#6)` |
| 4    | Verify + cleanup       | ✅ HEAD verified · no stale branches |
```
