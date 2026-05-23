# Phase 9 — Raspberry Pi 5 Kiosk

| Field | Value |
|---|---|
| Phase ID | `phase-9` |
| Status | 🟢 Complete |
| Depends on | `phase-7` |
| Blocks | — |
| Target outcome | A Raspberry Pi 5 with a small HDMI panel boots directly into the HUD running in Chromium kiosk mode |

---

## Overview

**This phase is opt-in.** It documents how to deploy the HUD as a dedicated
kiosk on a Raspberry Pi 5 panel — for users who want a physically separate,
always-on companion screen. The Pi does not run Claude Code; it only renders.

## Goals

- A reproducible setup guide from blank Pi OS to working HUD kiosk.
- A `systemd --user` unit that launches Chromium in kiosk mode at boot.
- Optional rotation handling for portrait-mounted panels.
- Touch-input verification on a capacitive panel (if present).

## In Scope

- `docs/v1/setup/setup-raspberry-pi-kiosk.md` — full guide.
- `deploy/raspberry-pi/` — small set of scripts:
  - `setup.sh` — apt installs, Chromium config, unclutter.
  - `kiosk.service` — systemd user unit template.
  - `xrandr-rotate.sh` — rotation helper for portrait panels.
- Hardware compatibility notes (Waveshare / Pimoroni panels, official 7" touch).

## Out of Scope

- Running Claude Code on the Pi. The Pi is a sink, not a source.
- A bespoke distro image. We target stock Raspberry Pi OS (Bookworm or newer).
- Battery / UPS guidance. Power management is operator concern.

## Open Decisions

### D-9.1 — Browser — Resolved (default)

**Decision**: **Chromium** launched as `chromium-browser --kiosk
--app="$HUD_URL"` from a systemd user unit, with `--noerrdialogs
--disable-infobars --disable-translate --disable-features=TranslateUI
--disable-session-crashed-bubble --disable-component-update --no-first-run
--no-default-browser-check --check-for-update-interval=31536000
--overscroll-history-navigation=0 --password-store=basic
--user-data-dir=%h/.local/share/livo-clouds-hud-kiosk`. Best SSE + PWA support
on Pi OS. Firefox-ESR remains a community fallback (not delivered).

### D-9.2 — Network model — Resolved (default)

**Decision**: LAN-first by default — `HUD_URL` points at the dev machine's
LAN address or `*.local`. Tailscale is documented in the operator guide as
an optional alternative; no Tailscale config or auth keys ship in the repo.

### D-9.3 — Rotation — Resolved (default)

**Decision**: `~/.local/bin/xrandr-rotate.sh` runs as a unit `ExecStartPre`.
It reads `ROTATE` from `~/.config/livo-clouds-hud-kiosk.env`. Empty or
invalid → silently exits 0 (kiosk still starts). Valid values:
`normal | left | right | inverted`. Touch coordinate remapping after
rotation is documented as a manual `xinput` step in the operator guide.

## Deliverables

```
deploy/raspberry-pi/
├── setup.sh
├── kiosk.service
└── xrandr-rotate.sh

docs/v1/setup/
└── setup-raspberry-pi-kiosk.md
```

## Acceptance Criteria

- Following `setup-raspberry-pi-kiosk.md` from a freshly imaged Pi OS leads to
  a Pi that boots into the HUD with no manual login.
- The screen never sleeps; the cursor is hidden after 1 s of inactivity.
- A rebooted Pi recovers the HUD automatically.
- Touch input (on a capacitive panel) drives the same gestures as iPad.
- Network drop and recover behaves like the iPad case (banner, reconnect).

## Tasks

1. Author the setup guide step by step on a real Pi 5.
2. Iterate on `setup.sh` to make it idempotent.
3. Test the kiosk systemd unit across reboots and crashes.
4. Capture screenshots of the working kiosk to embed in the guide.
5. Document the touch-panel calibration steps if applicable.
6. PR titled `docs+deploy: Raspberry Pi 5 kiosk (Phase 9)`.

## Risks

- **Chromium GPU instability** on Pi OS minor releases. Mitigation: pin the OS
  version in the guide and note tested combinations.
- **Touch driver gaps** on third-party panels. Mitigation: list panels we have
  verified; leave others as community-validated.

## Related

- [`./phase-8-pwa-ipad.md`](./phase-8-pwa-ipad.md) — sibling kiosk path on iPad.
- [`../architecture.md`](../architecture.md) — Pi is a sink in the topology.
- [`../setup/setup-raspberry-pi-kiosk.md`](../setup/setup-raspberry-pi-kiosk.md) —
  operator guide produced by this phase.

## Change Log

- **Sealed** — Phase 9 delivered as `docs+deploy: Raspberry Pi 5 kiosk
  (Phase 9)`. Shipped:
  - `deploy/raspberry-pi/setup.sh` — idempotent apt + systemd installer.
  - `deploy/raspberry-pi/kiosk.service` — Chromium kiosk systemd user unit
    with `Restart=always` and `xset` blanking guards.
  - `deploy/raspberry-pi/xrandr-rotate.sh` — opt-in portrait rotation helper.
  - `docs/v1/setup/setup-raspberry-pi-kiosk.md` — full operator guide
    (prerequisites, X11 switch, autologin, installer, rotation, touch
    remap, verify, maintenance, troubleshooting, Tailscale pointer).
  - D-9.1 / D-9.2 / D-9.3 resolved at their defaults.
