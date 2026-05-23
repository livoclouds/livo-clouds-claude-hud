# LivoClouds — Claude Code HUD

**A real-time, touch-first heads-up display for Claude Code.**

The HUD is a companion screen — purpose-built for an iPad on the desk, equally happy on
a Raspberry Pi 5 panel or any modern browser — that visualizes the live state of a
Claude Code session: tokens, cost, elapsed time, current model, last tool invocation,
context-window pressure, and an animated mascot that **reacts to every hook event** as
they happen.

This is **not a static page**. Every metric, every glyph, every facial expression on the
mascot is driven by a live event stream coming from Claude Code itself. The UI is built
to be tapped, swiped, and lived with.

---

## Project Status

> **Phase 0 — Foundations**

| Area                                    | Status                             |
|-----------------------------------------|------------------------------------|
| Repository scaffolding                  | In progress                        |
| Event contract (Zod) + hook script      | Planned                            |
| SSE ingest + bus                        | Planned                            |
| HUD live view (tokens, cost, context)   | Planned                            |
| Mascot state machine + Lottie assets    | Planned                            |
| iPad PWA install + offline shell        | Planned                            |
| Sessions history view                   | Planned                            |
| Cost timeseries view                    | Planned                            |
| Raspberry Pi 5 kiosk deployment guide   | Planned                            |

---

## Architecture in one diagram

```
┌──────────────────┐  POST /api/events   ┌────────────────────────────────┐
│  Claude Code     │ ──────────────────► │   livo-clouds-claude-hud       │
│  (your Mac)      │     bearer token    │   Next.js 16 — RSC + Server    │
│  ~/.claude/      │                     │   Actions + Route Handlers     │
│  settings.json   │                     │                                │
│  hook script     │                     │   In-memory event bus          │
└──────────────────┘                     │   JSONL rolling log (history)  │
                                         │                                │
                                         │   GET /api/stream  (SSE)       │
                                         └────────────────────────────────┘
                                                       ▲   SSE
                                                       │
                                                ┌────────────┐
                                                │   iPad     │
                                                │   Safari / │
                                                │   PWA      │
                                                └────────────┘
```

One Next.js process. No external database in v1. No WebSocket — SSE is unidirectional
(matches our model), survives proxies, reconnects automatically.

---

## Tech Stack

### Core Framework

