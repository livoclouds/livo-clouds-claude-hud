// Node-only implementation of the instrumentation hook. Imported
// dynamically from `instrumentation.ts` under `NEXT_RUNTIME === 'nodejs'`,
// so the Node-only modules below are never inspected by the Edge bundler.
//
// Spawns the sidecar pollers as child processes and kills them cleanly on
// server shutdown:
//   - hooks/sessions-poller.sh    — feeds the Sessions panel
//   - hooks/transcript-poller.sh  — feeds Tokens / Cost / Context cards
//
// Opt out with HUD_DISABLE_POLLER=1 or HUD_DISABLE_TRANSCRIPT_POLLER=1.

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

type PollerSpec = {
  /** Identifier for log lines and the dedupe flag. */
  key: 'sessions' | 'transcript';
  /** File name under hooks/ to spawn. */
  scriptName: string;
  /** Env var that, when set to "1", skips spawning this poller. */
  disableEnv: string;
  /** Human-readable hint shown when the poller bails on startup. */
  configHint: string;
};

const POLLERS: ReadonlyArray<PollerSpec> = [
  {
    key: 'sessions',
    scriptName: 'sessions-poller.sh',
    disableEnv: 'HUD_DISABLE_POLLER',
    configHint:
      'check ~/.claude/livo-clouds-hud.env exists with HUD_INGEST_TOKEN. Run `pnpm hud:token` to generate one.',
  },
  {
    key: 'transcript',
    scriptName: 'transcript-poller.sh',
    disableEnv: 'HUD_DISABLE_TRANSCRIPT_POLLER',
    configHint:
      'check ~/.claude/livo-clouds-hud.env exists with HUD_INGEST_TOKEN and packages/contracts/src/pricing.json is present.',
  },
] as const;

for (const spec of POLLERS) {
  if (process.env[spec.disableEnv] === '1') {
    console.log(`[poller:${spec.key}] auto-start disabled via ${spec.disableEnv}=1`);
    continue;
  }
  startPoller(spec);
}

function startPoller(spec: PollerSpec) {
  // Dedupe: in dev with hot-reload, instrumentation can be evaluated more
  // than once per server process. A module-level flag would be reset on
  // reload; pinning it to globalThis is what survives.
  const flagKey = `__hudPollerStarted_${spec.key}` as const;
  const g = globalThis as unknown as Record<string, boolean | undefined>;
  if (g[flagKey]) return;
  g[flagKey] = true;

  // The HUD app lives at apps/hud; the pollers at hooks/<script>. `next dev`
  // runs from the app directory, so two-levels-up is the monorepo root. If
  // someone runs the HUD with a different cwd we also try the current cwd.
  const candidates = [
    path.resolve(process.cwd(), '../../hooks', spec.scriptName),
    path.resolve(process.cwd(), 'hooks', spec.scriptName),
  ];
  const pollerPath = candidates.find((p) => existsSync(p));
  if (!pollerPath) {
    console.warn(
      `[poller:${spec.key}] could not locate hooks/${spec.scriptName}; the affected panel will stay empty.`,
    );
    g[flagKey] = false;
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

  console.log(`[poller:${spec.key}] started pid=${child.pid} (${path.basename(pollerPath)})`);

  child.stdout?.on('data', (b: Buffer) => {
    process.stdout.write(`[poller:${spec.key}] ${b.toString()}`);
  });
  child.stderr?.on('data', (b: Buffer) => {
    process.stderr.write(`[poller:${spec.key}] ${b.toString()}`);
  });

  child.on('exit', (code, signal) => {
    g[flagKey] = false;
    const elapsed = Date.now() - startedAt;
    if (elapsed < 1500 && (code === 0 || code === null)) {
      // The poller bails silently (exit 0) when its config is missing or
      // the bearer token isn't set. Surface a hint so the user isn't left
      // wondering why the affected panel never populates.
      console.warn(`[poller:${spec.key}] exited immediately — ${spec.configHint}`);
    } else if (signal) {
      console.log(`[poller:${spec.key}] stopped (signal=${signal})`);
    } else {
      console.warn(`[poller:${spec.key}] exited unexpectedly code=${code}`);
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
