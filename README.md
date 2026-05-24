# LivoClouds — Claude Code HUD

**A real-time, touch-first heads-up display for Claude Code.**

The HUD is a companion screen — purpose-built for an iPad on the desk, equally happy on
a Raspberry Pi 5 panel or any modern browser — that visualizes the live state of a
Claude Code session: tokens, cost, elapsed time, current model, last tool invocation,
context-window pressure, and an animated mascot that **reacts to every hook event** as
they happen.

This is **not a static page**. Every metric, every glyph, every facial expression on
the mascot is driven by a live event stream coming from Claude Code itself. The UI is
built to be tapped, swiped, and lived with.

> **Project status — v1 shipped.** All ten phases of the v1 roadmap are complete. See
> the interactive tracker at [`docs/v1/progress.html`](./docs/v1/progress.html) or the
> phases index at [`docs/v1/phases/`](./docs/v1/phases/).

---

## Table of contents

- [What it does](#what-it-does)
- [Architecture in one diagram](#architecture-in-one-diagram)
- [Prerequisites](#prerequisites)
- [Quickstart](#quickstart)
- [Deployment targets](#deployment-targets)
- [Project structure](#project-structure)
- [Development](#development)
- [Tech stack](#tech-stack)
- [Security](#security)
- [Documentation](#documentation)
- [Contributing](#contributing)
- [License](#license)

---

## What it does

The HUD listens to events emitted by [Claude Code](https://docs.claude.com/en/docs/claude-code)
through its native hook system and renders them in real time:

- **Live metrics** — tokens in/out/cached, USD cost, model in use, context-window
  pressure, last tool invoked, session elapsed time.
- **Animated mascot** — a stylized ✦ glyph whose state (idle, listening, thinking,
  editing, running, succeeded, errored, compacting) is derived purely from the
  incoming event stream. Breathing micro-animations so it never freezes.
- **Sessions view** — last 14 days of activity, sortable by total cost.
- **Cost view** — timeseries chart of cost and tokens (Recharts).
- **Touch-first UX** — swipe to navigate, long-press for metric detail sheets,
  reduced-motion aware.
- **Two kiosk paths** — installable as an iPad PWA, or as a Raspberry Pi 5 Chromium
  kiosk that boots straight into the HUD.

The HUD **does not run Claude Code.** Claude Code runs on the developer's machine. The
HUD is an observer that consumes events emitted by the hook script and renders them.

---

## Architecture in one diagram

```
┌──────────────────────────┐   POST /api/events    ┌─────────────────────────────────────┐
│  SOURCE                  │ ────────────────────► │  HUD (Next.js 16, single process)   │
│  Developer machine       │   bearer-token auth   │                                     │
│                          │                       │   • Zod-validated ingest            │
│  Claude Code             │                       │   • In-memory ring buffer (bus)     │
│  + ~/.claude/settings.   │                       │   • Rolling JSONL log (history)     │
│    json hooks            │                       │   • RSC initial snapshot            │
└──────────────────────────┘                       │                                     │
                                                   │   GET /api/stream  (SSE)            │
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

One Next.js process owns ingest, transport, and UI. No external database in v1. No
WebSocket — SSE is unidirectional (matches our model), survives proxies, and
reconnects automatically with `Last-Event-ID`.

For the full system reference, see [`docs/v1/architecture.md`](./docs/v1/architecture.md).

---

## Prerequisites

| Tool                                                       | Version                                                 | Why                                                                                        |
| ---------------------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| [Node.js](https://nodejs.org)                              | **22 LTS** (matches [`.nvmrc`](./.nvmrc))               | Runtime for the Next.js app and the install scripts.                                       |
| [pnpm](https://pnpm.io)                                    | **10.33+** (matches `packageManager` in `package.json`) | Workspace package manager.                                                                 |
| [Claude Code](https://docs.claude.com/en/docs/claude-code) | latest                                                  | The source of the event stream. Runs on your dev machine.                                  |
| `jq`                                                       | any                                                     | Hook script JSON wrangling. macOS: `brew install jq`. Debian/Ubuntu: `apt-get install jq`. |
| `curl`                                                     | any                                                     | Hook script HTTP client. Ships with macOS and most Linuxes.                                |

**Optional (deployment-specific):**

- An iPad (iPadOS 16+) on the same LAN — for the [iPad kiosk](./docs/v1/setup/setup-ipad.md).
- A Raspberry Pi 5 + display — for the [Pi kiosk](./docs/v1/setup/setup-raspberry-pi-kiosk.md).
- [Tailscale](https://tailscale.com) — for off-LAN access from any sink.

---

## Quickstart

From clone to a running HUD with a wired Claude Code session in five steps. Detailed
walkthrough lives at [`docs/v1/getting-started.md`](./docs/v1/getting-started.md).

```bash
# 1. Clone and install
git clone git@github.com:livoclouds/livo-clouds-claude-hud.git
cd livo-clouds-claude-hud
pnpm install

# 2. Generate the ingest token (writes apps/hud/.env.local, gitignored)
pnpm hud:token

# 3. Start the HUD (pick a free port via the HUD_PORT env var; defaults to 4000)
pnpm dev                                # http://localhost:4000
# HUD_PORT=5000 pnpm dev                # if port 4000 is already in use

# 4. In a second terminal — wire Claude Code's hooks into the HUD
pnpm hud:install-hook                   # idempotent merge into ~/.claude/settings.json

# 5. Run Claude Code in any project — events appear on the HUD within ~500 ms.
```

To stop streaming events without uninstalling the HUD: `pnpm hud:uninstall-hook`.

---

## Deployment targets

The HUD runs on the developer's machine. The **rendering surface** can be the same
machine or any of the supported sinks below. Each guide is self-contained.

| Target                                       | Guide                                                                                      |
| -------------------------------------------- | ------------------------------------------------------------------------------------------ |
| **Browser** on the dev machine               | Just open `http://localhost:4000/`.                                                        |
| **iPad** PWA kiosk                           | [`docs/v1/setup/setup-ipad.md`](./docs/v1/setup/setup-ipad.md)                             |
| **Raspberry Pi 5** Chromium kiosk _(opt-in)_ | [`docs/v1/setup/setup-raspberry-pi-kiosk.md`](./docs/v1/setup/setup-raspberry-pi-kiosk.md) |
| Claude Code → HUD **hook wiring**            | [`docs/v1/setup/setup-hook.md`](./docs/v1/setup/setup-hook.md)                             |

The HUD is **LAN-first**. Off-LAN access is documented through Tailscale; no public
ingress endpoint is exposed by default.

---

## Project structure

```
livo-clouds-claude-hud/
├── apps/
│   └── hud/                          # Next.js 16 app — UI + API
│       ├── app/
│       │   ├── (live)/page.tsx       # Default HUD view
│       │   ├── sessions/page.tsx     # Last 14 days
│       │   ├── cost/page.tsx         # Timeseries
│       │   ├── mascot/page.tsx       # Mascot diagnostics
│       │   └── api/
│       │       ├── events/route.ts   # POST ingest
│       │       └── stream/route.ts   # SSE out
│       ├── lib/
│       │   ├── bus.ts                # In-memory ring buffer
│       │   ├── sse-client.ts         # EventSource hook with reconnect
│       │   ├── store.ts              # Zustand client store
│       │   └── mascot/               # Pure state derivation
│       ├── public/                   # PWA manifest, icons, splash, sw.js
│       └── scripts/                  # Token gen, hook install/uninstall, smoke helpers
├── packages/
│   └── contracts/                    # @livoclouds/contracts — shared Zod schemas
├── hooks/
│   └── claude-hook.sh                # Drop-in bash hook for ~/.claude/settings.json
├── deploy/
│   └── raspberry-pi/                 # Pi 5 kiosk: setup.sh, kiosk.service, xrandr-rotate.sh
├── docs/
│   ├── README.md                     # Docs entry point
│   ├── CHANGELOG.md                  # Documentation version history
│   └── v1/                           # v1 docs — architecture, conventions, phases, setup guides
└── CLAUDE.md                         # Architectural constitution
```

Workspaces managed via **pnpm**. TypeScript `strict: true` throughout.

---

## Development

| Command                   | What it does                                                                 |
| ------------------------- | ---------------------------------------------------------------------------- |
| `pnpm dev`                | Run the HUD locally on `http://localhost:4000`.                              |
| `pnpm build`              | Build all workspace packages.                                                |
| `pnpm lint`               | ESLint flat config across the workspace.                                     |
| `pnpm typecheck`          | `tsc --noEmit` across the workspace.                                         |
| `pnpm test`               | Vitest run across `@livoclouds/contracts` and `@livoclouds/hud`.             |
| `pnpm format`             | Prettier write across all supported file types.                              |
| `pnpm format:check`       | Prettier check (CI-friendly).                                                |
| `pnpm hud:token`          | Generate `HUD_INGEST_TOKEN` and write `apps/hud/.env.local`. Idempotent.     |
| `pnpm hud:install-hook`   | Merge the Claude Code hook block into `~/.claude/settings.json`. Idempotent. |
| `pnpm hud:uninstall-hook` | Inverse of install-hook.                                                     |

For local-only event injection (no Claude Code needed):

```bash
./apps/hud/scripts/synth-event.sh tool.use Bash
```

See [`docs/v1/phases/`](./docs/v1/phases/) for each phase's deliverables and
acceptance criteria. The [`progress.html`](./docs/v1/progress.html) tracker is an
interactive single-file dashboard — open it in any browser.

---

## Tech stack

| Layer           | Library                                                   | Version              | Purpose                                           |
| --------------- | --------------------------------------------------------- | -------------------- | ------------------------------------------------- |
| Framework       | [Next.js](https://nextjs.org)                             | 16.x                 | App Router, Server Components, Route Handlers     |
| UI              | [React](https://react.dev)                                | 19.x                 | Suspense, transitions                             |
| Language        | [TypeScript](https://www.typescriptlang.org)              | 5.x (`strict: true`) | Type safety end-to-end                            |
| Styling         | [Tailwind CSS](https://tailwindcss.com)                   | 4.x                  | Utility-first, CSS-first config via `@theme {}`   |
| Animation       | [Motion](https://motion.dev)                              | 12.x                 | Counters, swipe gestures, layout transitions      |
| Touch gestures  | [@use-gesture/react](https://use-gesture.netlify.app)     | 10.x                 | Swipe between views, long-press for detail sheets |
| Charts          | [Recharts](https://recharts.org)                          | 2.x                  | Cost timeseries                                   |
| State (client)  | [Zustand](https://github.com/pmndrs/zustand)              | 5.x                  | Live metrics store                                |
| Theming         | [next-themes](https://github.com/pacocoursey/next-themes) | 0.4.x                | Dark / light with system preference               |
| Validation      | [Zod](https://zod.dev)                                    | 3.x                  | Runtime schema for every hook payload             |
| Transport (in)  | HTTP `POST /api/events`                                   | —                    | Bearer-token auth                                 |
| Transport (out) | Server-Sent Events                                        | —                    | `EventSource` reconnects on `Last-Event-ID`       |
| Mascot          | Inline SVG + Motion                                       | —                    | No Lottie; per design decision D-6.1              |
| PWA             | Hand-rolled service worker                                | —                    | Shell-only cache; never caches `/api/*`           |
| Lint / format   | ESLint flat config 9.x · Prettier 3.x                     | —                    |                                                   |
| Tests           | [Vitest](https://vitest.dev)                              | 2.x                  | Schemas, mascot state derivation                  |
| Package manager | [pnpm](https://pnpm.io)                                   | 10.x                 | Workspaces                                        |

**No database in v1.** Events live in an in-memory ring buffer (1000-event cap)
and a rolling JSONL log at `data/events-YYYY-MM-DD.jsonl`. A `better-sqlite3`
migration is the documented fallback if history queries demand it.

---

## Security

The full threat model and operational guidance live in [`SECURITY.md`](./SECURITY.md).
Highlights:

- The ingest endpoint requires a bearer token. Tokens are generated locally via
  `pnpm hud:token` and stored in `.env.local` (gitignored). **Never commit a
  token.** Never expose the ingest endpoint to a public origin without rotated
  tokens and rate limiting.
- The HUD assumes a **trusted LAN or Tailscale** network. Clients do not
  authenticate; multi-user is out of scope for v1.
- The HUD **never executes code** from event payloads. Every payload passes
  through Zod before reaching React state.
- The Raspberry Pi 5 kiosk and the iPad PWA never receive the ingest token —
  they only render the public HUD URL.
- See [`CLAUDE.md`](./CLAUDE.md) §12 for the security charter.

---

## Documentation

| Need                             | Where                                                                                      |
| -------------------------------- | ------------------------------------------------------------------------------------------ |
| Architecture overview            | [`docs/v1/architecture.md`](./docs/v1/architecture.md)                                     |
| Persona-routed quickstart        | [`docs/v1/getting-started.md`](./docs/v1/getting-started.md)                               |
| Setup — hook (Claude Code → HUD) | [`docs/v1/setup/setup-hook.md`](./docs/v1/setup/setup-hook.md)                             |
| Setup — iPad kiosk               | [`docs/v1/setup/setup-ipad.md`](./docs/v1/setup/setup-ipad.md)                             |
| Setup — Raspberry Pi 5 kiosk     | [`docs/v1/setup/setup-raspberry-pi-kiosk.md`](./docs/v1/setup/setup-raspberry-pi-kiosk.md) |
| Phase-by-phase roadmap           | [`docs/v1/phases/`](./docs/v1/phases/)                                                     |
| Interactive progress tracker     | [`docs/v1/progress.html`](./docs/v1/progress.html) (open in any browser)                   |
| Documentation conventions        | [`docs/v1/conventions.md`](./docs/v1/conventions.md)                                       |
| Glossary                         | [`docs/v1/glossary.md`](./docs/v1/glossary.md)                                             |
| Documentation changelog          | [`docs/CHANGELOG.md`](./docs/CHANGELOG.md)                                                 |
| Architectural constitution       | [`CLAUDE.md`](./CLAUDE.md)                                                                 |

---

## Contributing

Contributions are welcome. See [`CONTRIBUTING.md`](./CONTRIBUTING.md) for the
development setup, commit message format, lint/typecheck/test commands, and PR
workflow. All technical artifacts are **English-only** per
[`CLAUDE.md`](./CLAUDE.md) §4.

For security issues, follow the responsible disclosure process in
[`SECURITY.md`](./SECURITY.md) — do not open a public GitHub issue.

---

## License

[MIT](./LICENSE) © LivoClouds.
