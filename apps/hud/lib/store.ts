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

export type HudEnvelope = {
  id: string;
  event: HudEvent;
};

export type HudState = {
  session: HudSession | null;
  tokens: HudTokens;
  costUsd: number;
  contextPct: number;
  lastTool: HudLastTool | null;
  lastError: HudLastError | null;
  lastActivityAt: number | null;
  lastEventId: string | null;
  replayTruncated: boolean;
  // Bounded ring of the most recent envelopes (oldest → newest). Consumed by
  // the mascot state derivation; capped so RSC snapshot hydration stays small.
  recentEvents: ReadonlyArray<HudEnvelope>;
};

export const EMPTY_STATE: HudState = {
  session: null,
  tokens: { in: 0, out: 0, cached: 0 },
  costUsd: 0,
  contextPct: 0,
  lastTool: null,
  lastError: null,
  lastActivityAt: null,
  lastEventId: null,
  replayTruncated: false,
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
      next.tokens = { in: 0, out: 0, cached: 0 };
      next.costUsd = 0;
      next.contextPct = 0;
      next.lastTool = null;
      next.lastError = null;
      next.lastActivityAt = event.ts;
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
      reset: (state) => set({ ...state }),
    },
  }));
}

