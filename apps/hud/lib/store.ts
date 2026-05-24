import type { HudEvent } from '@livoclouds/contracts';
import { createStore } from 'zustand/vanilla';
import { RECENT_EVENTS_CAP } from './mascot/timeouts';

export type HudTokens = {
  in: number;
  out: number;
  cached: number;
};

export type HudLastTool = {
  name: string;
  ts: number;
  durationMs: number | null;
};

export type HudLastError = {
  message: string;
  tool: string | null;
  ts: number;
};

export type HudSession = {
  id: string;
  model: string | null;
  cwd: string | null;
  startedAt: number;
  endedAt: number | null;
};

export type HudAgentStatus = 'working' | 'completed' | 'errored';

export type HudAgent = {
  name: string;
  description: string | null;
  color: string | null;
  status: HudAgentStatus;
  startedAt: number;
  endedAt: number | null;
  durationMs: number | null;
  // How many times this agent name was invoked in the current session.
  // Used by the dashboard to show a `×N` badge.
  invocations: number;
};

export type HudEnvelope = {
  id: string;
  event: HudEvent;
};

export type ConnectionState = 'connected' | 'reconnecting' | 'disconnected';

export type HudState = {
  session: HudSession | null;
  // Claude Code runtime metadata captured on session.start. Persisted across
  // a single session so the agents dashboard header can display them even
  // before any tool fires.
  claudeCodeVersion: string | null;
  defaultModel: string | null;
  tokens: HudTokens;
  costUsd: number;
  contextPct: number;
  lastTool: HudLastTool | null;
  lastError: HudLastError | null;
  lastActivityAt: number | null;
  lastEventId: string | null;
  replayTruncated: boolean;
  connectionState: ConnectionState;
  // Map keyed by agent name. The last invocation of each agent wins —
  // re-invoking the same agent updates the entry rather than creating a new one
  // (and bumps `invocations`).
  agents: Readonly<Record<string, HudAgent>>;
  // Bounded ring of the most recent envelopes (oldest → newest). Consumed by
  // the mascot state derivation; capped so RSC snapshot hydration stays small.
  recentEvents: ReadonlyArray<HudEnvelope>;
};

export const EMPTY_STATE: HudState = {
  session: null,
  claudeCodeVersion: null,
  defaultModel: null,
  tokens: { in: 0, out: 0, cached: 0 },
  costUsd: 0,
  contextPct: 0,
  lastTool: null,
  lastError: null,
  lastActivityAt: null,
  lastEventId: null,
  replayTruncated: false,
  // Optimistic default: the page renders as "connected" while the SSE client
  // mounts. The client will flip this on the first error/online/offline event.
  connectionState: 'connected',
  agents: {},
  recentEvents: [],
};

function appendRecent(
  recent: ReadonlyArray<HudEnvelope>,
  envelope: HudEnvelope,
): ReadonlyArray<HudEnvelope> {
  const next = recent.length >= RECENT_EVENTS_CAP
    ? [...recent.slice(recent.length - RECENT_EVENTS_CAP + 1), envelope]
    : [...recent, envelope];
  return next;
}

