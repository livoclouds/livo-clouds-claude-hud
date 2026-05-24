import type { CodeSessionInfo, HudEvent } from '@livoclouds/contracts';
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

// A tool that ran inside a subagent's execution window. Captured by tagging
// every `tool.use` event with the `currentAgent` at the time the parent fired
// its PreToolUse(Agent). The detail sheet renders this list so the user can
// see exactly what the subagent did.
export type HudAgentToolCall = {
  name: string;
  ts: number;
  toolInput: Readonly<Record<string, unknown>> | null;
  durationMs: number | null;
};

export const TOOL_CALLS_PER_AGENT_CAP = 100;

export type HudAgent = {
  name: string;
  description: string | null;
  color: string | null;
  // The prompt the parent passed to the subagent (from PreToolUse.tool_input).
  prompt: string | null;
  status: HudAgentStatus;
  startedAt: number;
  endedAt: number | null;
  durationMs: number | null;
  // How many times this agent name was invoked in the current session.
  // Used by the dashboard to show a `×N` badge.
  invocations: number;
  // Last completion's error message, if present.
  error: string | null;
  // Tool calls captured during the latest invocation. Capped — oldest entries
  // are dropped when the cap is exceeded.
  toolCalls: ReadonlyArray<HudAgentToolCall>;
};

// A live Claude Code session as observed on disk by the sessions-poller
// sidecar. This is the data that powers the SessionsDashboard — it mirrors
// the terminal `/agents` view (each running Claude Code conversation has
// one of these). Distinct from `HudSession` above, which represents the
// single session whose event stream is being consumed by this HUD instance.
export type HudCodeSession = CodeSessionInfo;

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
  // Name of the agent currently in flight (set by agent.invoke, cleared by
  // agent.complete). Used to tag inbound `tool.use` events so the detail sheet
  // can show what the subagent did. Null when no subagent is running.
  currentAgent: string | null;
  // Map of live Claude Code sessions keyed by sessionId, populated by the
  // sessions.snapshot event (sidecar poller). This is what powers the
  // top-level SessionsDashboard — it mirrors what the terminal `/agents`
  // view shows. The map is replaced wholesale on every snapshot so deletes
  // are observed correctly (a session that has gone away is simply absent
  // from the next snapshot).
  codeSessions: Readonly<Record<string, HudCodeSession>>;
  // Timestamp of the latest sessions.snapshot the HUD received, in ms epoch.
  // Used by the dashboard to surface "stale" data if the poller has stopped.
  codeSessionsUpdatedAt: number | null;
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
  currentAgent: null,
  codeSessions: {},
  codeSessionsUpdatedAt: null,
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
      next.currentAgent = null;
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

      // While a subagent is in flight, attach this tool call to its history so
      // the detail sheet can show exactly what the agent did. The Agent tool
      // itself never reaches this branch (it is mapped to agent.invoke /
      // agent.complete by the hook), so we don't need to filter it out here.
      const owner = state.currentAgent;
      if (owner && state.agents[owner]) {
        const prior = state.agents[owner];
        const nextCall: HudAgentToolCall = {
          name: event.tool,
          ts: event.ts,
          toolInput: event.toolInput ?? null,
          durationMs: event.durationMs ?? null,
        };
        const calls = prior.toolCalls.length >= TOOL_CALLS_PER_AGENT_CAP
          ? [...prior.toolCalls.slice(prior.toolCalls.length - TOOL_CALLS_PER_AGENT_CAP + 1), nextCall]
          : [...prior.toolCalls, nextCall];
        next.agents = {
          ...state.agents,
          [owner]: { ...prior, toolCalls: calls },
        };
      }
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
          prompt: event.prompt ?? prior?.prompt ?? null,
          status: 'working',
          startedAt: event.ts,
          endedAt: null,
          durationMs: null,
          invocations: (prior?.invocations ?? 0) + 1,
          error: null,
          // Reset on every new invocation so the sheet only shows the latest run.
          toolCalls: [],
        },
      };
      next.currentAgent = event.agentName;
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
          prompt: prior?.prompt ?? null,
          status: event.error ? 'errored' : 'completed',
          startedAt,
          endedAt: event.ts,
          durationMs: event.durationMs ?? Math.max(0, event.ts - startedAt),
          invocations: prior?.invocations ?? 1,
          error: event.error ?? null,
          toolCalls: prior?.toolCalls ?? [],
        },
      };
      // Only clear currentAgent if this completion is for the agent currently
      // in flight — a stray complete for a different agent shouldn't drop us
      // out of tracking mode for an unrelated subagent still running.
      if (state.currentAgent === event.agentName) {
        next.currentAgent = null;
      }
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

    case 'sessions.snapshot': {
      // The poller is authoritative — replace the map wholesale so deletes
      // and renames are observed. We intentionally do NOT touch
      // lastActivityAt here: the snapshot is a passive heartbeat, not
      // session-level activity, and bumping it would confuse the mascot
      // idle timeout.
      const map: Record<string, HudCodeSession> = {};
      for (const s of event.sessions) {
        map[s.sessionId] = s;
      }
      next.codeSessions = map;
      next.codeSessionsUpdatedAt = event.ts;
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

