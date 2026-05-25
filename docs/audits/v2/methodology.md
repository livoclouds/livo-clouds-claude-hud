# Measurement methodology — v2

This document extends the [v1 methodology](../v1/methodology.md) with
additional measurement procedures for v2's new finding categories:
device-adaptive UX and operational readiness.

All budgets from [CLAUDE.md §11](../../../CLAUDE.md) remain in force.
Refer to [v1 methodology](../v1/methodology.md) for: first-paint, ingest →
screen p95, mascot fps, client RSS, server RSS, and poller CPU.

---

## Budget 7 — Touch target compliance

**Target:** All interactive elements ≥ 44 × 44 pt on iPad (CLAUDE.md §10).

**How to measure:**

1. Open the HUD in Safari on an iPad with Web Inspector from a paired Mac.
2. In the Elements panel, select each interactive element class (buttons,
   chips, nav items).
3. Read `offsetWidth` × `offsetHeight` from the Computed panel.
4. Alternatively: Chrome DevTools → Device Toolbar → Rendering → "Show
   tap targets". Red overlays indicate elements below 44 × 44.
5. Record pass/fail per element class: NavBar items, pin/unpin buttons,
   collapse chevrons, filter chips, session card rows.

---

## Budget 8 — Responsive layout correctness

**Target:** No layout overflow or cropped text at any of the three
canonical breakpoints.

**How to measure:**

1. Open the HUD in Chrome DevTools, Device Toolbar enabled.
2. Test at three sizes: **375 × 812** (mobile), **820 × 1180** (tablet
   portrait), **1280 × 800** (desktop).
3. At each size confirm:
   - Correct nav variant (bottom on mobile/tablet, sidebar on desktop).
   - Metric grid columns (1 / 3 / 4 respectively).
   - Sessions view (card on mobile+tablet, table on desktop).
   - No horizontal overflow.
4. Also test at **1440 × 900** for kiosk mode — viewport should fill,
   no dead space beyond `max-w-screen-xl`.

---

## Budget 9 — Color contrast (WCAG AA)

**Target:** All text elements ≥ 4.5:1 ratio against background (WCAG 2.1 AA).

**How to measure:**

```bash
npm install -g @axe-core/cli

# Dark theme (default)
axe http://localhost:4000/ --rules color-contrast

# Light theme
axe http://localhost:4000/?theme=light --rules color-contrast
```

Record: element selector, actual ratio, required ratio.

---

## Budget 10 — Health endpoint response time

**Target:** `/api/health` < 50 ms p99 under no load.

**How to measure:**

```bash
for i in $(seq 1 100); do
  curl -s -o /dev/null -w '%{time_total}\n' http://localhost:4000/api/health
done | awk '{ s[NR] = $1*1000 } END {
  asort(s); n = NR;
  printf "p50: %.1f ms\np99: %.1f ms\n", s[int(n*0.50)], s[int(n*0.99)]
}'
```

---

## Budget 11 — Graceful shutdown drain time

**Target:** All SSE clients receive `shutdown` event and reconnect within
10 s of SIGTERM.

**How to measure:**

1. Start: `pnpm dev`. Open 3 browser tabs at `http://localhost:4000/`.
2. Confirm SSE connections active in DevTools → Network → EventStream.
3. `kill -TERM $(pgrep -f next-server)`.
4. Observe: each tab's EventStream should receive `data: {"type":"shutdown"}`.
5. Within 10 s all tabs should show "Reconnecting…" in ConnectionBanner.
6. Record: time from SIGTERM to `shutdown` event; time to all clients reconnected.

---

## Budget 12 — Bundle size

**Target:** Total client JS < 250 KB gzipped; no single chunk > 150 KB.

**How to measure:**

```bash
pnpm --filter hud build

find apps/hud/.next/static/chunks -name '*.js' | while read f; do
  size=$(gzip -c "$f" | wc -c)
  echo "$size $f"
done | sort -rn | head -20
```

Or with `ANALYZE=true pnpm --filter hud build` if `@next/bundle-analyzer`
is configured (Phase 5 adds this).

---

## Where measurements live

Each phase MD has a **Before / After** section:

```
| Metric | Before (2026-05-24) | After | Target |
|---|---|---|---|
| Smallest pin button | 28 × 28 px | 44 × 44 px | ≥ 44 × 44 |
| WCAG AA failures (dark) | 4 elements | 0 | 0 |
| Total client JS gzipped | — MB | — KB | < 250 KB |
```
