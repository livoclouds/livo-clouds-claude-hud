import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { HudEventSchema } from '@livoclouds/contracts';
import { bus } from './bus';

// The sessions poller persists every successful snapshot to this file. The
// HUD reads it on SSR to hydrate the Sessions panel before the first live
// snapshot arrives, closing the "Waiting for sessions snapshot from the
// poller…" race that happens after a server restart (the in-memory bus
// starts empty and the poller's next post can be up to SESSIONS_HEARTBEAT_S
// seconds away).
const SNAPSHOT_PATH =
  process.env.HUD_LAST_SNAPSHOT_FILE ??
  path.join(process.env.HOME ?? '', '.claude', 'hud-last-sessions-snapshot.json');

// Don't replay a stale snapshot — if the file is older than this the poller
// is probably dead and the dashboard would mislead the user. The dashboard's
// own staleness banner also kicks in at 30 s of poll silence; this matches.
const MAX_AGE_MS = 5 * 60_000;

let attemptedThisProcess = false;

export function bootstrapSessionsSnapshot(): void {
  // The bus is process-singleton; we only need to bootstrap once per process.
  // A second SSR call has nothing new to learn from disk.
  if (attemptedThisProcess) return;
  attemptedThisProcess = true;

  if (!SNAPSHOT_PATH || !existsSync(SNAPSHOT_PATH)) return;

  // If the bus already has a sessions.snapshot (e.g. the poller posted before
  // the first SSR call), there's nothing to bootstrap.
  const existing = bus.snapshot();
  for (const env of existing) {
    if (env.event.type === 'sessions.snapshot') return;
  }

  let raw: string;
  try {
    raw = readFileSync(SNAPSHOT_PATH, 'utf-8');
  } catch {
    return;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return;
  }

  const result = HudEventSchema.safeParse(parsed);
  if (!result.success || result.data.type !== 'sessions.snapshot') return;

  if (Date.now() - result.data.ts > MAX_AGE_MS) return;

  bus.publish(result.data);
}
