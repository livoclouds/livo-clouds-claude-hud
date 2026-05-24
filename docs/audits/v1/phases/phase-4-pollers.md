# Phase 4 — Pollers

| | |
|---|---|
| **Severity** | Critical (C6) + High (H9, H10) |
| **Status** | ⏳ Pending |
| **PR** | — |
| **Estimated effort** | 7 hours |
| **Risk of regression** | Medium (bash; needs careful behavioural review) |

---

## Scope

Three findings, all in `hooks/*.sh`. The pollers run continuously on
the host; even small inefficiencies show up in sustained CPU and
disk-cache pressure. None of the changes touches the event contract
or the ingest path.

| Finding | Summary |
|---|---|
| [C6](../findings/critical.md#c6--transcript-pollersh-slurps-16-mb-jsonls-into-ram-every-2-s) | Incremental JSONL parsing using the persisted offset |
| [H9](../findings/high.md#h9--sessions-pollersh-issues-10000-syscalls-per-minute) | In-process cache of activity + standalone maps |
| [H10](../findings/high.md#h10--transcript-pollersh-silently-fails-to-persist-state) | Verify state directory creation; do not swallow errors |

## Files expected to change

- `hooks/transcript-poller.sh` — replace `jq -R -s` with incremental
  read from `prev_offset` to last `\n`; line-by-line parse via
  `jq -R 'fromjson?'`; persist `offset`, `tokensIn`, `tokensOut`,
  cumulative cache totals.
- `hooks/transcript-poller.sh` — fail loudly if
  `mkdir -p "$TRANSCRIPT_STATE_DIR"` does not yield a writable
  directory. Log to `hud-hook.log` with `status=fatal note=state_dir
  unwritable` and `exit 1`.
- `hooks/sessions-poller.sh` — keep `PREV_FIND_HASH`,
  `PREV_ACTIVITY_MAP`, `PREV_STANDALONE_MAP` between ticks. Recompute
  only when the SHA of the sorted `find` output changes. For files
  whose `mtime` did not change, reuse cached `cwd` instead of reading
  the head.

## Test plan

- `pnpm -w typecheck`, `pnpm -w lint`, `pnpm -w build`, `pnpm -w test`
  all green (no app-side code changes expected, but run the suite as
  insurance).
- Manual: with both pollers active and the audit-host workload
  (~78 sessions, several active), `top -pid $(pgrep -f
  transcript-poller.sh)` should show < 1 % CPU sustained.
- Manual: `time bash hooks/transcript-poller.sh` short-run with a
  16 MB JSONL — the process should not exceed 5 MB of RSS at any
  point (compare against pre-fix baseline).
- Manual: invalidate the state dir (`chmod 000
  ~/.claude/hud-transcript-state`). On next launch, the poller must
  log `status=fatal note=state_dir_unwritable` and exit non-zero —
  not run quietly.
- Manual: dry-run `sessions-poller.sh` for 5 minutes with no actual
  filesystem changes. After the first tick, subsequent ticks should
  re-emit cached snapshots without any `stat` or `head` calls
  (verifiable via `dtrace` / `fs_usage`).

## Before / after metrics

Filled in when this phase merges.

| Metric | Before | After | Target |
|---|---|---|---|
| `transcript-poller` peak RSS per tick (16 MB JSONL) | ~16 MB | < 1 MB | < 5 MB |
| `sessions-poller` syscalls / minute (244 JSONL host) | ~10 000 | < 2 000 | < 5 000 |
| `sessions-poller` sustained CPU% | TBD | < 2 % | < 2 % |
| State persistence success rate | unreliable | 100 % | 100 % |

## Status updates

- **2026-05-24** — Phase scoped, awaiting implementation.

## What was deferred

(filled in if any item in scope is split out)
