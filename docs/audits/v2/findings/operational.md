# Operational findings (O1 – O14)

Fourteen findings about operational readiness, contract robustness, and
build hygiene. Three findings (O6, O8, O9, O10) are items deferred from
v1 that were not implemented in their original phases.

Findings in this file are frozen as of 2026-05-24. Fixes are tracked in
[Phase 4](../phases/phase-4-observability.md) (O1–O4, O7) and
[Phase 5](../phases/phase-5-hardening.md) (O5, O11–O14).
Deferred v1 items (O6, O8, O9, O10) are addressed in
[Phase 1](../phases/phase-1-code-correctness.md).

---

## O1 — No health or stats endpoint

| | |
|---|---|
| **Severity** | High |
| **Location** | Missing — no `/api/health` or `/api/internal/stats` |
| **Phase** | [Phase 4](../phases/phase-4-observability.md) |

**Symptom.** The HUD has no first-class observability surface. There is no
way to programmatically check:

- Whether the server is alive and handling requests
- Current RSS (memory usage)
- Active SSE subscriber count (early warning for zombie buildup before the
  60 s sweep fires)
- Events ingested per second
- JSONL log size and rotation state
- Poller health (last successful POST, last error)
- SSE backpressure ejection count

Without this endpoint, a Raspberry Pi or container deployment relies on
`ps` output to detect memory leaks and log tailing to detect failures.
Monitoring tools (uptime checks, Grafana, Healthchecks.io) have no API
to query.

**Fix.** Add two endpoints:

- `GET /api/health` (no auth): returns `{ status: "ok", uptime, rss,
  subscribers, eventsTotal, lastEventAgo, diskMb }`. Designed for
  uptime checkers.
- `GET /api/internal/stats` (bearer token required): full diagnostic
  payload including bus capacity, backpressure event count, poller
  status per poller key, log file sizes. Designed for operator
  investigation.

---

## O2 — No graceful shutdown sequence

| | |
|---|---|
| **Severity** | High |
| **Location** | `apps/hud/instrumentation-node.ts` — process lifecycle |
| **Phase** | [Phase 4](../phases/phase-4-observability.md) |

**Symptom.** On SIGTERM (container stop, `pm2 reload`, Kubernetes pod
eviction), the Node process exits without:

1. Signalling SSE clients that the server is going down (clients
   immediately enter rapid reconnect backoff).
2. Draining the JSONL write queue (partially-written log lines are
   possible if a write is in-flight).
3. Stopping the ingest endpoint gracefully (new POSTs can arrive during
   the shutdown window and be dropped silently).

The result: all connected clients enter aggressive reconnect storms
simultaneously — a thundering herd that can overwhelm the newly-started
process if restarts are fast (e.g., `pm2 reload`).

**Fix.** Register a `process.on('SIGTERM')` handler in `instrumentation-node.ts`:

1. Set a `draining = true` module flag. The ingest endpoint returns
   `503 Service Unavailable` when `draining` is true.
2. Emit `{ event: 'shutdown', data: { reason: 'server-restart' } }` to
   all active SSE subscribers so clients can log the disconnect reason.
3. Wait up to 5 s for in-flight JSONL writes to complete.
4. Call `process.exit(0)`.

---

## O3 — Log retention is generation-count-only; no time-based cleanup

| | |
|---|---|
| **Severity** | Medium |
| **Location** | `apps/hud/lib/log.ts` — JSONL rotation logic |
| **Phase** | [Phase 4](../phases/phase-4-observability.md) |

**Symptom.** Phase 1 fixed unbounded log growth with size-based rotation
(100 MB ceiling, 3 rotated generations). However, the retention policy is
purely generation-based: only 3 files are kept. On a high-traffic day
(thousands of tool invocations), each 100 MB file can fill within hours.
Over a 30-day session: 3 rotations × 100 MB = 300 MB on disk at all times.
A Raspberry Pi 5 with a 32 GB SD card has ~20 GB usable; at 300 MB/day
the card fills in under 3 months with no warning. Additionally, old files
are never deleted; if the HUD is stopped for weeks and restarted, stale
rotated files accumulate indefinitely.

**Fix.** Add `HUD_LOG_RETENTION_DAYS` (default 7). During each rotation
cycle, delete `.N` rotated files whose mtime is older than the retention
window. Document in `.env.example` and CLAUDE.md §9 with a note about
SD card lifespans.

---

## O4 — Poller stdout piped to parent process stdout, unbounded

| | |
|---|---|
| **Severity** | Medium |
| **Location** | `apps/hud/instrumentation-node.ts` — poller `stdio: ['ignore', 'pipe', 'pipe']` |
| **Phase** | [Phase 4](../phases/phase-4-observability.md) |

**Symptom.** Both pollers (sessions and transcript) pipe their stdout and
stderr to the parent Next.js process's stdout via listeners on
`child.stdout` and `child.stderr`. In development this is convenient
(poller logs visible in the same terminal). In production (stdout
redirected to a file by systemd, pm2, or Docker), poller output pollutes
the structured application log with unstructured shell script output.
There is no size limit on this output; a misbehaving poller could flood
the log at thousands of lines per second.

