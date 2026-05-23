# Edge Cases

Documented edge cases for the HUD repository sync. Handle each exactly as described.

---

## Pull Blocked by Local File Conflict

**Symptom:** `git pull --ff-only` exits with:
```
error: Your local changes to the following files would be overwritten by merge:
    <filename>
Please commit your changes or stash them before you merge.
Aborting
```

**Action:**
1. Stop. Do not proceed.
2. Report which file is blocking the pull.
3. If the file is `tsconfig.tsbuildinfo` (a TypeScript build cache), inform the user it is safe to discard and offer:
   - **Option A (recommended):** `git checkout -- <path-to-tsbuildinfo>` then retry pull.
   - **Option B:** `git stash push <file>` then pull then `git stash pop`.
   - **Option C:** Skip this sync entirely.
4. If the file is NOT `tsconfig.tsbuildinfo`, present the same three options but do not characterize the file as safe to discard — let the user decide.
5. If the file is a `.env*` or under `data/events-*.jsonl`, **never** offer to discard — these are tracked in `repo-config.md` as "must never be touched". Stop and ask the user.
6. Never act without user confirmation.

---

## Feature Branch with Upstream `[gone]`

**Symptom:** `git status --branch` shows:
```
## feat/some-branch...origin/feat/some-branch [gone]
```

This is the normal state after a squash-merge PR has deleted its remote branch.

**Action (approved pattern):**
1. Switch to `main`: `git switch main` — locally modified files carry over as long as they do not conflict with `main`.
2. Pull: `git pull --ff-only origin main`.
3. Check if the stale branch is merged: `git branch --merged main | grep <branch>`.
4. If merged: `git branch -d <branch>` (safe delete only — `-d` not `-D`).
5. If not merged: leave it, report in summary.

---

## Feature Branch with Active Upstream

**Symptom:** Branch shows an upstream tracking ref that is NOT `[gone]` and NOT `main`.

**Action:**
- Do not force-switch to `main`.
- Pull the current branch: `git pull --ff-only origin <branch>`.
- Report in summary that the HUD is on a feature branch (not `main`), and show the branch name.
- Also check if `origin/main` moved separately: run `git log --oneline main..origin/main` and report how many commits behind local `main` is.

---

## Diverged `main` (Local Commits Ahead)

**Symptom:** `git pull --ff-only` exits with:
```
fatal: Not possible to fast-forward, aborting.
```
or `git status` shows `[ahead N, behind M]`.

**Action:**
1. Stop. Do not rebase, merge, or reset.
2. Report: "Local `main` has N unpushed commits and cannot be fast-forwarded."
3. Suggest the user review and push or reset manually.
4. Record the sync as ❌ in the progress table.

---

## Switch Blocked by Local Modifications

**Symptom:** `git switch main` fails because a locally modified file conflicts with `main`:
```
error: Your local changes to the following files would be overwritten by checkout
```

**Action:**
1. Stop the sync.
2. Report exactly which file is blocking the switch.
3. Ask the user whether to stash the file (`git stash push <file>`) before switching.
4. Never discard or stash automatically.

---

## `tsconfig.tsbuildinfo` — Known Recurring File

This file appears as modified (`M tsconfig.tsbuildinfo`) regularly in TypeScript projects. It is a TypeScript incremental compilation cache that regenerates on every build.

- If it appears as `M` but does **not** block pull: ignore it entirely, leave as-is, do not mention it in the summary.
- If it **blocks** a pull: apply the "Pull Blocked by Local File Conflict" procedure above.
- Do not commit or stage this file under any circumstance.

---

## Network or Authentication Failure

**Symptom:** `git fetch` exits with any of:
```
ssh: connect to host github.com port 22: Connection timed out
fatal: Could not read from remote repository.
fatal: unable to access 'https://...': Could not resolve host: github.com
Permission denied (publickey).
```

**Action:**
1. Stop immediately. Do not attempt to pull.
2. Report the exact error message.
3. Record the sync as ❌ in the progress table.
4. Suggest: check network connectivity, VPN status, and SSH key configuration (`ssh -T git@github.com`).
5. Do not retry automatically.

---

## Active Worktrees

**Symptom:** `git -C <hud-path> worktree list` shows entries beyond the primary worktree:
```
/Users/.../livo-clouds-claude-hud                                                          a3ed633 [main]
/Users/.../livo-clouds-claude-hud/.claude/worktrees/phase-3-sse-stream                     689f897 [worktree-phase-3-sse-stream]
```

**Action:**
- If the primary worktree is on `main` (first row): proceed with `git pull --ff-only origin main` normally. Active worktrees on other branches are unaffected.
- If `main` is checked out **inside a worktree** (not the primary worktree): `git pull` from the primary worktree will fail with `fatal: '<branch>' is already used by worktree at '<path>'`. In this case:
  1. Stop. Do not attempt the pull.
  2. Report which worktree has `main` checked out and its path.
  3. Suggest the user exit or remove that worktree before syncing.
  4. Record the sync as ❌ in the progress table.

---

## Detached HEAD

**Symptom:** `git status --branch` shows:
```
## HEAD (no branch)
```

**Action:**
1. Stop the sync.
2. Report: "Repository is in detached HEAD state. Cannot sync safely."
3. Do not attempt to pull or switch branches.
4. Suggest the user run `git switch main` manually to reattach HEAD before retrying.
5. Record the sync as ❌ in the progress table.

---

## Protected Files Present

**Symptom:** `git status --short` shows `M` (modified) or staged changes on any file listed in `repo-config.md § Files That Must Never Be Touched` — `.env*` files or `data/events-*.jsonl`.

**Action:**
- If the protected files do **not** conflict with the incoming pull: `git pull --ff-only` proceeds normally — fast-forward does not touch files that are only locally modified (not in conflict). Leave them as-is.
- If the protected files **are** listed in the pull conflict error: stop, apply "Pull Blocked by Local File Conflict", and do **not** offer to discard. Wait for explicit user direction.
- After a successful pull: report these files in the `⚠️ Attention` section with a clear "Left untouched" note.
- Never stash or discard these files.
