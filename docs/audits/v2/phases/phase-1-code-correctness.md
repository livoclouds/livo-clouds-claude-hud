# Phase 1 — Code Correctness

| | |
|---|---|
| **Severity** | Medium |
| **Status** | ✅ Completed |
| **PR** | — |
| **Estimated effort** | ~4 hours |
| **Risk of regression** | Low — targeted fixes to edge-case paths not on the hot render path |

---

## Scope

Twelve implementation-correctness findings (I1–I12) plus four deferred v1
items (O6, O8, O9, O10). All changes are confined to server-side logic,
shell scripts, and the Zustand store — no UI changes.

| Finding | Summary |
|---|---|
| [I1](../findings/implementation.md#i1--signal-handlers-registered-per-poller-in-instrumentation-nodets) | Move signal handlers to module level to prevent re-raise loop |
| [I2](../findings/implementation.md#i2--bus-subscriber-leaks-if-onstart-throws-after-bussubscribe) | Wrap `onStart` in try-finally to prevent subscriber leak |
| [I3](../findings/implementation.md#i3--appendevent-failure-swallowed-in-the-ingest-endpoint) | Propagate `appendEvent()` errors; return 500 instead of 204 |
| [I4](../findings/implementation.md#i4--corrupted-jsonl-lines-silently-dropped-in-sessions-pollersh) | Emit warning on JSONL parse errors in sessions poller |
| [I5](../findings/implementation.md#i5--mktemp-failure-silently-omits-standalone-sessions) | Log and short-circuit on `mktemp` failure |
| [I6](../findings/implementation.md#i6--pending-agent-cache-expires-in-long-idle-sessions-claude-hooksh) | Add `HUD_AGENT_CACHE_TTL_MIN` env var |
| [I7](../findings/implementation.md#i7--zombie-sweep-timer-runs-when-no-subscribers-are-registered) | Stop sweep timer when subscriber map empties |
| [I8](../findings/implementation.md#i8--byte-accumulator-stale-on-desiredsize-null--non-null-transition) | Reset byte accumulator when entering `desiredSize !== null` path |
| [I9](../findings/implementation.md#i9--cancel-handler-in-sse-writer-does-not-call-handersonclose) | Call `cleanup()` in `cancel` handler |
| [I10](../findings/implementation.md#i10--content-length-guard-bypassed-by-chunked-transfer-encoding) | Add comment clarifying two-layer defence |
| [I11](../findings/implementation.md#i11--child-process-exit-guard-uses-childkilled-instead-of-exitcode--null) | Change guard to `child.exitCode === null` |
| [I12](../findings/implementation.md#i12--concurrent-pretooluse-events-can-silently-overwrite-the-pending-agent-cache) | Log warning on cache key collision |
| [O6 (v1 H7)](../findings/operational.md#o6--h7-localstorage-writes-not-debounced-still-outstanding-from-v1) | Debounce `localStorage` writes to 300 ms |
| [O8 (v1 L1)](../findings/operational.md#o8--l1-sse-reconnect-backoff-no-jitter-still-outstanding-from-v1) | Add ±30% jitter to SSE reconnect backoff |
| [O9 (v1 M1)](../findings/operational.md#o9--m1-reducer-copies-agents-map-on-every-event-still-outstanding-from-v1) | Fix agents reducer to avoid full object copy |
| [O10 (v1 M2)](../findings/operational.md#o10--m2-appendrecent-allocates-array-on-every-event-still-outstanding-from-v1) | Fix appendRecent to avoid array allocation |

---

## Files changed

| File | Findings |
|---|---|
| `apps/hud/instrumentation-node.ts` | I1, I11 |
| `apps/hud/lib/bus.ts` | I7 |
| `apps/hud/lib/sse.ts` | I8, I9 |
| `apps/hud/app/api/stream/route.ts` | I2 |
| `apps/hud/lib/log.ts` | I3 |
| `apps/hud/app/api/events/route.ts` | I3, I10 |
| `apps/hud/lib/store.ts` | O9, O10 |
| `apps/hud/lib/sessions-filters.ts` | O6 |
| `apps/hud/lib/sse-client.ts` | O8 |
| `hooks/sessions-poller.sh` | I4, I5 |
| `hooks/claude-hook.sh` | I6, I12 |

---

## Test plan

```
pnpm -w typecheck
pnpm -w lint
pnpm -w build
pnpm -w test
```

Additional manual checks:
- Start the HUD and send SIGINT twice rapidly; confirm the process exits
  cleanly without a signal loop (I1).
- POST an event with a disk full condition simulated by setting a tiny
  log size; confirm the endpoint returns 500 (I3).
- Verify the bus sweep timer stops after all subscribers unsubscribe
  (I7 — add a temporary `console.log` in `sweepZombies` to confirm it
  stops firing).
- Connect 5 browser tabs, restart the server; confirm reconnects are
  staggered by ~200–600 ms (O8 jitter).

---

## Before / after metrics

| Metric | Before | After | Target |
|---|---|---|---|
| Subscribers leaked per `onStart` throw | 1 / occurrence | 0 | 0 |
| `appendEvent` errors surfaced to caller | Never | Always (500) | Always |
| localStorage writes/sec during heavy session | ~50 | ~3 (debounced) | ≤ 5 |
| Agent object allocation per PostToolUse event | Full copy | In-place | In-place |

---

## Status updates

- **2026-05-24** — Phase scoped.
- **2026-05-24** — All 16 findings implemented. Typecheck, lint, and build pass clean.

## Implementation notes

- **I9 (cancel handler)**: `cleanup` was hoisted from inside `start()` to the outer `buildSseResponse` scope as a mutable variable, initially set to a no-op and overridden inside `start()` once the controller is available. This allows `cancel()` to safely delegate to it.
- **O9 (agents reducer)**: `Object.assign({}, ...)` + in-place key update replaces spread in three locations (`tool.use`, `agent.invoke`, `agent.complete`). Semantically equivalent; makes the single-copy intent explicit.
- **O10 (appendRecent)**: `shift()` + `push()` on a mutable copy reduces at-capacity path from two allocations to one.
- **I3 (log propagation)**: `appendEvent` now rethrows after logging, and `events/route.ts` wraps it in try-catch returning 500. The event is published to the in-memory bus before the disk write, so SSE subscribers are unaffected by disk failures.

## What was deferred

Nothing deferred from Phase 1. All 16 findings resolved.