| Technology                                       | Version   | Purpose                                                                |
|--------------------------------------------------|-----------|------------------------------------------------------------------------|
| [Next.js](https://nextjs.org)                    | 16.x      | App Router, React Server Components, Route Handlers, streaming         |
| [React](https://react.dev)                       | 19.x      | UI rendering, Suspense, transitions                                    |
| [TypeScript](https://www.typescriptlang.org)     | 5.7.x     | `strict: true` across the entire monorepo                              |
| [pnpm](https://pnpm.io)                          | 9.x       | Workspaces, fast installs, deterministic lockfile                      |
| [Node.js](https://nodejs.org)                    | ≥ 22 LTS  | Runtime                                                                |

### Styling and Components

| Technology                                       | Version   | Purpose                                                                |
|--------------------------------------------------|-----------|------------------------------------------------------------------------|
| [Tailwind CSS](https://tailwindcss.com)          | 4.x       | Utility-first CSS, CSS-first config via `@theme {}`                    |
| [shadcn/ui](https://ui.shadcn.com)               | latest    | Accessible component primitives (cards, sheets, tooltips)              |
| [Radix UI](https://www.radix-ui.com)             | various   | Headless primitives backing shadcn/ui                                  |
| [Lucide React](https://lucide.dev)               | 0.475.x   | Icon library                                                           |
| [next-themes](https://github.com/pacocoursey/next-themes) | 0.4.x     | Dark / light with persisted system preference                          |

### Real-Time Transport

| Technology                                       | Purpose                                                                          |
|--------------------------------------------------|----------------------------------------------------------------------------------|
| **Server-Sent Events** (native)                  | Unidirectional server → client push for live events                              |
| [EventSource](https://developer.mozilla.org/docs/Web/API/EventSource) (native) | Client subscription, automatic reconnection                                      |
| [Zod](https://zod.dev) 3.24.x                    | Runtime validation of every inbound hook payload                                 |

### Animation and Mascot

| Technology                                       | Version   | Purpose                                                                |
|--------------------------------------------------|-----------|------------------------------------------------------------------------|
| [Lottie React](https://github.com/Gamote/lottie-react) | latest    | Mascot state animations (idle, thinking, editing, success, error)      |
| [Motion](https://motion.dev) (framer-motion 12.x)| 12.x      | UI transitions, swipe gestures, drag, layout animations                |
| [@use-gesture/react](https://use-gesture.netlify.app) | latest    | Touch gestures (swipe between views, long-press for detail sheets)     |

### Charts and Data Viz

| Technology                                       | Version   | Purpose                                                                |
|--------------------------------------------------|-----------|------------------------------------------------------------------------|
| [Recharts](https://recharts.org)                 | 2.x       | Token usage and cost timeseries                                        |
| [d3-scale](https://github.com/d3/d3-scale)       | 4.x       | Custom scales for context-pressure rings                               |

### State and Forms

| Technology                                       | Version   | Purpose                                                                |
|--------------------------------------------------|-----------|------------------------------------------------------------------------|
| [Zustand](https://github.com/pmndrs/zustand)     | 5.x       | Client store for live metrics, last-event cache                        |
| [React Hook Form](https://react-hook-form.com)   | 7.54.x    | Settings forms                                                         |
| [Zod](https://zod.dev)                           | 3.24.x    | Shared schemas between hook payloads, settings, and forms              |

### Internationalization and Theming

| Technology                                       | Version   | Purpose                                                                |
|--------------------------------------------------|-----------|------------------------------------------------------------------------|
| [next-intl](https://next-intl.dev)               | 4.x       | i18n — RSC-native, TypeScript key safety                               |
| Locales                                          | `en`, `es`| English default; Spanish secondary                                     |

### PWA and Touch

| Technology                                       | Purpose                                                                          |
|--------------------------------------------------|----------------------------------------------------------------------------------|
| [@ducanh2912/next-pwa](https://github.com/DuCanhGH/next-pwa) | Service worker, offline shell, install-to-home-screen on iPad                    |
| `apple-touch-icon` + `manifest.json`             | iPad home screen icon, splash screen, standalone display                         |

### Observability (optional source-side)

| Technology                                       | Purpose                                                                          |
|--------------------------------------------------|----------------------------------------------------------------------------------|
| [OpenTelemetry](https://opentelemetry.io)        | Optional richer metrics ingest via OTLP HTTP when `CLAUDE_CODE_ENABLE_TELEMETRY=1`|

### Tooling

| Technology                                       | Version   | Purpose                                                                |
|--------------------------------------------------|-----------|------------------------------------------------------------------------|
| [ESLint](https://eslint.org) flat config         | 9.x       | Lint                                                                   |
| [Prettier](https://prettier.io)                  | 3.x       | Format                                                                 |
| [Vitest](https://vitest.dev)                     | 2.x       | Unit tests (schemas, bus, reducers)                                    |
| [Playwright](https://playwright.dev)             | 1.x       | E2E (hook POST → SSE → DOM update timing)                              |

---

## Why These Choices

- **Next.js 16 + React 19** — Server Components give us a cheap, server-rendered initial
  snapshot; Route Handlers host the SSE stream and the ingest endpoint in the same
  process. One app, one deploy.
- **SSE over WebSocket** — traffic is one-way (server → client). SSE reconnects for
  free, is firewall-friendly, and avoids the operational weight of a WS layer.
- **Lottie + Motion** — the mascot needs richer-than-CSS animation (multi-layer rigs,
  easing curves designed by an illustrator), while Motion handles UI swipes and layout
  animations. Both run on the iPad 2021 at 60 fps.
- **No database in v1** — events are append-only and small. A ring buffer in memory plus
  rolling JSONL on disk is enough until history views demand SQL.
- **PWA, not native** — installable on iPad in 10 seconds, no App Store, full control of
  the rendering pipeline. The trade-off (no background execution) is irrelevant: the HUD
  is only useful when visible.

---

## Setup (local)

> Full instructions arrive with the first scaffold commit. Outline:

```bash
# 1. Clone and install
git clone git@github.com:livoclouds/livo-clouds-claude-hud.git
cd livo-clouds-claude-hud
pnpm install

# 2. Generate ingest token and write .env.local
pnpm hud:token

# 3. Start the HUD on your Mac
pnpm dev                        # http://localhost:3000

# 4. Register the hook in ~/.claude/settings.json
pnpm hud:install-hook           # writes the hook block, idempotent

# 5. On the iPad
#    Open Safari → http://<your-mac>.local:3000 → Share → Add to Home Screen
```

---

## iPad Deployment

1. Mac and iPad on the same WiFi (or Tailscale).
2. Open `http://<your-mac>.local:3000` in Safari.
3. **Share → Add to Home Screen** to install as PWA.
4. **Settings → Display & Brightness → Auto-Lock → Never** while plugged in.
5. Optionally Guided Access to pin the HUD on screen.

## Raspberry Pi 5 Deployment

Documented in `docs/raspberry-pi-kiosk.md` (planned). Outline: Chromium in kiosk mode
launching the HUD URL at boot via `systemd --user`, screen rotation per panel.

---

## Repository

- **Org**: [livoclouds](https://github.com/livoclouds)
- **Repo**: [livo-clouds-claude-hud](https://github.com/livoclouds/livo-clouds-claude-hud)
- **Siblings**: `livo-clouds-web-app` · `livo-clouds-api-app` · `livo-clouds-vault`

---

## License

Private. © LivoClouds. All rights reserved.
