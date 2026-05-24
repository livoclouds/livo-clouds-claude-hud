# Getting Started

This page routes you to the right setup guide for what you're trying to do.
Pick the persona that matches and follow that path. Each guide is
self-contained — you do not need to read them in order.

If you're new to the project, start by skimming
[`architecture.md`](./architecture.md) (about a 3-minute read) so the rest of
the guides make sense.

---

## Personas

### A. "I want to run the HUD on my dev machine and see Claude Code events live."

This is the **default** path. The HUD runs on your Mac (or Linux box), Claude
Code runs there too, and you view the HUD in any browser on the same machine.

1. Confirm prerequisites:
   - Node 22 (matches [`.nvmrc`](../../.nvmrc)) and pnpm 10.33+.
   - `jq` and `curl` installed on the system.
   - Claude Code installed and authenticated.
2. Clone and install:
   ```bash
   git clone git@github.com:livoclouds/livo-clouds-claude-hud.git
   cd livo-clouds-claude-hud
   pnpm install
   ```
3. Generate the ingest token and start the HUD:
   ```bash
   pnpm hud:token
   pnpm dev                              # http://localhost:4000
   ```
4. Wire Claude Code's hooks into the HUD. Detailed walkthrough:
   [`setup/setup-hook.md`](./setup/setup-hook.md). The short version is:
   ```bash
   pnpm hud:install-hook
   ```
5. Run Claude Code in any project. Watch the HUD update in real time
   (target: < 500 ms per event).

**Verify it works.** Open `http://localhost:4000/`, then run Claude Code.
Tokens, cost, model, last tool, and the mascot should update without any page
refresh. If they don't, the hook is not POSTing — see
[`setup/setup-hook.md`](./setup/setup-hook.md#troubleshooting).

---

### B. "I want a permanent companion display on my desk (iPad)."

The iPad path runs the HUD on your dev machine (persona A) and renders it on
the iPad as an installed PWA. The iPad never receives the ingest token — it
only loads the public HUD URL.

1. **Complete persona A first.** The iPad needs a HUD to point at.
2. Follow [`setup/setup-ipad.md`](./setup/setup-ipad.md). Short version:
   - Open `http://<your-mac>.local:4000/` in iPad Safari.
   - **Share → Add to Home Screen**.
   - **Settings → Display & Brightness → Auto-Lock → Never**.
   - Optionally **Settings → Accessibility → Guided Access → On** to pin the
     HUD on screen.
3. The HUD survives short WiFi drops via SSE reconnect and a top-of-screen
   `ConnectionBanner`. No data is cached on the iPad — only the app shell.

**Verify it works.** With the HUD on the iPad, toggle WiFi off in Control
Center. The banner should appear within a few seconds, then clear when WiFi
returns. Events resume from the last received ID via SSE replay.

---

### C. "I want a dedicated kiosk on a small panel (Raspberry Pi 5)."

The Pi 5 kiosk is **opt-in**. It boots a Raspberry Pi 5 directly into
Chromium full-screen on the HUD URL, with the cursor hidden and the screen
prevented from sleeping. The Pi is a sink — it never runs Claude Code.

1. **Complete persona A first.** The Pi needs a HUD to point at.
2. Follow [`setup/setup-raspberry-pi-kiosk.md`](./setup/setup-raspberry-pi-kiosk.md).
   Short version:
   - Flash Raspberry Pi OS Bookworm 64-bit with autologin and WiFi
     preconfigured.
   - `sudo raspi-config` → **System Options → Boot/Auto-Login → Desktop
     Autologin** and **Advanced Options → Wayland → X11**.
   - On the Pi: `bash deploy/raspberry-pi/setup.sh`.
   - Edit `~/.config/livo-clouds-hud-kiosk.env` and set `HUD_URL=`.
   - `systemctl --user restart kiosk.service`, or reboot for the full
     unattended boot path.

**Verify it works.** After a reboot, the Pi should land on the HUD with no
manual login, no cursor, and no screen blanking. Chromium auto-relaunches if
killed.

---

### D. "I just want to read the code / contribute / understand the architecture."

Recommended reading order:

1. [`../../CLAUDE.md`](../../CLAUDE.md) — architectural constitution (about a
   10-minute read).
2. [`architecture.md`](./architecture.md) — the system at a glance.
3. [`conventions.md`](./conventions.md) — badge system and phase lifecycle.
4. [`phases/README.md`](./phases/README.md) — the v1 roadmap, all 10 phases
   complete.
5. [`progress.html`](./progress.html) — bookmark this; it's the interactive
   tracker with expandable per-phase detail.
6. [`../../CONTRIBUTING.md`](../../CONTRIBUTING.md) — how to land a change.

Each phase file (`phases/phase-N-*.md`) documents that phase's scope,
deliverables, and acceptance criteria. They are the canonical history of why
the code looks the way it does.

---

## Common operations

| Task                                             | Command / pointer                                     |
| ------------------------------------------------ | ----------------------------------------------------- |
| Start the HUD                                    | `pnpm dev`                                            |
| Generate / rotate ingest token                   | `pnpm hud:token` (idempotent)                         |
| Install hooks                                    | `pnpm hud:install-hook` (idempotent)                  |
| Uninstall hooks                                  | `pnpm hud:uninstall-hook`                             |
| Inject a synthetic event (no Claude Code needed) | `./apps/hud/scripts/synth-event.sh tool.use Bash`     |
| Lint / typecheck / test                          | `pnpm lint && pnpm typecheck && pnpm test`            |
| View the rolling JSONL log                       | `tail -f data/events-$(date -u +%Y-%m-%d).jsonl`      |
| View Pi kiosk logs                               | `journalctl --user -u kiosk.service -f` (on the Pi)   |
| Exit Pi kiosk                                    | `Ctrl+Alt+F2` → `systemctl --user stop kiosk.service` |

---

## Troubleshooting starting points

| Symptom                               | First place to look                                                                          |
| ------------------------------------- | -------------------------------------------------------------------------------------------- |
| HUD loads but no events appear        | [`setup/setup-hook.md` § Troubleshooting](./setup/setup-hook.md)                             |
| iPad PWA looks wrong / icon stale     | [`setup/setup-ipad.md` § Troubleshooting](./setup/setup-ipad.md)                             |
| Pi kiosk doesn't auto-launch          | [`setup/setup-raspberry-pi-kiosk.md` § Troubleshooting](./setup/setup-raspberry-pi-kiosk.md) |
| Lint / typecheck fails on fresh clone | `pnpm install` first (the worktree path needs `node_modules`)                                |
| `pnpm hud:token` not found            | Use `pnpm -w run hud:token` (pnpm's colon-handling)                                          |

---

## Related

- [`../README.md`](../README.md) — `docs/` entry point and versioning policy.
- [`README.md`](./README.md) — `v1/` index.
- [`../../README.md`](../../README.md) — repo root.