**Fix.** Redirect poller stdout/stderr to dedicated log files:
`logs/poller-sessions.log` and `logs/poller-transcript.log`. Apply 10 MB
/ 3-generation rotation to each. Gate poller stdout passthrough behind an
`HUD_ENABLE_POLLER_LOG_PASSTHROUGH=1` env var (useful for debugging).

---

## O5 — No bundle size tracking or CI gate

| | |
|---|---|
| **Severity** | Medium |
| **Location** | Build pipeline — `.github/workflows/` (missing step) |
| **Phase** | [Phase 5](../phases/phase-5-hardening.md) |

**Symptom.** The five v1 phases added Framer Motion (`motion@^12`, ~47 KB
gzipped), `@tanstack/react-virtual`, and other client-side dependencies
without any CI check on the total client JS bundle size. There is no
visibility into the current gzipped size or when a PR would cause a
regression. CLAUDE.md §11 sets a first-paint target of < 1.5 s on iPad
over LAN but does not set a bundle size target.

**Fix.** Add a CI step after `pnpm --filter hud build` that lists the
top chunks by gzipped size and fails if any chunk exceeds 150 KB or the
total exceeds 250 KB. Add `@next/bundle-analyzer` as a dev dependency for
local analysis. Document the bundle target in CLAUDE.md §11.

---

## O6 — H7 (localStorage writes not debounced) still outstanding from v1

