// Next.js 16 instrumentation hook. Runs once when the Node.js server starts
// (both `next dev` and `next start`). We use it to auto-launch the sessions
// poller — the sidecar that watches ~/.claude/sessions/*.json and POSTs
// `sessions.snapshot` events back to /api/events so the SessionsDashboard
// can show every running Claude Code session on this host.
//
// The poller used to require a second terminal (`nohup hooks/sessions-poller.sh &`).
// Auto-starting it from the server lifecycle removes that step — `pnpm dev`
// is the only command the user needs to run.
//
// Opt out: set `HUD_DISABLE_POLLER=1` to skip auto-start (useful when running
// the HUD on a remote device, e.g., an iPad, where the source Mac is the one
// that should be polling).

export async function register() {
  // Edge runtime can't spawn child processes. The instrumentation file is
  // also loaded under the edge runtime for middleware; ignore it there.
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  // During `next build` Next.js executes instrumentation to collect routes,
  // but we don't want to launch a long-running daemon during a build step.
  if (process.env.NEXT_PHASE === 'phase-production-build') return;

  if (process.env.HUD_DISABLE_POLLER === '1') {
    console.log('[poller] auto-start disabled via HUD_DISABLE_POLLER=1');
    return;
  }

  // Dedupe: in dev with hot-reload, instrumentation can be evaluated more
  // than once per server process. A module-level flag would be reset on
  // reload; pinning it to globalThis is what survives.
  const g = globalThis as unknown as { __hudPollerStarted?: boolean };
  if (g.__hudPollerStarted) return;
  g.__hudPollerStarted = true;

  const [{ spawn }, { existsSync }, path] = await Promise.all([
    import('node:child_process'),
    import('node:fs'),
    import('node:path'),
  ]);

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
