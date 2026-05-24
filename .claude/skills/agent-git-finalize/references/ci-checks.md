# CI Checks Reference

This file defines the wait strategy for Step 5.5. Read this before implementing the CI check wait loop.

---

## Primary Command

```bash
gh pr checks <PR_NUMBER> --watch
```

`--watch` streams check results as they complete and exits automatically when all checks finish (pass or fail). It blocks until the final check resolves.

---

## Timeout

**10 minutes** from when Step 5.5 starts.

Implementation: run `gh pr checks <PR_NUMBER> --watch` and track elapsed time. If the process has not exited after 600 seconds, kill it and evaluate the last known state using:

```bash
gh pr checks <PR_NUMBER>
```

---

## Decision Table

| Condition | Action |
|---|---|
| All checks passed (exit 0) | Proceed to Step 6A |
| Any required check failed | Report check names + log URLs. Stop. Wait for user input. |
| Timeout — all visible checks passed | Ask user: "CI timed out but all visible checks passed. Merge anyway?" |
| Timeout — some checks still pending | Report pending check names. Stop. Consult `references/rollback.md § Post-PR Rollback`. |
| No checks exist (empty output) | Log "ℹ️ No CI checks configured — proceeding to merge" and continue |
| `gh pr checks` errors (e.g., auth failure) | Log the error. Ask user whether to proceed or abort. |

---

## Reporting Failed Checks

When a check fails, output the following for each failed check:

```
❌ Check failed: <check-name>
   Conclusion : <failure | timed_out | cancelled>
   Details URL: <link>
```

Do not guess the failure reason from the check name. Link to the details URL — the user must inspect the CI log directly.

---

## Skipping the CI Wait

The user may explicitly say "skip CI" or "merge now". If so:
- Log: "⚠️ CI check wait skipped by explicit user request"
- Proceed to Step 6A directly
- Record the skip in the Step 9 summary table with `⚠️` status
