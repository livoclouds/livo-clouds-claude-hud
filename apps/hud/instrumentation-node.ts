// Node-only implementation of the instrumentation hook. Imported
// dynamically from `instrumentation.ts` under `NEXT_RUNTIME === 'nodejs'`,
// so the Node-only modules below are never inspected by the Edge bundler.
//
// Spawns `hooks/sessions-poller.sh` as a child process and kills it
// cleanly on server shutdown. Opt out with HUD_DISABLE_POLLER=1.

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

if (process.env.HUD_DISABLE_POLLER === '1') {
  console.log('[poller] auto-start disabled via HUD_DISABLE_POLLER=1');
} else {
  startPoller();
}

function startPoller() {
  // Dedupe: in dev with hot-reload, instrumentation can be evaluated more
  // than once per server process. A module-level flag would be reset on
  // reload; pinning it to globalThis is what survives.
  const g = globalThis as unknown as { __hudPollerStarted?: boolean };
  if (g.__hudPollerStarted) return;
  g.__hudPollerStarted = true;

  // The HUD app lives at apps/hud; the poller at hooks/sessions-poller.sh.
  // `next dev` runs from the app directory, so two-levels-up is the monorepo
  // root. If someone runs the HUD with a different cwd we also try the
  // current cwd as a fallback.
  const candidates = [
    path.resolve(process.cwd(), '../../hooks/sessions-poller.sh'),
    path.resolve(process.cwd(), 'hooks/sessions-poller.sh'),
  ];
  const pollerPath = candidates.find((p) => existsSync(p));
  if (!pollerPath) {
    console.warn(
      '[poller] could not locate hooks/sessions-poller.sh; SessionsDashboard will show "Waiting for sessions snapshot…"',
    );
    g.__hudPollerStarted = false;
    return;
  }

  const startedAt = Date.now();
  const child = spawn('bash', [pollerPath], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: process.env,
    // Don't detach: the child must die when the server dies so we don't
    // leak orphaned pollers between restarts.
    detached: false,
  });

  console.log(`[poller] started pid=${child.pid} (${path.basename(pollerPath)})`);

  child.stdout?.on('data', (b: Buffer) => {
    process.stdout.write(`[poller] ${b.toString()}`);
  });
  child.stderr?.on('data', (b: Buffer) => {
    process.stderr.write(`[poller] ${b.toString()}`);
  });

  child.on('exit', (code, signal) => {
    g.__hudPollerStarted = false;
    const elapsed = Date.now() - startedAt;
    if (elapsed < 1500 && (code === 0 || code === null)) {
      // The poller bails silently (exit 0) when its config is missing or
      // the bearer token isn't set. Surface a hint so the user isn't left
      // wondering why the Sessions panel never populates.
      console.warn(
        '[poller] exited immediately — check ~/.claude/livo-clouds-hud.env exists with HUD_INGEST_TOKEN. Run `pnpm hud:token` to generate one.',
      );
    } else if (signal) {
      console.log(`[poller] stopped (signal=${signal})`);
    } else {
      console.warn(`[poller] exited unexpectedly code=${code}`);
    }
  });

  // Make sure the child dies when the parent dies. Node fires these on
  // Ctrl-C (SIGINT) and on normal `next dev` shutdowns (SIGTERM).
  const cleanup = (signal: NodeJS.Signals | 'exit') => {
    if (child.pid && !child.killed) {
      try {
        child.kill('SIGTERM');
      } catch {
        // Already dead — nothing to do.
      }
    }
    if (signal !== 'exit') {
      // Re-raise the signal so Node's default handler can run after we've
      // cleaned up our child.
      process.kill(process.pid, signal);
    }
  };
  process.once('SIGINT', () => cleanup('SIGINT'));
  process.once('SIGTERM', () => cleanup('SIGTERM'));
  process.once('exit', () => cleanup('exit'));
}
