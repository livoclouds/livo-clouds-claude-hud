# Setup — iPad Kiosk

This guide takes a stock iPad from "Safari open on the HUD URL" to a kiosk
dashboard pinned to the home screen — full-screen, no Safari chrome, no
auto-lock, and graceful recovery from short WiFi drops.

The HUD is a Progressive Web App (PWA). iOS treats a PWA added to the home
screen as a separate app instance with its own splash screen, status bar
behavior, and offline shell. Combined with iPadOS Guided Access, the iPad
becomes a single-purpose display.

---

## Prerequisites

- An iPad (any model that runs iPadOS 16+; tested targets are iPad 10.2,
  iPad Pro 11, and iPad Pro 12.9).
- The HUD running on a development machine on the same LAN, or reachable
  via [Tailscale](https://tailscale.com). See the repo root
  [`README`](../../../README.md) for `pnpm dev` startup.
- The HUD URL reachable from the iPad's browser. On the dev machine,
  `pnpm dev` binds to `0.0.0.0:4000` — confirm the LAN address with
  `ipconfig getifaddr en0` (macOS) and load `http://<lan-ip>:4000/` in
  iPad Safari.

---

## One-time setup

### 1. Reach the HUD from the iPad

Choose one transport and verify the HUD loads in Safari before continuing.

- **LAN** — open `http://<dev-machine-lan-ip>:4000/`. Fastest path; works
  on the home network.
- **Tailscale** — install Tailscale on both the dev machine and the iPad,
  log in to the same tailnet, then load `http://<machine>.<tailnet>.ts.net:4000/`.
  Works off-network and survives IP changes.

Confirm the live view renders and that the mascot is animating. If it is
not, the SSE stream is not connecting — fix that before installing.

### 2. Add to Home Screen

In Safari on the iPad, with the HUD loaded:

1. Tap the **Share** icon in the toolbar.
2. Scroll the share sheet and tap **Add to Home Screen**.
3. Confirm the icon and short name read `HUD`, then tap **Add**.

The HUD icon now appears on the home screen. Tapping it launches the HUD
in standalone mode — no Safari toolbar, no URL bar. The first launch
shows the iPad splash image while the shell loads.

### 3. Disable Auto-Lock

A kiosk should never blank. **Settings → Display & Brightness →
Auto-Lock → Never**.

Note: Auto-Lock disabled while on battery is hard on the battery. For a
permanent kiosk, leave the iPad plugged in.

### 4. Brightness

For a desk-side display, brightness around **30–50%** keeps the HUD
readable without dominating the room. **Settings → Display & Brightness →
Brightness** slider. Turn **True Tone** off if you want stable colors
across the day; leave it on if you prefer the iPad to match the room's
ambient light.

### 5. Guided Access (lock into HUD)

Guided Access prevents accidental swipes from leaving the HUD.

1. **Settings → Accessibility → Guided Access → On**.
2. Set a passcode under **Passcode Settings** (you'll need it to exit).
3. Launch the HUD from the home screen.
4. Triple-press the **side button** to start a Guided Access session.
5. Tap **Start** in the top-right.

To exit: triple-press the side button, enter the passcode, tap **End**.

### 6. (Optional) Verify the reconnect banner

To check the connection banner works end-to-end:

1. With the HUD open in standalone mode, swipe down from the top-right to
   open Control Center.
2. Tap the **WiFi** tile to turn WiFi off.
3. Wait ~2 seconds. A small banner appears at the top reading
   `Reconnecting…`, escalating to `Disconnected — waiting for network`
   after a few more seconds.
4. Tap the WiFi tile to turn it back on.
5. The banner clears within a second and the live stream resumes from
   the last received event (Last-Event-ID replay from
   [Phase 3](../phases/phase-3-backend.md)).

---

## Verify

After the steps above, confirm:

- The HUD launches from the home screen with **no Safari toolbar** and
  no URL bar.
- A custom **splash image** appears during launch, not a white screen.
- The mascot animates and metrics update **without any user interaction**.
- Toggling WiFi off then on shows the banner, then clears it.
- Auto-Lock does not fire during a 10-minute idle test.
- Guided Access blocks the home swipe.

---

## Troubleshooting

**Icon looks wrong / generic / pixelated.**
iOS caches PWA icons aggressively. Remove the HUD from the home screen
(long-press → Remove App → Delete from Home Screen), then re-add it. If
the icon is still wrong, force-quit Safari and try again.

**Splash screen is a white screen.**
The HUD ships splash images for iPad 10.2, iPad Pro 11, and iPad Pro 12.9
in both orientations. If you're on a different iPad model, iOS falls back
to a generic background. File an issue with the device model and we'll
add the missing splash size.

**Safari chrome still visible after Add to Home Screen.**
You probably opened the HUD from a Safari bookmark rather than the home
screen icon. Tap the icon directly on the home screen.

**Banner says "Disconnected" even when WiFi is on.**
The HUD lost contact with the dev machine, not the WiFi. Check that the
dev server is still running (`pnpm dev`) and that the LAN/Tailscale URL
still resolves from the iPad.

**Stale layout after a deploy.**
The service worker version-bumps the cache on every release; the next
launch should pick up the new shell. If a stale view persists, remove
the HUD from the home screen and re-add it to clear the SW cache.

---

## Related

- [`./setup-hook.md`](./setup-hook.md) — wire Claude Code itself to the HUD.
- [`../phases/phase-8-pwa-ipad.md`](../phases/phase-8-pwa-ipad.md) — phase
  doc covering the PWA + iPad kiosk deliverables.
- [`../../../CLAUDE.md`](../../../CLAUDE.md) §10 — touch-first UX rules
  this kiosk experience follows.
