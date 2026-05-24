# Measurement methodology

Every phase in this audit has a "Before / After" section. The numbers
that go into it must come from the same measurement procedure so that
results are comparable across PRs and across audit versions. This
document is the playbook.

All measurements assume the HUD is running on its default port
(`HUD_PORT=4000`) and that at least one real Claude Code session is
generating events.

---

## Budget 1 — First paint on iPad over LAN

**Target:** < 1.5 s (CLAUDE.md §11).

**How to measure:**

1. Put the iPad on the same LAN as the HUD host.
2. In Safari on the iPad, open Develop → `<MacBook>` → `Web Inspector`
   from a paired Mac.
3. Load `http://<host>:4000/` cold (close the tab, clear it from the
   open-tabs list, then reopen).
4. In Web Inspector → **Timelines** → Network, read the **First
   Contentful Paint** marker.
5. Repeat 5 times. Record the median.

**Variables to hold constant:** same Wi-Fi network, same iPad model,
same Safari version, no other apps in the background, the bus already
warm (let the page run once before measuring).

---

## Budget 2 — Ingest → screen p95

**Target:** < 500 ms p95 (CLAUDE.md §11).

**How to measure:**

1. From the host, run a script that POSTs `tool.use` events to
   `http://127.0.0.1:4000/api/events` with a `ts` of `Date.now()` and a
   sequential `sessionId` like `bench-XXXX`.
2. On a connected client (Safari with Web Inspector), instrument the
   SSE handler in `apps/hud/lib/sse-client.ts` to log
   `Date.now() - event.ts` for events whose `sessionId` starts with
   `bench-`.
3. Send 1 000 events at 20 ms intervals. Collect the 1 000 latencies.
4. The p95 is the 950th value in the sorted list.

**Variables to hold constant:** single client, no other tabs subscribed,
the bus not at capacity (start fresh if needed).

---

## Budget 3 — Mascot at 60 fps

**Target:** ≥ 55 fps median during 30 s of interactive scrolling on
iPad 2021 (CLAUDE.md §11). Below 55 the user perceives jank.

**How to measure:**

1. On iPad Safari with Web Inspector attached, open Live with at
   least 50 sessions in the Sessions panel.
2. In Web Inspector → **Timelines** → start a Rendering Frames
   recording.
3. Scroll the page up-down for 30 s, then trigger an animation-heavy
   state (invoke a subagent so the mascot transitions to `running`).
4. Stop the recording. Read the median frame duration. Convert to fps
   with `1000 / medianMs`.

**Variables to hold constant:** same iPad model, same orientation,
roughly the same number of sessions in the snapshot.

---

## Budget 4 — Client RSS over 24 h

**Target:** < 150 MB RSS (CLAUDE.md §11).

**How to measure (Safari on iPad is opaque about RSS; use desktop
Safari as a proxy):**

1. Open the HUD in a fresh Safari window on the same MacBook used as
   host.
2. In Web Inspector → **Memory** → take a Heap Snapshot every hour
   for 24 h.
3. Plot heap size over time. Trend should be flat. A monotonic upward
   trend is a leak.

A proper iPad measurement requires either Instruments via Xcode or a
hand-installed `wkwebview` instrumenter, both of which are out of
scope for v1. The desktop Safari proxy is what we use.

---

## Budget 5 — Server RSS over 24 h

**Target:** Flat over 24 h. No absolute number — the host has plenty
of RAM — but a leak would still indicate a problem.

**How to measure:**

```bash
while sleep 300; do
  pid=$(pgrep -f 'next-server')
  printf '%s rss_kb=%s\n' "$(date -u +%FT%TZ)" "$(ps -p "$pid" -o rss=)" \
    >> /tmp/hud-rss-trace.log
done
```

Plot the result. A flat line is healthy. A staircase suggests a leak
in the bus or SSE subscribers (see findings H1 and H3).

---

## Budget 6 — CPU spent in pollers

**Target:** < 2 % sustained on an M-series MacBook (per poller).

**How to measure:**

```bash
top -pid $(pgrep -f sessions-poller.sh) -l 60 -s 1 -stats pid,cpu,rsize \
  | awk 'NR>1 { sum += $2; n++ } END { print "avg cpu%:", sum/n }'
```

Run for 60 s with the host warm. Repeat for `transcript-poller.sh`.

---

## Where measurements live

Each phase MD has a **Before / After** section. Paste the raw
measurement command and the result there, with the date. Example
formatting:

```
| Metric | Before (2026-05-24) | After (2026-06-12) | Target |
|---|---|---|---|
| First paint (median, 5 runs) | 1820 ms | 1240 ms | < 1500 ms |
| p95 ingest → screen | 720 ms | 410 ms | < 500 ms |
| Mascot median fps (50 sessions) | 38 | 58 | ≥ 55 |
```

Two-decimal precision is enough for everything except fps (integer).
