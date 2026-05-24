# Medium and low findings (M1 – M7, L1 – L4)

These are quality and operational findings. None breaks a budget or
warrants its own PR. They are recorded for future reference and may
be picked up opportunistically alongside the critical / high work.

Findings in this file are frozen as of 2026-05-24.

---

## Medium

### M1 — Reducer spreads the agents map on every `tool.use`

**Location.** `apps/hud/lib/store.ts:281-284`

When a tool fires while an agent is the active owner, the reducer
copies the entire `agents` map even though only one entry changed.
With many agents recorded, this is wasted work.

**Suggested fix.** Update the agent's `toolCalls` in place under
`Object.assign(state.agents[owner], { toolCalls: calls })` after a
shallow clone of just the changed agent.

---

### M2 — `appendRecent` always allocates a new array

**Location.** `apps/hud/lib/store.ts:145-149`

Spreading the whole array creates O(N) garbage per event. With
`RECENT_EVENTS_CAP = 16` this is marginal but unnecessary.

**Suggested fix.** Use `recent.slice(1).concat([envelope])` when the
buffer is full; plain `[...recent, envelope]` while growing.

---

### M3 — Zod parses every ingested event in the hot path

**Location.** `apps/hud/app/api/events/route.ts:54` and
`apps/hud/lib/sse-client.ts:33`

Zod is correct but not the fastest parser. At sustained > 50 events/s
with 78-session snapshots, this could be a future bottleneck.

**Suggested fix.** Benchmark first. If validation time is below the
budget, leave it. If not, hand-write fast parsers for the two hottest
types (`tool.use`, `turn.stop`) and keep Zod for everything else.

---

### M4 — `pricingFor` scans the model list linearly

**Location.** `packages/contracts/src/pricing.ts:18-27`

Three models today, trivial. Will not scale to 20+ models.

**Suggested fix.** Convert the JSON file to a `Map` precomputed at
build time. Only worth doing once the model list grows.

---

### M5 — `claude-hook.sh` re-reads the env file on every invocation

**Location.** `hooks/claude-hook.sh:56-67`

Each hook fires a fresh shell that re-reads
`~/.claude/livo-clouds-hud.env`. Inevitable for independent
invocations; documented here so future readers do not "fix" it.

---

### M6 — Curl timeout of 250 ms produces visible `hud_unreachable` log lines

**Location.** `hooks/claude-hook.sh:65, 303-311`

When the HUD is offline, each hook waits 250 ms then logs
`status=error note=hud_unreachable`. The behaviour is correct (don't
block Claude Code) but the log churn is noticeable.

**Suggested fix.** Document the behaviour. Optionally, suppress the
log entry after the first failure in a window and replay a single
summary line every minute.

---

### M7 — `sessions-bootstrap.ts` uses `readFileSync` during SSR

**Location.** `apps/hud/lib/sessions-bootstrap.ts:40-52`

The per-process one-shot flag mitigates the cost, but a slow
filesystem could push the first SSR latency. Acceptable today; move
to `fs.promises.readFile` with a module-scoped cache if it ever shows
up in profiles.

---

## Low

### L1 — SSE client backoff has no jitter

**Location.** `apps/hud/lib/sse-client.ts:102-115`

When the server restarts, every connected client reconnects on the
same exponential schedule. Add a small random jitter
(`delay += Math.random() * delay * 0.3`) to spread reconnects.

---

### L2 — No `/api/health` or `/api/internal/stats` endpoint

There is no first-class way to observe server RSS, subscriber count,
events per second, or JSONL log size. Adding such an endpoint (token-
gated) would make tuning Phase 3 and Phase 5 much easier.

---

### L3 — `globalThis.__hudEventBus` does not support multiple workers

**Location.** `apps/hud/lib/bus.ts:87-94`

The singleton pattern works for a single Node process. If the HUD is
ever deployed under a process manager that spawns workers, each
worker has its own bus and events are siloed. Document this in
CLAUDE.md §9; a Redis-backed bus would be the minimal viable
alternative.

---

### L4 — Poller stdout has no upper bound

**Location.** `apps/hud/instrumentation-node.ts:78-93`

A misbehaving poller could flood `process.stdout`. For local
development this is acceptable; for any deployment scenario, redirect
to a file with rotation (or pipe through a line-limiter).
