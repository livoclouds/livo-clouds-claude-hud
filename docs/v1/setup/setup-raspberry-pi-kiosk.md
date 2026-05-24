# Setup — Raspberry Pi 5 Kiosk

This guide takes a stock Raspberry Pi 5 from "fresh Pi OS install" to a dedicated
kiosk that boots straight into the HUD in Chromium full-screen — no manual login,
no cursor, no screen sleep, and graceful recovery from short LAN drops.

The Pi is a **sink, not a source**. It only renders the HUD that runs on your
development machine. It never runs Claude Code and it never sees the ingest
token — only the public HUD URL on the LAN (or via Tailscale).

This phase is **opt-in**. The iPad path in [`./setup-ipad.md`](./setup-ipad.md)
is the simpler default. Use the Pi when you want a permanent, dedicated companion
screen on the desk.

---

## Prerequisites

- A **Raspberry Pi 5** (4 GB or 8 GB) with a power supply rated for it.
- A microSD card (≥ 16 GB) flashed with **Raspberry Pi OS Bookworm 64-bit**
  (tested release: 2025-10-22 image based on Debian 12).
- A display the Pi can drive. Tested combinations:

  | Panel | Connection | Touch | Notes |
  |---|---|---|---|
  | Official Raspberry Pi 7" Touch Display v1 | DSI | ✅ capacitive | Works out of the box. |
  | Official Raspberry Pi 7" Touch Display 2 | DSI | ✅ capacitive | Works out of the box. |
  | Waveshare 7" HDMI capacitive (1024×600) | HDMI + USB touch | ✅ capacitive | Works; may need `xinput` calibration after rotation. |
  | Generic 1080p HDMI monitor | HDMI | ❌ | Works; no touch — use a Bluetooth/USB pointer for setup only. |
  | Pimoroni HyperPixel 4.0 | DSI overlay | ✅ | Community-tested only. Needs vendor `dtoverlay` line in `/boot/firmware/config.txt`. |

- The HUD running and reachable from the Pi on the LAN. Confirm the URL works
  by opening it in Chromium manually before installing the kiosk service.
- Optional: a Tailscale account if you want the Pi to reach the HUD from a
  remote network.

---

## One-time setup

### 1. Flash Raspberry Pi OS

Use **Raspberry Pi Imager** on your laptop:

1. Choose **Raspberry Pi OS (64-bit)** (Bookworm).
2. Click the gear icon → set hostname (e.g. `hud-kiosk`), enable SSH, configure
   the user account, and pre-fill your WiFi credentials. This avoids a
   keyboard-and-monitor first boot.
3. Write the card, insert it into the Pi 5, and power on.

The Pi will reboot once during the first-boot wizard and land on the Bookworm
desktop.

### 2. Switch to X11 and enable Desktop Autologin

Bookworm ships **Wayland (labwc)** by default. The kiosk service relies on
`xrandr` (rotation) and `unclutter` (cursor hiding), both of which are X11-only.
Switch the session manager once:

```sh
sudo raspi-config
```

In the menu:

- **Advanced Options → Wayland → X11** — confirm and exit.
- **System Options → Boot / Auto Login → Desktop Autologin** — confirm.

Choose **Finish**, let the Pi reboot.

After reboot the Pi should land on the desktop automatically with no password
prompt.

### 3. Update packages

```sh
sudo apt-get update
sudo apt-get upgrade -y
```

### 4. Verify the HUD URL loads

From the Pi desktop, open Chromium and navigate to the HUD URL — e.g.
`http://hud.local:4000/` or `http://192.168.1.20:4000/`. Confirm the live view
renders and the mascot is animating. If the page does not load, fix LAN
reachability before installing the kiosk service.

If you plan to use Tailscale, install it first (`curl -fsSL https://tailscale.com/install.sh | sh && sudo tailscale up`) and verify the
`*.ts.net` URL loads in Chromium.

### 5. Install the kiosk service

Copy the `deploy/raspberry-pi/` folder to the Pi (clone the repo, or `scp` just
that folder). Then, on the Pi as the kiosk user (not root):

```sh
bash deploy/raspberry-pi/setup.sh
```

The script:

- Installs the apt packages: `chromium-browser`, `unclutter`,
  `x11-xserver-utils`, `xdotool`, `xinput`, `xserver-xorg`.
- Drops `kiosk.service` into `~/.config/systemd/user/`.
- Drops `xrandr-rotate.sh` into `~/.local/bin/`.
- Creates `~/.config/livo-clouds-hud-kiosk.env` (only if missing) with
  `HUD_URL=` and `ROTATE=` placeholders.
- Enables **linger** for your user so the systemd user instance survives logout
  and starts at boot.
- Enables `kiosk.service`.

The script is idempotent. Re-run it any time without harm.

### 6. Configure HUD URL (and optional rotation)

Edit the config file:

```sh
nano ~/.config/livo-clouds-hud-kiosk.env
```

Set:

```sh
HUD_URL=http://hud.local:4000/
# Optional. Leave empty for landscape. Valid: normal, left, right, inverted.
ROTATE=
```

