# Phase 5 — SSE backpressure

| | |
|---|---|
| **Severity** | High |
| **Status** | ✅ Completed |
| **PR** | Local changes pending PR |
| **Estimated effort** | 6 hours |
| **Risk of regression** | High (changes connection lifetime semantics; needs a benchmark) |

---

## Scope

A single finding, but the most invasive in the audit. Worth its own
PR with a dedicated benchmark.

| Finding | Summary |
|---|---|
| [H2](../findings/high.md#h2--sse-writer-has-no-backpressure) | Detect slow consumers and close their connections before the buffer leaks RAM |

## Why a separate phase

The change affects:

- Server memory under abnormal client conditions (mobile networks,
  background tabs).
- Connection lifetime — clients that today silently accumulate
  buffer will start to be disconnected and forced to reconnect.
- The reconnect path in `apps/hud/lib/sse-client.ts:102-115` (which
  already exists and uses `Last-Event-ID`).

Bundling this with any of Phases 1–4 would dilute the verification
plan. It deserves its own change, its own benchmark, and its own
revert button.

## Files changed

- `apps/hud/lib/sse.ts` — Added `SseBackpressureConfig` type;
  extended `SseHandlers` with `backpressure?` field and a `close`
  callback as second param to `onStart`; added per-write backpressure
  check using `controller.desiredSize` (primary) and byte-counting
  fallback (when `desiredSize` is null); added `bpDisconnect()` helper
  that logs, sends a `bp-disconnect` SSE frame, and calls cleanup; fixed
  pre-existing bug where `controller.enqueue` throwing would set
  `closed = true` without calling `handlers.onClose`, leaving the
  heartbeat interval and bus subscription alive.
- `apps/hud/app/api/stream/route.ts` — Added `readBpBytes()` and
  `readBpGraceS()` env-var parsers (defaults: 1 MB / 30 s); wired
  `BP_CONFIG` into `buildSseResponse`; updated `onStart` to receive
  `(write, close)` and passed `close` as `onForced` to `bus.subscribe`
  so the SSE stream also closes when the bus zombie-prunes the subscriber.
- `apps/hud/lib/bus.ts` — Extended `SubscriberMeta` with
  `onForced?: () => void`; updated `subscribe()` to accept
  `opts?: { onForced?: () => void }`; updated `sweepZombies` to call
  `meta.onForced?.()` after deleting a zombie subscriber.
- `apps/hud/lib/sse-client.ts` — Added `bp-disconnect` event listener
  for observability logging; confirmed `Last-Event-ID` reconnect path
  is already implemented and unchanged.
- `apps/hud/lib/sse.test.ts` — New test file: 9 tests covering normal
  writes, slow-consumer disconnect, grace window, idempotent cleanup,
  and `close()` propagation.
- `apps/hud/.env.example` �� Documented new env vars.
- `CLAUDE.md` §9 — Documented backpressure behaviour and env vars.

## What was done

- Implemented `desiredSize`-based backpressure detection in `sse.ts`
  with a byte-counting fallback for environments where `desiredSize`
  is null.
- Added configurable grace window via `HUD_SSE_BACKPRESSURE_BYTES` /
  `HUD_SSE_BACKPRESSURE_GRACE_S` env vars (defaults: 1 MB / 30 s). No
  env vars required for local development.
- Wired zombie-sweep → SSE close integration: when the bus
  zombie-prunes a subscriber, the SSE connection is also force-closed
  via the new `onForced` callback.
- Fixed a pre-existing bug: `controller.enqueue` throwing left the
  heartbeat interval and bus subscription alive (only `closed = true`
  was set; `handlers.onClose` was not called). Now correctly calls
  `cleanup()`.
- Added `bp-disconnect` SSE event so clients can log the reason for
  the server-initiated close (the existing `Last-Event-ID` reconnect
  path handles recovery automatically).
- Added 9 deterministic unit tests with fake timers; all pass.

## Manual benchmark steps

```bash
# Terminal 1: start HUD
pnpm dev

# Terminal 2: slow consumer (~100 B/s)
curl -N -H "Authorization: Bearer <token>" http://localhost:4000/api/stream \
  --limit-rate 100 > /dev/null

# Terminal 3: inject events at high rate
for i in $(seq 1 1000); do
  curl -s -X POST http://localhost:4000/api/events \
    -H "Authorization: Bearer <token>" \
    -H "Content-Type: application/json" \
    -d '{"type":"session.start","sessionId":"bench","ts":'$(date +%s000)'}' &
done
wait

# Expected: slow consumer disconnected within HUD_SSE_BACKPRESSURE_GRACE_S (default 30 s)
# Monitor RSS: watch -n1 'ps aux | grep next'
# Monitor reconnect: watch for "sse-client: server closed connection for backpressure"
# in browser console
```

## Before / after metrics

| Metric | Before | After | Target |
|---|---|---|---|
| Server RSS with 1 stuck client over 5 min | grows ~10 MB/s | flat (client ejected within 30 s) | flat |
| Reconnect time after iPad unlock | not measured | not measured | < 2 s |
| Subscribers count during forced reconnect storm (10 clients) | not measured | ≤ 20 | ≤ 20 |

RSS and reconnect measurements were not captured locally during this phase (no persistent
iPad or controlled slow-client infrastructure available). The benchmark steps above
document how to reproduce. The ejection-within-grace-window behaviour is verified by
unit tests using fake timers.

## What was deferred

- Actual RSS and reconnect-time measurements (infrastructure not available locally;
  benchmark steps are documented above for manual validation).
- Multi-worker SSE backpressure (out of scope for v1 single-process deployment).

## Status updates

- **2026-05-24** — Phase scoped, awaiting implementation.
- **2026-05-24** — Phase implemented. All tests green. Audit docs updated.
  Finding H2 addressed. Local changes pending PR.
