// Shared lifecycle state for the HUD server process.
//
// Backed by globalThis so the singleton survives hot-reload (Next.js dev
// re-evaluates modules but does not restart the Node process). Every API
// route and instrumentation-node.ts import from this module.

import { EventEmitter } from 'node:events';

export type PollerState = 'pending' | 'ready' | 'failed' | 'disabled';

export type PollerStatus = {
  state: PollerState;
  firstDataAt: number | null;
  lastErrorAt: number | null;
};

type LifecycleSingleton = {
  draining: boolean;
  readyAt: number | null;
  pollerStatus: Map<string, PollerStatus>;
  /** Emits 'shutdown' when the server begins graceful termination. */
  lifecycleEmitter: EventEmitter;
};

declare global {
  var __hudLifecycle: LifecycleSingleton | undefined;
}

function createSingleton(): LifecycleSingleton {
  return {
    draining: false,
    readyAt: null,
    pollerStatus: new Map(),
    lifecycleEmitter: new EventEmitter(),
  };
}

const state: LifecycleSingleton =
  globalThis.__hudLifecycle ?? createSingleton();

if (!globalThis.__hudLifecycle) {
  globalThis.__hudLifecycle = state;
}

// Prevent Node.js warnings about listeners — each SSE connection adds one
// 'shutdown' listener; peak connections can exceed the default limit of 10.
state.lifecycleEmitter.setMaxListeners(200);

export const lifecycleEmitter = state.lifecycleEmitter;

// ---------------------------------------------------------------------------
// Poller registry
// ---------------------------------------------------------------------------

/**
 * Called once at startup with the full list of poller keys. Pre-populates
 * the status map so isReady() knows which pollers to wait for.
 *
 * Idempotent: repeated calls (hot-reload) only add missing keys, never
 * overwrite existing ones that have already made progress.
 */
export function initPollers(keys: string[]): void {
  for (const key of keys) {
    if (!state.pollerStatus.has(key)) {
      state.pollerStatus.set(key, { state: 'pending', firstDataAt: null, lastErrorAt: null });
    }
  }
  recalcReady();
}

export function markPollerFirstData(key: string): void {
  const s = state.pollerStatus.get(key);
  if (!s || s.state === 'ready') return;
  state.pollerStatus.set(key, { ...s, state: 'ready', firstDataAt: Date.now() });
  recalcReady();
}

export function markPollerDisabled(key: string): void {
  const s = state.pollerStatus.get(key);
  if (s?.state === 'ready') return;
  state.pollerStatus.set(key, {
    state: 'disabled',
    firstDataAt: s?.firstDataAt ?? null,
    lastErrorAt: s?.lastErrorAt ?? null,
  });
  recalcReady();
}

export function markPollerFailed(key: string): void {
  const s = state.pollerStatus.get(key);
  // Don't downgrade a poller that previously had successful data.
  if (s?.state === 'ready') return;
  state.pollerStatus.set(key, {
    state: 'failed',
    firstDataAt: s?.firstDataAt ?? null,
    lastErrorAt: Date.now(),
  });
  // A failed poller does not block readiness — the server is still operational,
  // just with that panel empty. Recalc so we don't hang indefinitely.
  recalcReady();
}

export function getPollerStatus(key: string): PollerStatus | undefined {
  return state.pollerStatus.get(key);
}

export function getAllPollerStatuses(): Record<string, PollerStatus> {
  const out: Record<string, PollerStatus> = {};
  for (const [k, v] of state.pollerStatus) out[k] = v;
  return out;
}

// ---------------------------------------------------------------------------
// Drain / shutdown
// ---------------------------------------------------------------------------

export function isDraining(): boolean {
  return state.draining;
}

export function setDraining(): void {
  state.draining = true;
}

// ---------------------------------------------------------------------------
// Readiness
// ---------------------------------------------------------------------------

export function isReady(): boolean {
  return state.readyAt !== null && !state.draining;
}

export function getReadyAt(): number | null {
  return state.readyAt;
}

function recalcReady(): void {
  if (state.readyAt !== null) return; // already ready; never regress
  if (state.pollerStatus.size === 0) return; // initPollers not called yet

  for (const s of state.pollerStatus.values()) {
    if (s.state === 'pending') return; // still waiting
  }
  // All pollers are either ready, failed, or disabled.
  state.readyAt = Date.now();
}
