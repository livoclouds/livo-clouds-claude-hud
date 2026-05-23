# CLAUDE.md — Claude Code HUD

> Architectural constitution for this repo. Read before writing any code.

---

## 1. Project Vision

A real-time **heads-up display** for Claude Code. Renders the live state of a Claude
Code session — token usage, cost, elapsed time, current model, last tool invocation,
context-window pressure, and an **animated mascot** that reacts to session events — on
any touch-capable screen (primary target: iPad, secondary: Raspberry Pi 5 with a small
HDMI/SPI panel, also any browser).

**The HUD does not run Claude Code.** Claude Code runs on the user's development
machine. The HUD is an **observer** that listens to events emitted by Claude Code hooks
and OpenTelemetry, then renders them dynamically.

**Core value**: Make an invisible AI assistant *physically present* on the desk — a
companion screen that breathes, reacts, and surfaces what Claude is doing right now.

**Non-goals**: Not a chat client. Not a Claude Code replacement. Not a static dashboard
— every view must update in real time without page refresh.

---

## 2. Source Machine (where Claude Code runs)

The HUD consumes events from a Claude Code instance running on a separate host (usually
the user's Mac).

- **Transport in**: HTTP `POST /api/events` from a bash hook script registered in
  `~/.claude/settings.json`. Optional: OpenTelemetry OTLP HTTP endpoint at
  `/api/otlp/v1/metrics` when `CLAUDE_CODE_ENABLE_TELEMETRY=1` is set on the source.
- **Transport out (to clients)**: Server-Sent Events (SSE) stream at `/api/stream`.
  WebSocket is explicitly avoided — SSE is unidirectional (matches our model), survives
  proxies better, and reconnects automatically.
- **Auth**: Shared secret in `Authorization: Bearer ${HUD_INGEST_TOKEN}` header on every
  hook POST. Never expose ingest endpoints without the token.
- **Local-only by default**: bind to `0.0.0.0:3000` on the LAN; document a Tailscale
  setup for remote access. Never deploy the ingest endpoint to a public origin without
  rate-limiting and rotated tokens.

---

## 3. Development Workflow

```
EXPLORE → ANALYZE → PLAN → VALIDATE → IMPLEMENT → TEST → REFACTOR → DOCUMENT
```

**Stop and ask when**: a new Claude Code hook event payload appears that we have not
modeled · a metric semantically overlaps another (cost vs. tokens vs. spend rate) · a
mascot state could be perceived as ambiguous to the user.

---

## 4. Language Standards

**All technical artifacts are English-only** (file names, variables, functions,
components, API paths, hook payloads, event types, comments, git messages, log
messages, env vars, TypeScript types, Zod schemas).

**Exception**: Conversational communication with the user may be in Spanish.

User-visible strings use `t('namespace.key')` — never hardcoded. Translation keys are
English (`hud.metrics.tokensIn`); translated values can be any language.

---

## 5. Internationalization (i18n)

**Library**: next-intl v4+ · **Locales**: `['en', 'es']` · **Default**: `en` ·
**Prefix**: `as-needed` (English `/`, Spanish `/es`)

Namespace files live in `messages/{locale}/{namespace}.json`. Initial namespaces:
`common · hud · mascot · sessions · cost · settings · errors`.

---

## 6. Real-Time Rendering — Non-Negotiable

This HUD is **dynamic in every view**. There must be **no static HTML pages**. Every
visible value that can change during a session must reconcile to the live event stream:

- **No polling on the client.** Subscribe once to `/api/stream` (SSE) and update via
  React state. The HUD must reflect a new event within **< 500 ms** of ingest.
- **Optimistic skeletons**, never blank pages, on first paint. The HUD must look alive
  even before the first event arrives.
- **Server-driven where it makes sense**: the initial snapshot (current session, totals)
  is fetched via a Server Component on first load; subsequent updates are SSE-driven on
  the client.
- **Touch is a first-class input.** Every interactive surface must respond to tap and,
  where natural, swipe. Hover-only affordances are forbidden. Tap targets ≥ 44 × 44 pt.

---

## 7. Mascot — Behavior Contract

The mascot is the emotional core of the HUD. It is a state machine driven by hook
events. Every state must have:

1. An **idle micro-animation** (breathing, blinking, subtle drift) so the mascot never
   freezes.
2. A **transition animation** into the state, not a hard cut.
3. A **fallback** if the next expected event does not arrive within a timeout (return to
   neutral idle after 30 s of silence).

Canonical states (initial set, extend with caution):

| State        | Triggered by                          | Visual cue                          |
|--------------|---------------------------------------|-------------------------------------|
| `idle`       | No activity for > 30 s                | Breathing, occasional blink         |
| `listening`  | `UserPromptSubmit`                    | Eyes widen, tilt toward user        |
| `thinking`   | Between prompt and first tool         | Spinner halo / thought bubble       |
| `editing`    | `PostToolUse` Edit / Write            | Typing motion, sparkles             |
| `running`    | `PostToolUse` Bash                    | Terminal glyph orbits               |
| `succeeded`  | `Stop` with no error                  | Brief smile, soft glow              |
| `errored`    | Hook blocked, tool error, exit ≠ 0    | Red tint, surprised expression      |
| `compacting` | `PreCompact`                          | Mascot shrinks toward a smaller     |
|              |                                       | silhouette, then re-inflates        |

States are **declarative**, not imperative — the renderer derives the current state
from the latest events; we never imperatively "play" an animation.

---

## 8. Data Model — Event Shape

Every event POSTed by the hook adheres to this Zod schema (the source of truth lives in
`packages/contracts/src/event.ts`):

```ts
export const HudEventSchema = z.object({
  type: z.enum([
    'session.start', 'session.end',
    'prompt.submit', 'tool.use', 'turn.stop',
    'compact.start', 'compact.end',
    'error',
  ]),
  sessionId: z.string(),
  cwd: z.string().optional(),
  model: z.string().optional(),
  tool: z.string().optional(),          // e.g. 'Edit', 'Bash', 'Read'
  toolInput: z.record(z.unknown()).optional(),
  tokens: z.object({ in: z.number(), out: z.number(), cached: z.number().optional() }).optional(),
  costUsd: z.number().optional(),
  contextPct: z.number().min(0).max(100).optional(),
  durationMs: z.number().optional(),
  ts: z.number(),                       // unix epoch ms
});
```

Any field that may surface on screen must be modeled here. Do not invent ad-hoc shapes
inside route handlers — extend the contract.

---

## 9. Architecture

```
┌──────────────────┐   POST /api/events   ┌────────────────────────────────────┐
│  Claude Code     │ ───────────────────► │   livo-clouds-claude-hud (Next.js) │
│  (user's Mac)    │                      │                                    │
│  hooks +         │ ◄──── 200 OK ─────── │   in-memory bus + JSONL log        │
│  OTel collector  │                      │   /api/stream  (SSE)               │
└──────────────────┘                      │   /              (HUD UI, RSC + CC)│
                                          └────────────────────────────────────┘
                                                          ▲
                                                          │  SSE
                                                          │
                                                    ┌────────────┐
                                                    │   iPad     │
                                                    │   Safari   │
                                                    │   PWA      │
                                                    └────────────┘
```

- **Single Next.js app** (no separate Express server). All ingress, all transport, all
  UI lives in this repo. Reason: simpler ops, one process to monitor, single deploy.
- **In-memory bus** is the default ring buffer (last 1 000 events). Persistence to a
  rolling JSONL file under `data/events-YYYY-MM-DD.jsonl` is for history views only —
  the live HUD never reads from disk on the hot path.
- **No external database** in v1. Add SQLite (via `better-sqlite3`) only when history
  queries become expensive or we need cross-day analytics.

---

## 10. Touch-First UX Rules

The HUD targets iPad in particular. Therefore:

1. **Swipes** navigate between primary views (`/live`, `/sessions`, `/cost`, `/mascot`).
2. **Long-press** on any metric opens a sheet with its 24 h timeseries.
3. **No modals that trap focus**. Use slide-up sheets that dismiss by swipe-down.
4. **Respect `prefers-reduced-motion`** — disable mascot animations when set.
5. **Lock orientation? No.** Layouts must work in both portrait and landscape.
6. **PWA installable** — manifest, icons, offline shell so the HUD survives brief WiFi
   blips and reconnects SSE automatically.

---

## 11. Performance Budgets

- First paint on iPad (2021) over LAN: **< 1.5 s**.
- Event ingest → screen update: **< 500 ms p95**.
- Mascot animation: must hold **60 fps** on iPad 2021 hardware. If a state cannot, drop
  the animation, never the framerate.
- Memory: client process must stay under **150 MB** RSS over a 24 h continuous session.

---

## 12. Security

- Every ingest endpoint requires the bearer token. Tokens are generated at install via
  `pnpm hud:token` and stored in `.env.local` (gitignored).
- The HUD never executes code from event payloads. It renders strings, numbers, and
  enum-validated states. All payloads pass through Zod before reaching React state.
- Outbound network is forbidden from the hook script except to the configured HUD
  origin.
- No third-party analytics. No telemetry leaving the LAN.

---

## 13. Folder Conventions

```
livo-clouds-claude-hud/
├── apps/
│   └── hud/                     # Next.js app (the HUD UI + API)
│       ├── app/
│       │   ├── (live)/page.tsx  # Default HUD view
│       │   ├── sessions/page.tsx
│       │   ├── cost/page.tsx
│       │   └── api/
│       │       ├── events/route.ts   # POST ingest
│       │       └── stream/route.ts   # SSE out
│       ├── components/
│       │   ├── mascot/          # Mascot state machine + Lottie/SVG assets
│       │   ├── metrics/         # Token, cost, context cards
│       │   └── charts/          # Timeseries
│       ├── lib/
│       │   ├── bus.ts           # In-memory event bus
│       │   ├── sse.ts           # SSE writer helpers
│       │   └── store.ts         # Client store (Zustand)
│       └── messages/{en,es}/*.json
├── packages/
│   └── contracts/               # Zod schemas shared by hook + app
└── hooks/
    └── claude-hook.sh           # Drop-in script for ~/.claude/settings.json
```

Workspaces via **pnpm**. Node ≥ 22. TypeScript `strict: true`.

---

## 14. Out of Scope (v1)

- Multi-user / shared HUDs.
- Cloud deployment.
- Per-tool analytics dashboards (only aggregate metrics in v1).
- Editing Claude Code settings from the HUD.
- Voice / audio reactions to events.

These may land in later phases — they must not creep into v1 work.
