# Phase 3 — Backend (Ingest, Bus, SSE)

| Field | Value |
|---|---|
| Phase ID | `phase-3` |
| Status | ⚪ Not Started |
| Depends on | `phase-2` |
| Blocks | `phase-4`, `phase-5` |
| Target outcome | A `curl` POST to `/api/events` reaches every connected `EventSource` subscriber on `/api/stream` within 500 ms |

---

## Overview

Stand up the HUD's server-side pipeline: ingest → bus → fan-out via SSE, plus
durable JSONL logging. Everything lives inside the single Next.js process — no
external services.

## Goals

- Implement `POST /api/events` with bearer-token auth and Zod validation.
- Implement an in-memory ring buffer (the **bus**) bounded to N events.
- Implement `GET /api/stream` as a Server-Sent Events response that emits live
  events and a `: ping` heartbeat every 15 s.
- Append every accepted event to a daily rolling JSONL log.
- Generate the ingest token via `pnpm hud:token`.

## In Scope

- `apps/hud/app/api/events/route.ts` — POST handler.
- `apps/hud/app/api/stream/route.ts` — GET SSE handler.
- `apps/hud/lib/bus.ts` — ring buffer with `publish`, `subscribe`, `snapshot`.
- `apps/hud/lib/sse.ts` — SSE writer helpers (`format`, heartbeat).
- `apps/hud/lib/log.ts` — JSONL append helper with daily rotation.
- `apps/hud/scripts/gen-token.ts` — token generator, wired to `pnpm hud:token`.
- `.env.example` documenting `HUD_INGEST_TOKEN` and `HUD_BUS_SIZE`.

## Out of Scope

- Producing the events. The hook script lands in Phase 4; until then, use
  `curl` for testing.
- The UI subscriber. That lands in Phase 5.
- OpenTelemetry endpoint (`/api/otlp/v1/metrics`). Documented but deferred to a
  sub-task within this phase or punted to v2 if it does not fit.

## Open Decisions

### D-3.1 — Bus size

**Default proposal**: `1000` events. Rationale: a busy 8-hour Claude Code
session produces ~3–5 events/minute average, so 1,000 covers ~4 hours of live
replay on reconnect. Override via `HUD_BUS_SIZE` env var.

### D-3.2 — JSONL rotation strategy

**Default proposal**: one file per UTC day under `data/events-YYYY-MM-DD.jsonl`.
Compression and pruning are punted to a future maintenance phase.

### D-3.3 — Reconnect replay window

**Default proposal**: on reconnect with `Last-Event-ID`, replay events from the
bus that occurred **after** that ID, capped at the bus size. If the requested
ID is older than the oldest in the bus, send the bus snapshot and a
`stream-replay-truncated` notice.

## Deliverables

```
apps/hud/
├── app/api/
│   ├── events/route.ts
│   └── stream/route.ts
├── lib/
│   ├── bus.ts
│   ├── sse.ts
│   └── log.ts
├── scripts/
│   └── gen-token.ts
└── .env.example
```

## Acceptance Criteria

- `curl -X POST http://localhost:3000/api/events -H "Authorization: Bearer $TOKEN" -d @fixture.json`
  returns `204` and the event appears in the JSONL log.
- `curl -N http://localhost:3000/api/stream` opens a stream that emits the
  event within ~50 ms of POST.
- Two parallel `curl -N` subscribers both receive the same event.
- Killing the Next.js process and restarting **keeps the JSONL log intact**;
  the bus is empty on restart (by design).
- Posting with no token or bad token returns `401`.
- Posting a malformed payload returns `400` with a Zod error message.
- A 15-second idle on the stream emits `: ping\n\n`.

## Tasks

1. Implement `bus.ts` with `publish`, `subscribe(callback)`, `snapshot()`,
   `replaySince(id)`. Single producer assumption, no locks needed.
2. Implement `log.ts` with `appendEvent(event)` that opens / rotates the
   day's file lazily.
3. Implement `sse.ts` with a `Response`-builder that writes SSE frames and a
   heartbeat.
4. Implement `POST /api/events`: validate token → parse with Zod → publish →
   log → return 204.
5. Implement `GET /api/stream`: subscribe to bus → write each event as an SSE
   frame → heartbeat every 15 s → cleanup on abort.
6. Implement `gen-token.ts`: print a random 32-byte hex token and write to
   `.env.local` (idempotent).
7. Author an internal `scripts/smoke-stream.sh` that POSTs a fixture and
   `curl`-tails the stream.
8. PR titled `feat(server): ingest, bus, SSE (Phase 3)`.

## Risks

- **Edge runtime incompat**: Next.js App Router defaults can collide with
  long-lived SSE responses. Mitigation: pin the route to the Node runtime.
- **Concurrent JSONL writes** if we ever introduce multi-process workers.
  Mitigation: documented as single-process v1; revisit in v2 if needed.
- **EventSource buffering by proxies**. Mitigation: heartbeat + correct
  `Cache-Control: no-cache` and `X-Accel-Buffering: no`.

## Related

- [`./phase-2-event-contract.md`](./phase-2-event-contract.md) — the schema this phase consumes.
- [`./phase-4-hook-script.md`](./phase-4-hook-script.md) — first non-curl producer.
- [`./phase-5-live-view.md`](./phase-5-live-view.md) — first non-curl consumer.
- [`../architecture.md`](../architecture.md) — full topology.
