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

// Per-session metrics derived from the JSONL transcript by the transcript
// poller (turn.metrics events). Keyed by sessionId so the HUD can display the
// totals for the *active* session even when other concurrent sessions emit
// their own metrics — eliminating the flicker that came from the store
// previously following whichever sessionId was most recent.
export type HudSessionMetrics = {
  tokens: HudTokens;
  costUsd: number;
  contextPct: number;
  // Authoritative model from `message.model` in the JSONL.
  model: string | null;
  updatedAt: number;
};

export type HudState = {
  session: HudSession | null;
  // Claude Code runtime metadata captured on session.start. Persisted across
  // a single session so the agents dashboard header can display them even
  // before any tool fires.
  claudeCodeVersion: string | null;
  defaultModel: string | null;
  // Top-level convenience mirrors of `sessionMetrics[session?.id]`. Kept in
  // sync by the reducer so existing UI that reads `state.tokens` etc. needs
  // no changes. Zeroed when no session is active or no metrics have arrived.
  tokens: HudTokens;
  costUsd: number;
  contextPct: number;
  // Per-sessionId metrics map. Updated by `turn.metrics` events (from the
  // transcript poller). The Live cards only display the entry that matches
  // the current `session?.id`; the other entries exist so future per-session
  // UI can surface them without re-fetching.
  sessionMetrics: Readonly<Record<string, HudSessionMetrics>>;
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
  sessionMetrics: {},
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
  // Single allocation regardless of cap: copy then shift-and-push instead of
  // slice-then-spread (which allocates twice when at capacity) (O10).
  const events: HudEnvelope[] = [...recent];
  if (events.length >= RECENT_EVENTS_CAP) events.shift();
  events.push(envelope);
  return events;
}

