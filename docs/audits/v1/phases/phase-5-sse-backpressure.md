# Phase 5 — SSE backpressure

| | |
|---|---|
| **Severity** | High |
| **Status** | ⏳ Pending |
| **PR** | — |
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

## Files expected to change

- `apps/hud/lib/sse.ts` — track `bytesEnqueuedSinceLastDrain` per
  writer; when it exceeds a threshold (suggested: 1 MB) or a
  timer-based grace window (suggested: 30 s of no successful flush)
  is exceeded, close the controller with a custom event so the
  client knows to reconnect.
- `apps/hud/app/api/stream/route.ts` — wire the threshold via env
  (`HUD_SSE_BACKPRESSURE_BYTES`, `HUD_SSE_BACKPRESSURE_GRACE_S`).
- `apps/hud/lib/sse-client.ts` — log explicit message on
  `bp-disconnect` event; honour `Last-Event-ID` on reconnect (already
  implemented; verify).
- `apps/hud/lib/bus.ts` — when the bus unsubscribes via the timeout
  added in Phase 3 (H3), it should also force-close the SSE writer.
  These two pieces interact.

## Test plan

- `pnpm -w typecheck`, `pnpm -w lint`, `pnpm -w build`, `pnpm -w test`
  all green.
- Synthetic test: open an SSE connection that reads at 100 B/s while
  the server publishes 100 KB/s. The server should disconnect
  the slow client within the grace window; RSS on the server should
  not grow past the threshold.
- Manual: open the HUD on the iPad, then lock the iPad for 5
  minutes. On unlock, Safari should reconnect transparently using
  `Last-Event-ID` and the dashboard should reflect the current state
  within 1 s.
- Manual: with 10 simultaneous tabs open, kill and restart the HUD
  server. All 10 should reconnect; the subscriber count should never
  exceed 10 + 10 (transient overlap during reconnect).

## Before / after metrics

Filled in when this phase merges.

| Metric | Before | After | Target |
|---|---|---|---|
| Server RSS with 1 stuck client over 5 min | grows ~10 MB/s | flat | flat |
| Reconnect time after iPad unlock | TBD | TBD | < 2 s |
| Subscribers count during forced reconnect storm (10 clients) | TBD | ≤ 20 | ≤ 20 |

## Status updates

- **2026-05-24** — Phase scoped, awaiting implementation.

## What was deferred

(filled in if any item in scope is split out)