| | |
|---|---|
| **Severity** | Medium |
| **Location** | `apps/hud/lib/store.ts` — theme and pin persistence |
| **Phase** | [Phase 1](../phases/phase-1-code-correctness.md) |
| **v1 reference** | [H7 — localStorage writes synchronous on the hot event path](../../v1/findings/high.md#h7--localstorage-writes-are-synchronous-on-the-hot-event-path) |

**Symptom.** Zustand store writes to `localStorage` synchronously on every
state mutation that touches pinned agent IDs or theme preference. During
a high-event-rate period (e.g., Claude Code running many file edits), state
mutations fire dozens of times per second. Each `localStorage.setItem`
blocks the JS thread for ~0.5–2 ms. On older iPads (A12 chip and below),
this is enough to cause frame drops and jank during mascot animations.

**Fix.** Wrap `localStorage.setItem` calls in a `debounce(fn, 300)` so
storage writes are coalesced to at most one per 300 ms. Use
`requestIdleCallback` as a secondary fallback.

---

## O7 — No `/api/readiness` probe for container orchestrators

| | |
|---|---|
| **Severity** | Medium |
| **Location** | Missing — no readiness endpoint |
| **Phase** | [Phase 4](../phases/phase-4-observability.md) |

**Symptom.** The HUD has no `/api/readiness` or `/api/startup` endpoint.
When deployed in Docker Compose with a `healthcheck:` directive, or in
Kubernetes with a `readinessProbe:`, the orchestrator has no way to
distinguish "process started, Next.js not yet ready" from "Next.js ready,
pollers initialised". Without this, traffic can be routed to the HUD
before the pollers have performed their first sessions scan, causing
clients to receive an empty sessions list for up to one poll interval
(default 10 s).

**Fix.** Add `GET /api/readiness`: returns 503 until both pollers have
completed at least one cycle and the event bus is initialised; returns 200
thereafter. The `instrumentation-node.ts` module can set a `readyAt`
timestamp that this endpoint checks.

---

## O8 — L1 (SSE reconnect backoff no jitter) still outstanding from v1

| | |
|---|---|
| **Severity** | Low |
| **Location** | `apps/hud/lib/sse-client.ts` — exponential backoff |
| **Phase** | [Phase 1](../phases/phase-1-code-correctness.md) |
| **v1 reference** | [L1 — SSE backoff has no jitter](../../v1/findings/medium-low.md#l1--sse-reconnect-backoff-has-no-jitter) |

**Symptom.** The SSE client uses pure exponential backoff (`BACKOFF_BASE_MS
* 2^n`). With multiple concurrent clients (e.g., 5 browser tabs on the
same iPad), all clients disconnect at the same instant (e.g., server
restart) and reconnect at the same time, causing a reconnect storm that
briefly saturates the server's connection-accept loop.

**Fix.** Apply ±30% jitter: `delay = backoff * (0.85 + Math.random() * 0.3)`.

---

## O9 — M1 (reducer copies agents Map on every event) still outstanding from v1

| | |
|---|---|
| **Severity** | Low |
| **Location** | `apps/hud/lib/store.ts` — agents reducer |
| **Phase** | [Phase 1](../phases/phase-1-code-correctness.md) |
| **v1 reference** | [M1 — agent reducer spreads the agents map](../../v1/findings/medium-low.md#m1--agent-reducer-spreads-the-agents-map) |

**Symptom.** The agents reducer updates agent state with
`{ ...state.agents, [id]: agent }`. This creates a new plain object by
copying all existing key-value pairs on every `PostToolUse` event.
With 20 active agents, this allocates a 20-entry object on every event.
During heavy Claude Code sessions (hundreds of events per minute), this
contributes to GC pressure on older iPads.

**Fix.** Use a `Map<string, Agent>` or update the agents object in place
with `immer`, avoiding the full spread allocation.

---

## O10 — M2 (appendRecent allocates array on every event) still outstanding from v1

| | |
|---|---|
| **Severity** | Low |
| **Location** | `apps/hud/lib/store.ts` — recent events buffer |
| **Phase** | [Phase 1](../phases/phase-1-code-correctness.md) |
| **v1 reference** | [M2 — appendRecent allocates a new array on every event](../../v1/findings/medium-low.md#m2--appendrecent-allocates-a-new-array-on-every-event) |

**Symptom.** `recentEvents.slice(-(RECENT_CAP - 1))` allocates a new array
on every inbound event (capped at `RECENT_CAP` entries). Over a 24 h
session with thousands of events, this generates a large number of
short-lived array allocations.

**Fix.** Use in-place `splice` or a ring-buffer approach:
`if (events.length >= CAP) events.shift(); events.push(newEvent)`.
This modifies the existing array rather than allocating a new one.

---

## O11 — `agentColor` field accepts any non-empty string

| | |
|---|---|
| **Severity** | Low |
| **Location** | `packages/contracts/src/event.ts` — `agentColor` field |
| **Phase** | [Phase 5](../phases/phase-5-hardening.md) |

**Symptom.** `agentColor: z.string().min(1).optional()`. Any non-empty
string passes validation. A hook emitting `agentColor: "not-a-valid-css-color"`
would store the invalid value, which the HUD applies to CSS properties.
In a browser, an invalid CSS color is silently treated as `initial`; in
a renderer that validates CSS (e.g., a future native app), it could cause
a crash or display glitch.

**Fix.** Tighten to a regex or enum:
`z.string().regex(/^(#[0-9a-fA-F]{3,8}|[a-z]+)$/).optional()`.
Or define a `COLOR_NAMES` enum derived from the agent card colour palette.

---

## O12 — `ts` field not documented as milliseconds; no minimum epoch bound

| | |
|---|---|
| **Severity** | Low |
| **Location** | `packages/contracts/src/event.ts` — `ts` field |
| **Phase** | [Phase 5](../phases/phase-5-hardening.md) |

**Symptom.** `ts: z.number().int().nonnegative()`. The schema accepts any
non-negative integer. A hook incorrectly emitting Unix seconds (e.g.,
`ts: 1716508800`) instead of milliseconds (e.g., `ts: 1716508800000`)
passes validation. The HUD renders a timestamp from 2024 as if it were
from 1974, causing bizarre time displays and cost calculations that depend
on `Date.now() - event.ts`.

**Fix.** Add a comment: `// unix epoch milliseconds (Date.now())`. Add a
minimum bound: `z.number().int().min(1_609_459_200_000)` (2021-01-01 00:00
UTC — earlier than the oldest plausible HUD deployment). This rejects
second-precision timestamps with a clear validation error.

---

## O13 — No troubleshooting guide

| | |
|---|---|
| **Severity** | Low |
| **Location** | Documentation — missing `TROUBLESHOOTING.md` |
| **Phase** | [Phase 5](../phases/phase-5-hardening.md) |

**Symptom.** Operators encountering problems have no structured guide. The
following scenarios have no documented diagnostic path:

- Pollers not starting (only a `console.warn` in the server log)
- SSE client in a rapid reconnect loop (could be auth, CORS, or backpressure)
- JSONL log filling the disk (silent until writes fail — see I3)
- SSE backpressure ejections (only logged server-side at `console.warn` level)
- Bearer token mismatch (403 from the ingest endpoint, not visible in the HUD)

**Fix.** Create `TROUBLESHOOTING.md` at the repo root with sections for
each scenario, including: which log file to check, the relevant env vars,
expected log messages, and resolution steps.

---

## O14 — `.env.example` missing several documented env vars

| | |
|---|---|
| **Severity** | Low |
| **Location** | `apps/hud/.env.example` |
| **Phase** | [Phase 5](../phases/phase-5-hardening.md) |

**Symptom.** The following env vars exist in code but are absent from
`.env.example`, meaning operators who set up the HUD by copying the
example file have no visibility into them:

- `HUD_LOG_MAX_SIZE_MB` (Phase 1, controls JSONL rotation ceiling)
- `HUD_DISABLE_POLLER` (skips sessions poller startup)
- `HUD_DISABLE_TRANSCRIPT_POLLER` (skips transcript poller startup)
- `HUD_BUS_SIZE` (ring buffer capacity; default 1000)

**Fix.** Add all four to `.env.example` as commented-out entries with a
one-line explanation and their default values. Add a "Tuning notes" comment
block explaining when each should be changed.