// Mirror sessionMetrics[active session] into the top-level convenience
// fields (state.tokens / costUsd / contextPct) so existing UI that reads
// these fields directly continues to work. Also lifts the JSONL-derived
// model into state.session.model when the hook never reported one.
function syncActiveSessionMetrics(state: HudState): HudState {
  const sid = state.session?.id;
  if (!sid) return state;
  const m = state.sessionMetrics[sid];
  if (!m) return state;
  const next: HudState = {
    ...state,
    tokens: m.tokens,
    costUsd: m.costUsd,
    contextPct: m.contextPct,
  };
  if (state.session && !state.session.model && m.model) {
    next.session = { ...state.session, model: m.model };
  }
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

  // Bootstrap the active session ONLY when no session is set yet. Claude
  // Code's `SessionStart` hook fires only at session launch, so on a resumed
  // or already-running session (or after a HUD restart) the dedicated
  // session.start case never runs and the Active Session card would be stuck
  // on its "Waiting…" empty state. Synthesizing the session from the first
  // observed event populates the card without waiting for session.start.
  //
  // CRITICAL: We do NOT flip `state.session` when a later event arrives with
  // a *different* sessionId. The transcript poller emits `turn.metrics` for
  // every active JSONL on disk, so multiple concurrent sessions produce
  // events on this bus. Auto-flipping would make the Live header bounce
  // between sessions and wipe metrics on every flip — exactly the flicker
  // the user reported. Different sessions land in `sessionMetrics`; the
  // active session is sticky and only changes on an explicit `session.start`.
  if ('sessionId' in event && next.session === null) {
    next.session = {
      id: event.sessionId,
      model: 'model' in event && event.model ? event.model : null,
      cwd: 'cwd' in event && event.cwd ? event.cwd : null,
      startedAt: event.ts,
      endedAt: null,
    };
  }

  switch (event.type) {
    case 'session.start': {
      // session.start is the ONLY signal that switches the active session.
      // Reset everything tied to per-session state — but keep entries for
      // *other* sessionIds in sessionMetrics, since concurrent sessions
      // continue to produce events on the bus.
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
      // If the transcript poller has already populated metrics for this
      // session before session.start arrived, mirror them up immediately.
      return syncActiveSessionMetrics(next);
    }

    case 'session.end': {
      if (state.session && state.session.id === event.sessionId) {
        next.session = { ...state.session, endedAt: event.ts };
      }
      // Tokens / cost are no longer hook-driven; the transcript poller owns
      // them via turn.metrics. session.end only records that the session
      // ended.
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
      //
      // Read from `next`, not `state` — the session-bootstrap step above can
      // have cleared agents/currentAgent on a session-flip; reading `state`
      // here would resurrect the cleared owner from the previous session.
      const owner = next.currentAgent;
      if (owner && next.agents[owner]) {
        const prior = next.agents[owner];
        const nextCall: HudAgentToolCall = {
          name: event.tool,
          ts: event.ts,
          toolInput: event.toolInput ?? null,
          durationMs: event.durationMs ?? null,
        };
        const toolCalls: HudAgentToolCall[] = [...prior.toolCalls];
        if (toolCalls.length >= TOOL_CALLS_PER_AGENT_CAP) toolCalls.shift();
        toolCalls.push(nextCall);
        // O9: Object.assign + in-place key update instead of spread to make
        // the single-copy intent explicit.
        const agents: Record<string, HudAgent> = Object.assign({}, next.agents);
        agents[owner] = { ...prior, toolCalls };
        next.agents = agents;
      }
      return next;
    }

    case 'turn.stop': {
      // turn.stop from the hook channel no longer carries authoritative
      // tokens/cost/contextPct — those come from `turn.metrics` (transcript
      // poller). We keep only the activity-timestamp side effect so the
      // mascot's idle timer resets correctly. Older hook scripts that still
      // include numeric fields are ignored here on purpose: trusting them
      // would resurrect the flicker.
      next.lastActivityAt = event.ts;
      return next;
    }

    case 'turn.metrics': {
      // Authoritative source for tokens / cost / contextPct / model. Always
      // write to the per-sessionId map; only mirror into top-level state
      // when the event matches the active session (so concurrent-session
      // events do not overwrite the displayed numbers).
      const metrics: HudSessionMetrics = {
        tokens: {
          in: event.tokens.in,
          out: event.tokens.out,
          cached: event.tokens.cached ?? 0,
        },
        costUsd: event.costUsd ?? 0,
        contextPct: event.contextPct,
        model: event.model,
        updatedAt: event.ts,
      };
      const sessionMetrics: Record<string, HudSessionMetrics> = Object.assign(
        {},
        next.sessionMetrics,
      );
      sessionMetrics[event.sessionId] = metrics;
      next.sessionMetrics = sessionMetrics;
      if (next.session && next.session.id === event.sessionId) {
        next.lastActivityAt = event.ts;
        return syncActiveSessionMetrics(next);
      }
      return next;
    }

    case 'compact.start':
    case 'compact.end': {
      next.lastActivityAt = event.ts;
      return next;
    }

    case 'agent.invoke': {
      const prior = state.agents[event.agentName];
      // O9: explicit Object.assign copy + in-place key update.
      const agentsInvoke: Record<string, HudAgent> = Object.assign({}, state.agents);
      agentsInvoke[event.agentName] = {
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
      };
      next.agents = agentsInvoke;
      next.currentAgent = event.agentName;
      next.lastActivityAt = event.ts;
      return next;
    }

    case 'agent.complete': {
      const prior = state.agents[event.agentName];
      const startedAt = prior?.startedAt ?? event.ts;
      // O9: explicit Object.assign copy + in-place key update.
      const agentsComplete: Record<string, HudAgent> = Object.assign({}, state.agents);
      agentsComplete[event.agentName] = {
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
      };
      next.agents = agentsComplete;
      // Only clear currentAgent if this completion is for the agent currently
      // in flight — a stray complete for a different agent shouldn't drop us
      // out of tracking mode for an unrelated subagent still running.
      if (state.currentAgent === event.agentName) {
        next.currentAgent = null;
      }
      // Subagent token / cost numbers stay scoped to the agent card. The
      // session-level cumulative totals come from turn.metrics, which already
      // accounts for subagent consumption in the parent's JSONL usage.
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

