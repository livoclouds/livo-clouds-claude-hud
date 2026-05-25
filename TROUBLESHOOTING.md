# Troubleshooting Guide

Structured diagnostic paths for common operator failure modes.

---

## 1. Pollers not starting

**Symptom:** The Sessions panel or the Tokens / Cost / Context cards remain empty after startup, and no poller activity appears in the server log.

**Check env flags:**
```bash
# These must NOT be set to "1" for the relevant poller to start.
echo $HUD_DISABLE_POLLER              # sessions poller
echo $HUD_DISABLE_TRANSCRIPT_POLLER  # transcript poller
```

**Check session directory access:**
```bash
ls ~/.claude/sessions/
```
The sessions poller reads from this directory. If it does not exist or is unreadable, the poller will exit immediately.

**Look for in server logs:**
```
[poller:sessions] exited immediately — check ~/.claude/livo-clouds-hud.env ...
[poller:transcript] exited immediately — ...
instrumentation: poller sessions failed
```

**Check the poller log files:**
```bash
tail -50 logs/poller-sessions.log
tail -50 logs/poller-sessions.err.log
```

**Check that the bearer token is configured:**
```bash
cat ~/.claude/livo-clouds-hud.env  # should contain HUD_INGEST_TOKEN=...
```
Pollers send `POST /api/events` on each scan cycle. Without the token, the server rejects every request and the poller exits.

---

## 2. SSE client in rapid reconnect loop

**Symptom:** The browser DevTools Network tab shows repeated connections to `/api/stream`, disconnecting within a few seconds each time.

**Check the bearer token:**
The HUD client uses `EventSource` with no custom headers (SSE is header-limited in browsers). Authentication failures are surfaced differently for the ingest endpoint vs. the stream. If you see a 401 in the Network tab, the token on the hook side does not match `HUD_INGEST_TOKEN`.

**Check for backpressure ejection:**
Open DevTools → Network → select the `/api/stream` request → EventStream tab. Look for an event named `bp-disconnect`:
```
event: bp-disconnect
data: {"reason":"backpressure"}
```
This means the HUD disconnected a slow consumer. The client reconnects automatically; frequent ejections indicate the client is reading too slowly (e.g., a locked iPad with a backgrounded tab and high event volume). Adjust `HUD_SSE_BACKPRESSURE_BYTES` and `HUD_SSE_BACKPRESSURE_GRACE_S` in `.env.local`.

**Look for network errors:**
- `401 Unauthorized` on `POST /api/events` → bearer token mismatch
- `403 Forbidden` → token present but wrong
- `503 Service Unavailable` on ingest → server is draining (shutting down); restart it

---

## 3. Sessions list empty despite active Claude Code session

**Symptom:** Claude Code is running, but the Sessions panel shows no entries.

**Check `HUD_SESSIONS_DIR`:**
If you have set `HUD_SESSIONS_DIR`, confirm it points to the directory where Claude Code writes its session files:
```bash
ls "${HUD_SESSIONS_DIR:-$HOME/.claude/sessions}/"
```

**Check the sessions poller log for parse errors:**
```bash
grep -i "error\|warn\|fail" logs/poller-sessions.log | tail -20
```

**Verify Claude Code is running hooks:**
Open `~/.claude/settings.json` and confirm a `hooks` entry exists that calls `hooks/claude-hook.sh` (or your equivalent). Without registered hooks, no events are posted to the HUD.

**Check the poller heartbeat:**
The sessions poller emits a `sessions.snapshot` event on every scan cycle. If the poller is running but snapshots never reach the client, check the network path between Claude Code's machine and the HUD machine (port, firewall, `HUD_URL` in the hook script).

---

## 4. HUD stops updating events

**Symptom:** The HUD was updating normally, then froze. New Claude Code activity is not reflected.

**Check the SSE stream is still open:**
In DevTools → Network → `/api/stream` → EventStream: if the tab is empty and no new events appear, the stream has closed. The SSE client reconnects automatically; check for repeated connection attempts.

**Check ingest is reaching the server:**
```bash
# On the Claude Code machine, verify the hook is posting successfully:
tail -20 ~/.claude/hud-hook.log
```
A `POST /api/events` returning `503` means the server is in draining mode (SIGTERM received). Restart the HUD.

**Check the bus has not stalled:**
```bash
curl -s http://localhost:4000/api/health | jq '{lastEventAgo, subscribers}'
```
If `lastEventAgo` is very large and `subscribers` > 0, events are reaching the server but not flowing to the SSE subscribers. Restart the HUD.

---

## 5. Disk space growth

**Symptom:** The `data/` directory is consuming excessive disk space, or you receive a storage alert on a Raspberry Pi SD card.

**Identify the log files:**
```bash
du -sh data/events-*.jsonl data/events-*.jsonl.{1,2,3} 2>/dev/null | sort -rh | head -10
```

**Tune rotation and retention:**
In `apps/hud/.env.local`:
```bash
# Maximum size per JSONL file before rotation (default 100 MB).
# On a Raspberry Pi, lower to 10 MB to reduce SD card wear.
HUD_LOG_MAX_SIZE_MB=10

# Days to keep rotated files (default 7).
# Set to 1 for aggressive cleanup.
HUD_LOG_RETENTION_DAYS=1
```

**Manual cleanup (rotated files only):**
```bash
rm -f data/events-*.jsonl.1 data/events-*.jsonl.2 data/events-*.jsonl.3
```
Do not delete the current active `.jsonl` file while the HUD is running — it may be mid-write.

---

## 6. High memory / RSS growth

**Symptom:** The HUD process RSS is growing over time without plateauing.

**Check the health endpoint:**
```bash
curl -s http://localhost:4000/api/health | jq '{rss, subscribers, eventsTotal}'
```
- `rss` — resident set size in bytes. Should stabilise at roughly the bus capacity × average event size.
- `subscribers` — active SSE connections. Should be the number of open browser tabs connected to `/api/stream`.

**Diagnose subscriber leak:**
If `subscribers` is growing monotonically across restarts of the browser, a zombie subscriber accumulation is occurring. Zombie subscribers are cleaned up by the 60-second sweep in `lib/sse.ts`, but if their write queue is not draining, they can persist longer. Signs:
- `subscribers` > 50 (more than a handful of open tabs)
- `rss` increases ~proportional to `subscribers`

**Check extended diagnostics:**
```bash
curl -s -H "Authorization: Bearer $HUD_INGEST_TOKEN" \
  http://localhost:4000/api/internal/stats | jq .
```
Look at `backpressureEjections` — a high count means slow consumers are being disconnected. If `subscribers` is simultaneously high, some disconnections may not be completing.

**Restart as last resort:**
The HUD state is in-memory only. A clean restart drops all subscribers, clears the bus (events are not replayed from the JSONL log on startup), and returns RSS to baseline.