// Single source of truth for turning an envelope into the next state.
// Imported by the RSC for snapshot hydration and by the SSE client for live updates.
export function reduce(state: HudState, envelope: HudEnvelope): HudState {
  const { event } = envelope;
  const next: HudState = {
    ...state,
    lastEventId: envelope.id,
    recentEvents: appendRecent(state.recentEvents, envelope),
  };

  switch (event.type) {
    case 'session.start': {
      next.session = {
        id: event.sessionId,
        model: event.model ?? null,
        cwd: event.cwd ?? null,
        startedAt: event.ts,
        endedAt: null,
      };
      next.claudeCodeVersion = event.claudeCodeVersion ?? null;
      next.defaultModel = event.defaultModel ?? null;
      next.tokens = { in: 0, out: 0, cached: 0 };
      next.costUsd = 0;
      next.contextPct = 0;
      next.lastTool = null;
      next.lastError = null;
      next.lastActivityAt = event.ts;
      next.agents = {};
      next.recentEvents = [envelope];
      return next;
    }

    case 'session.end': {
      if (state.session && state.session.id === event.sessionId) {
        next.session = { ...state.session, endedAt: event.ts };
      }
      if (event.tokens) {
        next.tokens = {
          in: event.tokens.in,
          out: event.tokens.out,
          cached: event.tokens.cached ?? 0,
        };
      }
      if (typeof event.costUsd === 'number') {
        next.costUsd = event.costUsd;
      }
      next.lastActivityAt = event.ts;
      return next;
    }

    case 'prompt.submit': {
      next.lastActivityAt = event.ts;
      return next;
    }

    case 'tool.use': {
      next.lastTool = {
        name: event.tool,
        ts: event.ts,
        durationMs: event.durationMs ?? null,
      };
      next.lastActivityAt = event.ts;
      return next;
    }

    case 'turn.stop': {
      if (event.tokens) {
        next.tokens = {
          in: event.tokens.in,
          out: event.tokens.out,
          cached: event.tokens.cached ?? 0,
        };
      }
      if (typeof event.costUsd === 'number') {
        next.costUsd = event.costUsd;
      }
      if (typeof event.contextPct === 'number') {
        next.contextPct = event.contextPct;
      }
      next.lastActivityAt = event.ts;
      return next;
    }

    case 'compact.start':
    case 'compact.end': {
      next.lastActivityAt = event.ts;
      return next;
    }

    case 'agent.invoke': {
      const prior = state.agents[event.agentName];
      next.agents = {
        ...state.agents,
        [event.agentName]: {
          name: event.agentName,
          description: event.agentDescription ?? prior?.description ?? null,
          color: event.agentColor ?? prior?.color ?? null,
          status: 'working',
          startedAt: event.ts,
          endedAt: null,
          durationMs: null,
          invocations: (prior?.invocations ?? 0) + 1,
        },
      };
      next.lastActivityAt = event.ts;
      return next;
    }

    case 'agent.complete': {
      const prior = state.agents[event.agentName];
      const startedAt = prior?.startedAt ?? event.ts;
      next.agents = {
        ...state.agents,
        [event.agentName]: {
          name: event.agentName,
          description: prior?.description ?? null,
          color: prior?.color ?? null,
          status: event.error ? 'errored' : 'completed',
          startedAt,
          endedAt: event.ts,
          durationMs: event.durationMs ?? Math.max(0, event.ts - startedAt),
          invocations: prior?.invocations ?? 1,
        },
      };
      // Subagents consume tokens from the same budget — keep the session totals
      // up to date like turn.stop does.
      if (event.tokens) {
        next.tokens = {
          in: event.tokens.in,
          out: event.tokens.out,
          cached: event.tokens.cached ?? 0,
        };
      }
      if (typeof event.costUsd === 'number') {
        next.costUsd = event.costUsd;
      }
      next.lastActivityAt = event.ts;
      return next;
    }

    case 'error': {
      next.lastError = {
        message: event.message ?? 'Unknown error',
        tool: event.tool ?? null,
        ts: event.ts,
      };
      next.lastActivityAt = event.ts;
      return next;
    }
  }
}

export function reduceAll(envelopes: ReadonlyArray<HudEnvelope>): HudState {
  let state = EMPTY_STATE;
  for (const env of envelopes) {
    state = reduce(state, env);
  }
  return state;
}

export type HudStoreApi = ReturnType<typeof createHudStore>;

export type HudStoreActions = {
  apply: (envelope: HudEnvelope) => void;
  markReplayTruncated: () => void;
  setConnectionState: (state: ConnectionState) => void;
  reset: (state: HudState) => void;
};

type StoreValue = HudState & { actions: HudStoreActions };

export function createHudStore(initial: HudState) {
  return createStore<StoreValue>((set) => ({
    ...initial,
    actions: {
      apply: (envelope) =>
        set((current) => {
          const { actions: _actions, ...rest } = current;
          const nextState = reduce(rest, envelope);
          return { ...nextState };
        }),
      markReplayTruncated: () => set({ replayTruncated: true }),
      setConnectionState: (state) =>
        set((current) =>
          current.connectionState === state ? current : { connectionState: state },
        ),
      reset: (state) => set({ ...state }),
    },
  }));
}

