# Glossary

Definitions of recurring terms used across the v1 documentation. Terms are
listed alphabetically. When a term appears in another document, it links here.

---

| Term | Definition |
|---|---|
| **Bus** | The in-memory ring buffer that holds the most recent `N` events on the HUD server. Live SSE consumers read from the bus; history queries read from the JSONL log. |
| **Client** | A browser, iPad PWA, or kiosk that has subscribed to the HUD's SSE stream. |
| **Compaction** | A Claude Code lifecycle event in which conversation context is summarized to reclaim token budget. Surfaces as the `compact.start` / `compact.end` events on the HUD. |
| **Context pressure** | The percentage of the model's context window currently consumed. Displayed as a ring or bar on the live view. |
| **Cost** | Estimated USD spend for the current session, derived from token counts and the active model's published rate. |
| **Event** | A typed message produced by a hook (or OTel ingest) and validated against `HudEventSchema`. The only data type the HUD's UI consumes. |
| **HUD** | Heads-Up Display. The product. |
| **Hook** | A Claude Code lifecycle script registered in `~/.claude/settings.json` under a named event (`SessionStart`, `UserPromptSubmit`, `PostToolUse`, `Stop`, `PreCompact`, etc.). |
| **Ingest** | The `POST /api/events` endpoint that accepts hook payloads. |
| **Ingest token** | A shared secret stored in `.env.local` on the HUD machine, sent by every hook POST in the `Authorization: Bearer …` header. |
| **Kiosk** | A device dedicated to displaying the HUD full-screen (iPad with Guided Access, Raspberry Pi 5 with Chromium kiosk mode). |
| **Mascot** | The animated character at the visual center of the HUD. Its current visible state is derived from the latest events (declarative, not imperative). |
| **Mascot State** | One of a fixed enumeration of behavioral states (`idle`, `listening`, `thinking`, `editing`, `running`, `succeeded`, `errored`, `compacting`). See [Phase 6](./phases/phase-6-mascot.md) and [`CLAUDE.md §7`](../../CLAUDE.md). |
| **OTel** | OpenTelemetry. An optional, richer ingest path the HUD exposes for clients running Claude Code with `CLAUDE_CODE_ENABLE_TELEMETRY=1`. |
| **PWA** | Progressive Web App. The HUD's iPad-install surface — Safari "Add to Home Screen" produces an icon that launches the HUD in a standalone window. |
| **Sink** | Any consumer subscribed to the SSE stream. Synonymous with **client**. |
| **Source** | The machine running Claude Code, sending events to the HUD. Typically the developer's Mac. |
| **Snapshot** | Server-rendered initial state delivered with the first page load — totals, current session, last few events. |
| **SSE** | Server-Sent Events. The unidirectional server → client transport used to push live events to the HUD UI. |
| **Stream** | The `GET /api/stream` endpoint that emits live events as SSE. |
| **Tool** | An action taken by Claude Code (`Edit`, `Write`, `Read`, `Bash`, `Grep`, …). Reported by the `PostToolUse` hook. |
| **Turn** | A single user-prompt → assistant-response cycle in a Claude Code session. Bracketed by `UserPromptSubmit` and `Stop` events. |
