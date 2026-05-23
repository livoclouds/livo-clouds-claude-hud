# Phase 8 — PWA & iPad Kiosk

| Field | Value |
|---|---|
| Phase ID | `phase-8` |
| Status | ⚪ Not Started |
| Depends on | `phase-7` |
| Blocks | — |
| Target outcome | The HUD installs on an iPad home screen with a custom icon, launches without Safari chrome, and survives transient WiFi drops |

---

## Overview

Turn the HUD into a Progressive Web App so it installs cleanly on an iPad and
behaves like a kiosk dashboard. Provide the operator guide for the physical
setup.

## Goals

- Provide `manifest.json` with icon, splash, theme color, and `standalone`
  display.
- Add `apple-touch-icon` and splash images for iPad resolutions.
- Add a service worker for the app shell (offline-tolerant first paint).
- Auto-reconnect SSE on `online` event after a WiFi drop.
- Author the iPad operator guide.

## In Scope

- `apps/hud/public/manifest.webmanifest`.
- Icon set (`apple-touch-icon`, maskable PWA icons).
- iPad splash images for the major iPad resolutions.
- Service worker registration via `@ducanh2912/next-pwa` (or hand-rolled).
- A persistent visual indicator when the SSE stream is disconnected.
- `docs/v1/setup/setup-ipad.md` — operator guide.

## Out of Scope

- Backgrounded operation (PWAs don't run in background; the HUD only needs to
  be useful when visible).
- Push notifications (Apple's PWA push support is limited and not needed).
- Auto-launch on iPad boot — covered by Guided Access, not by us.

## Open Decisions

### D-8.1 — Service worker scope

**Default proposal**: cache only the shell (HTML + JS + CSS + icons). Never
cache event data or API responses. The HUD must always show live data; offline
shows the cached shell with a clearly visible "Disconnected" state.

### D-8.2 — Reconnect strategy

**Default proposal**: on `EventSource.onerror`, wait 2 s before retry; on
network `online` event, retry immediately. Show a banner "Reconnecting…" while
disconnected.

### D-8.3 — Icon style

**Default proposal**: derive from D-0.1 mascot art. A simplified mascot face on
a colored background. Maskable so iOS Add to Home Screen renders it correctly.

## Deliverables

```
apps/hud/
├── public/
│   ├── manifest.webmanifest
│   ├── icons/
│   │   ├── icon-192.png
│   │   ├── icon-512.png
│   │   ├── icon-maskable-512.png
│   │   └── apple-touch-icon.png
│   └── splash/
│       └── …iPad-resolution.png
├── app/
│   ├── layout.tsx           # manifest link + apple meta
│   └── _components/ConnectionBanner.tsx
└── next.config.ts           # PWA wiring

docs/v1/setup/
└── setup-ipad.md
```

## Acceptance Criteria

- Visiting the HUD on iPad → Share → Add to Home Screen yields an icon that
  launches the HUD full-screen with no Safari chrome.
- Splash image matches iPad resolution.
- Killing WiFi for 10 s and restoring it: the HUD shows the banner, then
  reconnects and resumes the live stream.
- Lighthouse PWA score ≥ 90 on a desktop run.
- Operator can follow `setup-ipad.md` from a clean iPad to a kiosk-ready
  display in under 5 minutes.

## Tasks

1. Generate the icon and splash assets from the mascot art.
2. Write `manifest.webmanifest`.
3. Wire the service worker (cache shell only).
4. Implement `ConnectionBanner` + reconnect strategy.
5. Add `<link rel="apple-touch-icon">` and iPad splash meta to `layout.tsx`.
6. Author `setup-ipad.md` covering: WiFi/Tailscale, Add to Home Screen, Auto-Lock,
   Guided Access, brightness setting for kiosk.
7. Smoke test on a real iPad.
8. PR titled `feat(pwa): iPad-installable HUD + operator guide (Phase 8)`.

## Risks

- **iOS Add to Home Screen quirks** (splash size mismatches, icon caching).
  Mitigation: test on the target iPad early; iterate on icon dimensions.
- **Service-worker cache busting** during frequent dev cycles. Mitigation:
  hash-based shell URLs from Next.js; clear cache on version change via a
  build-time constant.

## Related

- [`./phase-7-polish.md`](./phase-7-polish.md) — visual base.
- [`./phase-9-raspberry-pi.md`](./phase-9-raspberry-pi.md) — sibling kiosk path.
- [`../../CLAUDE.md §10`](../../../CLAUDE.md) — touch-first UX rules.
