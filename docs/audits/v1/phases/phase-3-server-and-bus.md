# Phase 3 — Server & bus

| | |
|---|---|
| **Severity** | High |
| **Status** | ⏳ Pending |
| **PR** | — |
| **Estimated effort** | 5 hours |
| **Risk of regression** | Low (bus internals; covered by store + event tests) |

---

## Scope

Two findings about the event bus and one about the SSE replay path.
All three are internal optimisations with no behavioural change
visible to clients beyond faster reconnects.

| Finding | Summary |
|---|---|
| [H1](../findings/high.md#h1--busreplaysince-is-on-per-reconnect) | O(1) `replaySince` via parallel index map |
| [H3](../findings/high.md#h3--zombie-subscribers-can-leak) | Subscriber liveness tracking and pruning |
| [H6](../findings/high.md#h6--initial-bus-snapshot-serializes-up-to-1000-events-into-the-ssr-html) | `snapshot(limit)` (also referenced by Phase 2; whichever phase ships first owns it) |

> If Phase 2 merges first and lands H6, this phase becomes a two-finding
> phase.

## Files expected to change

- `apps/hud/lib/bus.ts` — add `idIndex: Map<string, number>` updated
  in `publish()`; rewrite `replaySince` to use it.
- `apps/hud/lib/bus.ts` — add `lastDeliveryTs` to subscriber records;
  add a private sweep timer that prunes zombies every 60 s; log
  warning above 50 subscribers.
- `apps/hud/lib/bus.test.ts` (new or extended) — cover the new code
  paths: index map invariants under wrap-around, replay correctness
  with and without `lastId`, zombie sweep.

## Test plan

- `pnpm -w typecheck`, `pnpm -w lint`, `pnpm -w build`, `pnpm -w test`
  all green; new test cases in `bus.test.ts` exercise the index map
  and the zombie sweep.
- Synthetic load test: publish 10 000 events to a warm bus, simulate
  10 clients reconnecting with various `lastId` values, confirm
  replay correctness and measure latency. Pre-fix should show
  > 50 ms p95; post-fix should be < 5 ms.
- Manual: open four browser tabs against the HUD, kill the server,
  restart it. All four should reconnect within the backoff window
  and reduce their UI from the same snapshot.

## Before / after metrics

Filled in when this phase merges.

| Metric | Before | After | Target |
|---|---|---|---|
| `replaySince` p95 (bus = 1 000, 10 clients) | TBD | TBD | < 5 ms |
| Subscribers count after a 24 h client churn test | TBD | flat | flat |
| Bus snapshot allocation per SSE reconnect | ~1 000 envelopes | ≤ N new events | ≤ N |

## Status updates

- **2026-05-24** — Phase scoped, awaiting implementation.

## What was deferred

(filled in if any item in scope is split out)
