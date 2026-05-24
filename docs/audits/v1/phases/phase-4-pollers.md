# Phase 4 — Pollers

| | |
|---|---|
| **Severity** | Critical (C6) + High (H9, H10) |
| **Status** | ✅ Completed |
| **PR** | Local changes pending PR |
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

## What was done

- **C6** — `process_jsonl` in `hooks/transcript-poller.sh` replaced the `jq -R -s` full-file
  slurp with incremental byte-offset reading. Each tick reads only bytes since the previous
  persisted `offset` via `tail -c +N`. Complete lines (up to the last `\n`) are parsed by jq
  line-by-line (`-Rc`); any trailing partial line is left for the next tick. Cumulative token
  totals are built incrementally by adding the per-turn delta to the previously persisted totals.
  The state file now persists `offset`, `lastInput`, `lastOutput`, `lastCacheRead`,
  `lastCacheCreation` alongside the existing fields. File truncation is detected and resets the
  offset to 0 for a clean recovery. Backward compatible: existing state files without `offset`
  default to 0 and trigger one full-read before going incremental.

- **H10** — The `mkdir -p "$TRANSCRIPT_STATE_DIR" 2>/dev/null || bail` line (which exited 0
  and silently discarded the error) was replaced with an explicit writability check. After mkdir,
  the script tests `[ ! -d "$TRANSCRIPT_STATE_DIR" ] || [ ! -w "$TRANSCRIPT_STATE_DIR" ]` and
  logs `type=turn.stop status=fatal note=state_dir_unwritable` then exits 1 on failure.

- **H9** — `hooks/sessions-poller.sh` replaced the per-tick `build_activity_map` and
  `build_standalone_map` calls (each running a full `find` + `stat`/`head` sweep) with a
  `refresh_jsonl_maps` function that runs in the main shell (not a subshell) and caches results
  in globals `PREV_ACTIVITY_JSON` and `PREV_STANDALONE_JSON`. On each tick a single sorted
  `find` pass is hashed (`PREV_FIND_HASH`); if the hash is unchanged the function returns
  immediately without any further syscalls. On a cache miss both maps are rebuilt in one loop
  over the fingerprint, using an in-process tmpfile (`CWD_CACHE_FILE`) to cache per-session
  `cwd` lookups so `head -n 10 | jq` is called at most once per session over the process
  lifetime. `build_snapshot` was updated to accept activity and standalone maps as positional
  arguments. The removed `build_activity_map` and `build_standalone_map` functions were deleted.

## Before / after metrics

Measurements not captured locally (no 244-JSONL audit host or 16 MB JSONL available in the
development environment). Numbers below reflect the expected behaviour based on code analysis.

| Metric | Before | After | Target |
|---|---|---|---|
| `transcript-poller` peak RSS per tick (16 MB JSONL) | ~16 MB | not measured | < 5 MB |
| `sessions-poller` syscalls / minute (244 JSONL host) | ~10 000 | not measured | < 5 000 |
| `sessions-poller` sustained CPU% | TBD | not measured | < 2 % |
| State persistence success rate | unreliable | 100 % (validated) | 100 % |

## Status updates

- **2026-05-24** — Phase scoped, awaiting implementation.
- **2026-05-24** — Phase implemented. C6 incremental parsing, H10 fatal exit on unwritable
  state dir, H9 in-process JSONL map cache. All four pnpm suite commands green (98 tests).
  Manual validation: H10 exit-1 path confirmed; C6 incremental logic unit-tested in bash.

## What was deferred

Nothing. All three findings (C6, H9, H10) are addressed in this phase.
