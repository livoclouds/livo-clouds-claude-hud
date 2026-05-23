import type { HudEvent } from '@livoclouds/contracts';
import {
  COMPACT_END_WINDOW_MS,
  IDLE_TIMEOUT_MS,
  LISTEN_WINDOW_MS,
  LOOKBACK_LIMIT,
} from './timeouts';

export const MASCOT_STATES = [
  'idle',
  'listening',
  'thinking',
  'editing',
  'running',
  'succeeded',
  'errored',
  'compacting',
] as const;

export type MascotState = (typeof MASCOT_STATES)[number];

export type MascotEnvelope = {
  id: string;
  event: HudEvent;
};

export type DeriveInput = {
  recentEvents: ReadonlyArray<MascotEnvelope>;
  nowMs: number;
};

const EDITING_TOOLS = new Set([
  'Edit',
  'Write',
  'MultiEdit',
  'NotebookEdit',
  'Update',
]);

const RUNNING_TOOLS = new Set([
  'Bash',
  'BashOutput',
  'KillBash',
  'KillShell',
]);

export function classifyTool(tool: string): MascotState {
  if (EDITING_TOOLS.has(tool)) return 'editing';
  if (RUNNING_TOOLS.has(tool)) return 'running';
  return 'thinking';
}

// Derivation rule: latest envelope wins (D-6.2). If silence exceeds the idle
// timeout, fall back to idle regardless of the most recent event type. The
// function is pure so it is trivially unit-testable and can run on both server
// (RSC snapshot hydration) and client (live ticks).
export function deriveMascotState({ recentEvents, nowMs }: DeriveInput): MascotState {
  if (recentEvents.length === 0) return 'idle';

  const latest = recentEvents[recentEvents.length - 1]!;
  if (nowMs - latest.event.ts > IDLE_TIMEOUT_MS) return 'idle';

  return stateFromEvent(latest.event, nowMs, recentEvents);
}

function stateFromEvent(
  event: HudEvent,
  nowMs: number,
  recentEvents: ReadonlyArray<MascotEnvelope>,
): MascotState {
  switch (event.type) {
    case 'session.start':
      return 'idle';
    case 'session.end':
      return 'succeeded';
    case 'prompt.submit':
      return nowMs - event.ts < LISTEN_WINDOW_MS ? 'listening' : 'thinking';
    case 'tool.use':
      return classifyTool(event.tool);
    case 'turn.stop':
      return 'succeeded';
    case 'compact.start':
      return 'compacting';
    case 'compact.end':
      if (nowMs - event.ts < COMPACT_END_WINDOW_MS) return 'compacting';
      return derivePreCompactState(recentEvents, nowMs);
    case 'error':
      return 'errored';
  }
}

// After a compact.end's brief window expires, surface whatever the session was
// doing before compaction so the mascot doesn't appear stuck.
function derivePreCompactState(
  recentEvents: ReadonlyArray<MascotEnvelope>,
  nowMs: number,
): MascotState {
  const start = Math.max(0, recentEvents.length - 1 - LOOKBACK_LIMIT);
  for (let i = recentEvents.length - 2; i >= start; i -= 1) {
    const prev = recentEvents[i]!.event;
    if (prev.type === 'compact.end' || prev.type === 'compact.start') continue;
    if (nowMs - prev.ts > IDLE_TIMEOUT_MS) return 'idle';
    return stateFromEvent(prev, nowMs, recentEvents);
  }
  return 'idle';
}
