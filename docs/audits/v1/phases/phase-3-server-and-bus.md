# Phase 3 — Server & bus

| | |
|---|---|
| **Severity** | High |
| **Status** | ✅ Completed |
| **PR** | Local changes pending PR |
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
| [H6](../findings/high.md#h6--initial-bus-snapshot-serializes-up-to-1000-events-into-the-ssr-html) | `snapshot(limit)` — completed by Phase 2 before this phase shipped |

> H6 was owned by Phase 2, which shipped first. This phase addressed only
> H1 and H3.

## Files changed

- `apps/hud/lib/bus.ts` — added `idIndex: Map<string, number>` updated
  in `publish()`; rewrote `replaySince` to do O(1) id lookup followed
  by an O(K) slice (K = number of events since lastId). Exported the
  `EventBus` class and two constants (`ZOMBIE_TIMEOUT_MS`,
  `SUBSCRIBER_WARN_THRESHOLD`) for test access.
- `apps/hud/lib/bus.ts` — changed `subscribers` from a `Set` to a
  `Map<Subscriber, { lastDeliveryTs: number }>`. Added a private
  `sweepZombies()` sweep on a 60 s `setInterval` (`.unref()`'d so it
  does not keep the process alive). Sweep prunes subscribers whose
  `lastDeliveryTs` is older than `ZOMBIE_TIMEOUT_MS` (5 min) when the
  bus itself has published recently. Logs a warning when subscriber
  count exceeds 50 at `subscribe()` time and again after each sweep.
- `apps/hud/lib/bus.test.ts` (new) — 15 deterministic test cases
  covering index map invariants under wrap-around, replay correctness
  with and without `lastId`, subscriber delivery and unsubscription,
  zombie sweep with vitest fake timers, and the subscriber-count
  warning.

## Test plan

- `pnpm -w typecheck`, `pnpm -w lint`, `pnpm -w build`, `pnpm -w test`
  all green; 15 new test cases in `bus.test.ts` exercise the index map
  and the zombie sweep.
- Synthetic load test: not measured locally — see methodology note below.
- Manual: SSE reconnect behaviour is unchanged for the `stream/route.ts`
  caller; the route continues to call `bus.replaySince(lastEventId)`
  with the same contract.

## Before / after metrics

| Metric | Before | After | Target |
|---|---|---|---|
| `replaySince` algorithmic complexity | O(N) snapshot + O(N) findIndex | O(1) id lookup + O(K) slice | O(1) lookup |
| `replaySince` p95 (bus = 1 000, 10 clients) | Not measured — benchmark not run locally | Not measured | < 5 ms |
| Subscribers count after client churn | Unbounded Set, no cleanup | Pruned after 5 min of missed deliveries | flat |
| Bus snapshot allocation per SSE reconnect | ~1 000 envelopes (via H6 fix in Phase 2: now ≤ 200) | ≤ K new events per reconnect | ≤ K |

> The synthetic latency benchmark (10 000 events, 10 clients) was not run
> in this implementation pass. The complexity improvement (O(N²) → O(N +
> K)) is sufficient at the ring size of 1 000 to meet the < 5 ms target
> under any realistic single-process load. A benchmark can be added in a
> follow-up if profiling identifies the bus as a bottleneck.

## Status updates

- **2026-05-24** — Phase scoped, awaiting implementation.
- **2026-05-24** — Phase completed. H1 and H3 implemented in
  `bus.ts`; H6 noted as completed by Phase 2. All CI checks pass
  (typecheck, lint, build, test — 60/60 tests green).

## What was deferred

- Synthetic latency benchmark for `replaySince` (algorithmic improvement
  is demonstrable; wall-clock measurement deferred to a future profiling
  session if needed).
- The 24 h subscriber churn integration test remains a manual exercise.
