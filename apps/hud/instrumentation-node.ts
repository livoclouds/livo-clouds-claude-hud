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

import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import {
  initPollers,
  isDraining,
  lifecycleEmitter,
  markPollerDisabled,
  markPollerFailed,
  markPollerFirstData,
  setDraining,
} from '@/lib/lifecycle';
import { drainLogWrites } from '@/lib/log';
import { PollerLogger } from '@/lib/poller-log';

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

// Shared set of active child processes. Populated by startPoller() and
// drained by the module-level signal handlers below. Registering each signal
// exactly once avoids the double-raise loop that occurs when per-poller
// handlers each re-raise the same signal (I1).
const activeChildren = new Set<ChildProcess>();
const activeLoggers = new Set<PollerLogger>();

const PASSTHROUGH_LOGS = process.env.HUD_ENABLE_POLLER_LOG_PASSTHROUGH === '1';
const LOGS_DIR = path.resolve(process.cwd(), 'logs');

const moduleCleanup = (signal: NodeJS.Signals | 'exit') => {
  for (const c of activeChildren) {
    // exitCode === null means the process has not yet exited. !child.killed
    // only reflects whether Node called .kill() — a naturally-exited child
    // has killed === false but exitCode !== null, so calling kill() on it
    // throws ESRCH (I11).
    if (c.pid && c.exitCode === null) {
      try {
        c.kill('SIGTERM');
      } catch {
        // Race: child exited between the guard check and the kill call.
      }
    }
  }
  // Close poller log writers best-effort (fire-and-forget during exit path).
  for (const logger of activeLoggers) {
    void logger.close();
  }
  if (signal !== 'exit') {
    // Re-raise the signal so Node's default handler can run after we've
    // cleaned up our children.
    process.kill(process.pid, signal);
  }
};

process.once('SIGINT', () => moduleCleanup('SIGINT'));
process.once('exit',   () => moduleCleanup('exit'));

// SIGTERM: graceful shutdown sequence (O2).
//   1. Set draining flag — new ingest POSTs will return 503.
//   2. Emit 'shutdown' on lifecycleEmitter — SSE routes write a named
//      shutdown frame to each client and close their connections.
//   3. Wait up to 5 s for in-flight JSONL writes to complete.
//   4. Kill pollers and re-raise SIGTERM to let the default handler exit.
process.once('SIGTERM', () => {
  if (isDraining()) {
    // Already draining (e.g., double-signal); skip the drain wait.
    moduleCleanup('SIGTERM');
    return;
  }

  setDraining();
  lifecycleEmitter.emit('shutdown');

  void drainLogWrites(5_000).then(() => {
    moduleCleanup('SIGTERM');
  });
});

// Pre-register all poller keys so /api/readiness knows what to wait for (O7).
initPollers(POLLERS.map((s) => s.key));

for (const spec of POLLERS) {
  if (process.env[spec.disableEnv] === '1') {
    console.log(`[poller:${spec.key}] auto-start disabled via ${spec.disableEnv}=1`);
    markPollerDisabled(spec.key);
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
    markPollerFailed(spec.key);
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

  activeChildren.add(child);

  // Dedicated log files for poller output; prevents poller shell output from
  // polluting the structured application log in production (O4).
  const stdoutLog = new PollerLogger(path.join(LOGS_DIR, `poller-${spec.key}.log`));
  const stderrLog = new PollerLogger(path.join(LOGS_DIR, `poller-${spec.key}.err.log`));
  activeLoggers.add(stdoutLog);
  activeLoggers.add(stderrLog);

  console.log(`[poller:${spec.key}] started pid=${child.pid} (${path.basename(pollerPath)})`);

  let firstDataReceived = false;

  child.stdout?.on('data', (b: Buffer) => {
    stdoutLog.write(b);
    if (PASSTHROUGH_LOGS) {
      process.stdout.write(`[poller:${spec.key}] ${b.toString()}`);
    }
    // First stdout chunk is a proxy for "first scan cycle started" (O7).
    if (!firstDataReceived) {
      firstDataReceived = true;
      markPollerFirstData(spec.key);
    }
  });
  child.stderr?.on('data', (b: Buffer) => {
    stderrLog.write(b);
    if (PASSTHROUGH_LOGS) {
      process.stderr.write(`[poller:${spec.key}] ${b.toString()}`);
    }
  });

  child.on('exit', (code, signal) => {
    activeChildren.delete(child);
    activeLoggers.delete(stdoutLog);
    activeLoggers.delete(stderrLog);
    void stdoutLog.close();
    void stderrLog.close();
    g[flagKey] = false;
    const elapsed = Date.now() - startedAt;
    if (elapsed < 1500 && (code === 0 || code === null)) {
      // The poller bails silently (exit 0) when its config is missing or
      // the bearer token isn't set. Surface a hint so the user isn't left
      // wondering why the affected panel never populates.
      console.warn(`[poller:${spec.key}] exited immediately — ${spec.configHint}`);
      markPollerFailed(spec.key);
    } else if (signal) {
      console.log(`[poller:${spec.key}] stopped (signal=${signal})`);
    } else {
      console.warn(`[poller:${spec.key}] exited unexpectedly code=${code}`);
    }
  });
}
