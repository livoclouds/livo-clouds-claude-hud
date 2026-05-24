# System Architecture

This document is the **at-a-glance** reference for how the HUD fits together.
It is intentionally short. Per-phase documents in [`phases/`](./phases) carry
the detailed contracts.

---

## Topology

```
┌──────────────────────────┐   POST /api/events    ┌─────────────────────────────────────┐
│  SOURCE                  │ ────────────────────► │  HUD (Next.js 16, single process)   │
│  Developer machine       │   bearer-token auth   │                                     │
│                          │                       │   • Zod-validated ingest            │
│  Claude Code             │                       │   • In-memory ring buffer (bus)     │
│  + ~/.claude/settings.   │                       │   • Rolling JSONL log (history)     │
│    json hooks            │                       │   • RSC initial snapshot            │
│  + (optional) OTel       │                       │                                     │
└──────────────────────────┘                       │   GET /api/stream  (SSE)            │
                                                   └─────────────────────────────────────┘
                                                                  ▲   SSE
                                                                  │
                                                          ┌───────────────┐
                                                          │  SINKS        │
                                                          │  • iPad PWA   │
                                                          │  • Pi 5 kiosk │
                                                          │  • Browser    │
                                                          └───────────────┘
```

One Next.js process owns ingest, transport, and UI. No external database in v1.
No WebSocket — SSE is unidirectional (matches the model), survives proxies, and
reconnects automatically.

---

## Data flow

1. The user runs Claude Code on the developer machine.
2. A configured hook fires (e.g. `PostToolUse`), reads the event JSON from
   stdin, and `POST`s a normalized payload to `https://<hud>/api/events` with
   the bearer token.
3. The ingest handler validates the payload against `HudEventSchema` (Zod). On
   failure it returns 400 and logs; on success it:
   - Appends to the in-memory bus.
   - Appends to the day's JSONL log on disk.
   - Notifies all active SSE subscribers.
4. Each client receives the event on `/api/stream`, hydrates its Zustand store,
   and re-renders the affected components. Counters animate with Motion;
   the mascot's state machine reduces over the event log to derive its current
   visible state.
5. If the client reloads, the server re-renders the page with a fresh snapshot
   from the bus (RSC), so the HUD never shows a blank first paint.

---

## Components

### Source

- **Claude Code**: lifecycle hooks defined in `~/.claude/settings.json`.
- **(Optional) OpenTelemetry collector**: when
  `CLAUDE_CODE_ENABLE_TELEMETRY=1` is set, OTLP HTTP metrics flow to
  `/api/otlp/v1/metrics` for richer aggregates.

### Ingest — `POST /api/events`

- Auth: `Authorization: Bearer <HUD_INGEST_TOKEN>`.
- Body: a JSON object matching `HudEventSchema`.
- Behavior: validate → bus append → JSONL append → SSE fan-out.
- Errors: 401 on bad token, 400 on schema failure, 500 on disk error.

### Bus — in-memory ring buffer

- Holds the last **1,000** events (configurable).
- Single producer (the ingest handler), many consumers (each SSE subscriber).
- Lost on process restart by design — the JSONL log is the durable record.

### Stream — `GET /api/stream` (SSE)

- One persistent HTTP response per client, `Content-Type: text/event-stream`.
- Sends `id`, `event`, and `data` per message; the client reconnects via
  `Last-Event-ID` on transient drops.
- A heartbeat `: ping\n\n` flushes every 15 s to keep proxies from closing
  idle connections.

### Client — Next.js HUD UI

- **Initial paint**: React Server Component reads the latest bus snapshot.
- **Live updates**: `EventSource('/api/stream')` subscriber pushes into a
  Zustand store.
- **Mascot**: pure state-derivation from the event log — no imperative animation
  calls.
- **Touch UX**: gestures via `@use-gesture/react`; views swap with Motion
  layout animations.

---

## Why SSE (not WebSocket)

- Traffic is **one-way** (server → client). WS adds bidirectional ceremony we
  don't need.
- SSE reconnects automatically with `Last-Event-ID`; WS needs a custom strategy.
- SSE is a plain HTTP response — proxies, Tailscale, and reverse proxies all
  handle it transparently. WS upgrades sometimes don't.
- One less moving part to monitor.

---

## Persistence

- **In-memory bus** is the hot path; never touched by disk I/O.
- **JSONL rolling log** at `data/events-YYYY-MM-DD.jsonl` is the durable
  record. History views read from here.
- **No SQL database in v1.** Will be revisited if cross-day analytics demand
  range queries; a `better-sqlite3` migration path is the documented
  fallback.

---

## Auth model

- A single **ingest token** is generated at install time via `pnpm hud:token`
  and stored in `.env.local` (gitignored).
- Every hook POST must include `Authorization: Bearer <token>`.
- Clients do **not** authenticate — the HUD assumes a trusted LAN or Tailscale
  network. Multi-user is out of scope for v1.

---

## Network model

- The HUD binds to `0.0.0.0:4000` by default on the developer machine.
- Clients on the same LAN reach it via `http://<host>.local:4000`.
- Off-LAN access is documented through **Tailscale** — no public ingress
  endpoint is exposed.

---

## Performance budgets

These are the **non-negotiable** targets from [`CLAUDE.md §11`](../../CLAUDE.md):

| Budget | Target |
|---|---|
| First paint on iPad (2021) over LAN | < 1.5 s |
| Event ingest → screen update | < 500 ms p95 |
| Mascot animation framerate | 60 fps on iPad 2021 |
| Client memory after 24 h continuous session | < 150 MB RSS |