For a portrait-mounted panel, try `ROTATE=left` first (most 7" panels).

### 7. Start the kiosk

```sh
systemctl --user restart kiosk.service
```

Chromium should switch to full-screen on the HUD within ~2 seconds.

To verify the full unattended boot path, reboot:

```sh
sudo reboot
```

When the Pi comes back up it should land on the HUD with no manual login,
no desktop visible, no Chromium toolbar.

### 8. (Optional) Remap touch input after rotation

If you set `ROTATE=left` or `ROTATE=right`, touch coordinates from the panel
won't match the rotated display until you tell X about it. Find the device:

```sh
xinput list
```

Note the touchscreen's `id=`. Then apply the matrix:

```sh
# left  (90° counter-clockwise)
xinput set-prop <id> 'Coordinate Transformation Matrix'  0 -1 1   1 0 0   0 0 1
# right (90° clockwise)
xinput set-prop <id> 'Coordinate Transformation Matrix'  0  1 0  -1 0 1   0 0 1
# inverted (180°)
xinput set-prop <id> 'Coordinate Transformation Matrix' -1  0 1   0 -1 1  0 0 1
```

To persist across reboots, drop the command into `~/.config/autostart/`
(see `xinput`'s notes for the device-name form) or into your X session script.

---

## Verify

After the steps above, confirm:

- The HUD launches at boot with **no Chromium chrome** and no URL bar.
- The **cursor disappears** within ~1 second of staying still.
- The screen does not blank during a 10-minute idle window.
- A `sudo reboot` recovers the HUD unattended.
- A simulated Chromium crash recovers automatically:
  ```sh
  pkill -KILL chromium-browser
  ```
  Chromium relaunches within ~2 seconds via `Restart=always`.
- Toggling WiFi off and on shows the `ConnectionBanner` from
  [Phase 8](../phases/phase-8-pwa-ipad.md), then clears it within a second of
  reconnect. The live stream resumes from the last received event
  (`Last-Event-ID` replay from [Phase 3](../phases/phase-3-backend.md)).
- Touch gestures (swipe left/right between views, long-press on a metric,
  swipe-down to dismiss the metric sheet) behave identically to iPad.

---

## Maintenance

### Exit the kiosk

The kiosk has no quit button by design. Drop to a TTY and stop the unit:

1. Press `Ctrl+Alt+F2` to switch to a text console.
2. Log in.
3. Stop the kiosk: `systemctl --user stop kiosk.service`.
4. Optionally disable boot-on-reboot: `systemctl --user disable kiosk.service`.
5. Return to the desktop: `Ctrl+Alt+F7`.

### View logs

```sh
journalctl --user -u kiosk.service -f
```

### Change the HUD URL or rotation

Edit `~/.config/livo-clouds-hud-kiosk.env` and restart:

```sh
systemctl --user restart kiosk.service
```

### Re-run the installer after a repo update

```sh
bash deploy/raspberry-pi/setup.sh
systemctl --user restart kiosk.service
```

---

## Troubleshooting

**Chromium starts with a toolbar / not full-screen.**
The session is still on Wayland. Re-run `sudo raspi-config` →
**Advanced Options → Wayland → X11**, reboot.

**Cursor is still visible.**
`unclutter` is X11-only — same fix as above. Also check the unit is running:
`systemctl --user status kiosk.service`.

**Screen blanks after a few minutes.**
Bookworm's XDG autostart may re-enable DPMS. The kiosk unit calls `xset s off
-dpms s noblank` on every start, so a `systemctl --user restart kiosk.service`
clears it. For a stricter fix, also disable the autostart entries:
`mkdir -p ~/.config/autostart && cp /etc/xdg/autostart/xscreensaver.desktop
~/.config/autostart/ 2>/dev/null && echo 'Hidden=true' >>
~/.config/autostart/xscreensaver.desktop`.

**Kiosk does not start after a fresh reboot.**
The `linger` flag is missing or didn't take. Verify:
`loginctl show-user "$USER" | grep Linger`. Expect `Linger=yes`. If not,
re-run `sudo loginctl enable-linger "$USER"` and reboot.

**Touch coordinates are wrong after rotation.**
See step 8 above — apply the `xinput Coordinate Transformation Matrix` that
matches your `ROTATE` value.

**Banner says "Disconnected" even when the Pi is online.**
The HUD lost contact with the dev machine, not the Pi's WiFi. Check that the
dev server is still running (`pnpm dev`) and that the LAN/Tailscale URL still
resolves from the Pi (`curl -sSf "$HUD_URL"`).

**`HUD_URL` is empty in logs.**
The unit reads `~/.config/livo-clouds-hud-kiosk.env`. Make sure the file is
present, owned by the kiosk user, and contains a non-empty `HUD_URL=`. Run
`systemctl --user show kiosk.service -p Environment` to inspect what systemd
sees.

---

## Security notes

- **Never put `HUD_INGEST_TOKEN` on the Pi.** The kiosk only renders a public
  HUD URL — the ingest endpoint is read-write and lives on the dev machine.
- The kiosk runs as a normal user, not root. `sudo` is only used during initial
  apt install and to enable linger.
- All HUD data on screen is event-derived — the HUD validates every payload
  through Zod before rendering, per `CLAUDE.md` §12.

---

## Related

- [`./setup-ipad.md`](./setup-ipad.md) — the iPad PWA kiosk path.
- [`./setup-hook.md`](./setup-hook.md) — wire Claude Code itself to the HUD.
- [`../phases/phase-9-raspberry-pi.md`](../phases/phase-9-raspberry-pi.md) —
  phase doc covering the Pi 5 kiosk deliverables.
- [`../../../CLAUDE.md`](../../../CLAUDE.md) §10 — touch-first UX rules
  this kiosk experience follows.
- [`../../../deploy/raspberry-pi/`](../../../deploy/raspberry-pi/) — the
  installer scripts and systemd unit referenced above.
