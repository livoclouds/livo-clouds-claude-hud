# Phase 4 — Observability & Operations

| | |
|---|---|
| **Severity** | High |
| **Status** | ⏳ Pending |
| **PR** | — |
| **Estimated effort** | ~5 hours |
| **Risk of regression** | Medium — adds new API routes and modifies process lifecycle; graceful shutdown must be tested under load |

---

## Scope

Five operational findings about server visibility, process lifecycle, and
log management.

| Finding | Summary |
|---|---|
| [O1](../findings/operational.md#o1--no-health-or-stats-endpoint) | Add `/api/health` (public) and `/api/internal/stats` (token-gated) |
| [O2](../findings/operational.md#o2--no-graceful-shutdown-sequence) | SIGTERM → `shutdown` SSE event → 5 s drain → exit |
| [O3](../findings/operational.md#o3--log-retention-is-generation-count-only-no-time-based-cleanup) | `HUD_LOG_RETENTION_DAYS` with daily cleanup |
| [O4](../findings/operational.md#o4--poller-stdout-piped-to-parent-process-stdout-unbounded) | Dedicated poller log files with rotation |
| [O7](../findings/operational.md#o7--no-apireadiness-probe-for-container-orchestrators) | `/api/readiness` — 503 before pollers init, 200 after |

---

## New API routes

### `GET /api/health` (no auth)

Response:

```json
{
  "status": "ok",
  "uptime": 3600,
  "rss": 87654321,
  "subscribers": 3,
  "eventsTotal": 12450,
  "lastEventAgo": 2300,
  "diskMb": 42.7
}
```

- `rss`: `process.memoryUsage().rss` in bytes
- `eventsTotal`: cumulative events published to the bus since startup
- `lastEventAgo`: milliseconds since the last event was published (0 if
  none yet)
- `diskMb`: combined size of JSONL log files in `data/`

Designed for uptime checkers (Healthchecks.io, UptimeRobot, curl).

### `GET /api/internal/stats` (bearer token required)

Extended diagnostic payload — exact schema TBD during implementation,
but must include bus fill ratio, backpressure event counts (triggered /
ejected), and per-poller status (last success timestamp, last error).

### `GET /api/readiness`

Returns `503 { "ready": false }` until:
- The event bus singleton is initialised (`bus.capacity() > 0`)
- Both pollers have completed at least one scan cycle
- The `draining` flag is false (not in graceful shutdown)

Returns `200 { "ready": true }` after all conditions are met.

Used as the `readinessProbe` in Kubernetes and `healthcheck:` in
Docker Compose.

---

## Graceful shutdown design

Registered in `apps/hud/instrumentation-node.ts`:

```
SIGTERM received
  → draining = true
  → new ingest POSTs return 503 "draining"
  → emit { event: "shutdown", data: { reason: "server-restart" } } to all SSE subscribers
  → wait up to 5 s for in-flight JSONL writes to flush
  → process.exit(0)
```

The SSE client (`sse-client.ts`) already handles server close gracefully
by reconnecting with `Last-Event-ID`. The `shutdown` event gives clients
an opportunity to log the reason before the connection drops.

---

## Files changed

_(To be filled in after implementation.)_

Key files expected to change:
- `apps/hud/app/api/health/route.ts` (new)
- `apps/hud/app/api/internal/stats/route.ts` (new)
- `apps/hud/app/api/readiness/route.ts` (new)
- `apps/hud/instrumentation-node.ts` — graceful shutdown + `readyAt` tracking + poller log files
- `apps/hud/lib/log.ts` — `HUD_LOG_RETENTION_DAYS` + mtime-based cleanup
- `CLAUDE.md §9` — document new endpoints and env vars

---

## Test plan

```
pnpm -w typecheck
pnpm -w lint
pnpm -w build
```

**Health endpoint:**
```bash
curl -s http://localhost:4000/api/health | jq .
# Expected: { "status": "ok", ... }
```

**Readiness probe:**
```bash
# Immediately after server start (before pollers init):
curl -s -o /dev/null -w '%{http_code}' http://localhost:4000/api/readiness
# Expected: 503

# After ~10 s (pollers should have run):
curl -s -o /dev/null -w '%{http_code}' http://localhost:4000/api/readiness
# Expected: 200
```

**Graceful shutdown:**
1. Open 3 browser tabs at the HUD.
2. `kill -TERM $(pgrep -f next-server)`.
3. Check DevTools → EventStream on each tab — should see a `shutdown` event.
4. Confirm process exits within 10 s.
5. Confirm all tabs show "Reconnecting…" within 2 s.

**Log retention:**
- Set `HUD_LOG_RETENTION_DAYS=0` and confirm old rotated files are deleted
  on next rotation.

---

## Before / after metrics

| Metric | Before | After | Target |
|---|---|---|---|
| Operator visibility into RSS | `ps aux` only | `/api/health` | JSON endpoint |
| Graceful shutdown SSE signal | None (force close) | `shutdown` event | `shutdown` event |
| Thundering herd on restart | All clients reconnect simultaneously | Clients see `shutdown` + staggered reconnect (O8 jitter from Phase 1) | ≤ 2 s spread |
| Log files older than retention window | Accumulate indefinitely | Deleted on rotation | Deleted |
| Health endpoint latency p99 | N/A | < 50 ms | < 50 ms |

---

## Status updates

- **2026-05-24** — Phase scoped, awaiting implementation.

## What was deferred

_(To be filled in after implementation.)_
