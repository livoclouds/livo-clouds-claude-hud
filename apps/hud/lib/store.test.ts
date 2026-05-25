import { describe, expect, it } from 'vitest';
import type { HudEvent } from '@livoclouds/contracts';
import {
  EMPTY_STATE,
  TOOL_CALLS_PER_AGENT_CAP,
  reduce,
  reduceAll,
  type HudEnvelope,
  type HudState,
} from './store';

const SID = 'sess-test';

function env(event: HudEvent, idSuffix = ''): HudEnvelope {
  return { id: `env-${event.type}-${event.ts}${idSuffix}`, event };
}

function at(
  ts: number,
  partial: Record<string, unknown> & { type: HudEvent['type'] },
): HudEvent {
  return { ...partial, ts, sessionId: SID } as unknown as HudEvent;
}

function startSession(state: HudState = EMPTY_STATE): HudState {
  return reduce(state, env(at(1_000, { type: 'session.start', cwd: '/repo', model: 'opus' })));
}

describe('reduce — session metadata', () => {
  it('persists claudeCodeVersion and defaultModel on session.start', () => {
    const e = env(
      at(1_000, {
        type: 'session.start',
        cwd: '/repo',
        model: 'opus',
        claudeCodeVersion: '2.1.150',
        defaultModel: 'opus',
      }),
    );
    const next = reduce(EMPTY_STATE, e);
    expect(next.claudeCodeVersion).toBe('2.1.150');
    expect(next.defaultModel).toBe('opus');
    expect(next.currentAgent).toBeNull();
    expect(next.agents).toEqual({});
  });
});

describe('reduce — active session bootstrap (synthesis)', () => {
  it('populates state.session from prompt.submit when no prior session.start exists', () => {
    const e = env(at(2_500, { type: 'prompt.submit', cwd: '/repo', model: 'opus' }));
    const next = reduce(EMPTY_STATE, e);
    expect(next.session).toEqual({
      id: SID,
      model: 'opus',
      cwd: '/repo',
      startedAt: 2_500,
      endedAt: null,
    });
  });

  it('subsequent session.start with the SAME sessionId corrects startedAt and resets counters', () => {
    // Synthesize first from a tool.use mid-flight.
    let s = reduce(
      EMPTY_STATE,
      env(at(5_000, { type: 'tool.use', tool: 'Read', toolInput: { file_path: '/a' } })),
    );
    expect(s.session?.id).toBe(SID);
    expect(s.session?.startedAt).toBe(5_000);
    // Real session.start arrives later with the authoritative start time.
    s = reduce(
      s,
      env(at(1_000, { type: 'session.start', cwd: '/repo', model: 'opus' })),
    );
    expect(s.session?.startedAt).toBe(1_000);
    expect(s.session?.id).toBe(SID);
    // session.start always zeros counters — that's its existing contract.
    expect(s.tokens).toEqual({ in: 0, out: 0, cached: 0 });
    expect(s.agents).toEqual({});
  });

  it('a DIFFERENT sessionId does NOT flip the active session (sticky session)', () => {
    // Old behavior auto-flipped to whatever sessionId arrived last; that
    // caused the Live header to bounce between concurrent sessions and wipe
    // metrics. New contract: state.session only changes on an explicit
    // session.start. Events from other sessionIds are accepted but do not
    // re-bind the active session.
    let s = startSession();
    s = reduce(s, env(at(2_000, { type: 'agent.invoke', agentName: 'Explore' })));
    expect(s.currentAgent).toBe('Explore');
    const otherId = 'sess-other';
    s = reduce(s, {
      id: 'env-other',
      event: {
        type: 'tool.use',
        sessionId: otherId,
        ts: 9_000,
        tool: 'Bash',
        cwd: '/other',
        model: 'sonnet',
      } as unknown as HudEvent,
    });
    // Active session unchanged.
    expect(s.session?.id).toBe(SID);
    // Agents map preserved — no spurious reset.
    expect(s.currentAgent).toBe('Explore');
    expect(s.agents.Explore).toBeDefined();
  });

  it('sessions.snapshot has no sessionId and does NOT populate state.session', () => {
    const snapshot: HudEvent = {
      type: 'sessions.snapshot',
      ts: 5_000,
      sessions: [
        {
          pid: 1111,
          sessionId: 'sess-from-snapshot',
          name: 'Edit bank profile',
          cwd: '/repo',
          status: 'busy',
          kind: 'bg',
          startedAt: 1000,
          updatedAt: 4000,
        },
      ],
    } as unknown as HudEvent;
    const s = reduce(EMPTY_STATE, env(snapshot));
    expect(s.session).toBeNull();
    // But codeSessions IS populated by the existing sessions.snapshot case.
    expect(s.codeSessions['sess-from-snapshot']?.name).toBe('Edit bank profile');
  });
});

describe('reduce — agent.invoke', () => {
  it('upserts the agent at status=working and sets currentAgent', () => {
    const s0 = startSession();
    const s1 = reduce(
      s0,
      env(
        at(2_000, {
          type: 'agent.invoke',
          agentName: 'Explore',
          agentDescription: 'explore mascot',
          prompt: 'read the mascot module',
        }),
      ),
    );
    expect(s1.currentAgent).toBe('Explore');
    expect(s1.agents.Explore).toMatchObject({
      name: 'Explore',
      status: 'working',
      startedAt: 2_000,
      description: 'explore mascot',
      prompt: 'read the mascot module',
      invocations: 1,
      toolCalls: [],
    });
  });

  it('re-invoking the same agent bumps invocations and resets toolCalls', () => {
    let s = startSession();
    s = reduce(s, env(at(2_000, { type: 'agent.invoke', agentName: 'Explore' })));
    s = reduce(
      s,
      env(at(2_100, { type: 'tool.use', tool: 'Read', toolInput: { file_path: '/a' } })),
    );
    expect(s.agents.Explore!.toolCalls).toHaveLength(1);

    s = reduce(s, env(at(3_000, { type: 'agent.invoke', agentName: 'Explore' })));
    expect(s.agents.Explore!.invocations).toBe(2);
    expect(s.agents.Explore!.toolCalls).toEqual([]);
    expect(s.agents.Explore!.status).toBe('working');
  });
});

describe('reduce — tool.use tagging', () => {
  it('attaches tool.use to the active agent while one is in flight', () => {
    let s = startSession();
    s = reduce(s, env(at(2_000, { type: 'agent.invoke', agentName: 'Explore' })));
    s = reduce(
      s,
      env(at(2_010, { type: 'tool.use', tool: 'Bash', toolInput: { command: 'ls' } })),
    );
    s = reduce(s, env(at(2_020, { type: 'tool.use', tool: 'Edit' })));

    const calls = s.agents.Explore!.toolCalls;
    expect(calls).toHaveLength(2);
    expect(calls[0]).toMatchObject({ name: 'Bash', toolInput: { command: 'ls' } });
    expect(calls[1]?.name).toBe('Edit');
    expect(calls[1]?.toolInput).toBeNull();
  });

  it('does not attach tool.use to any agent when none is in flight', () => {
    let s = startSession();
    s = reduce(s, env(at(2_000, { type: 'tool.use', tool: 'Read' })));
    expect(s.currentAgent).toBeNull();
    expect(Object.keys(s.agents)).toEqual([]);
  });

  it('caps toolCalls at TOOL_CALLS_PER_AGENT_CAP and drops the oldest', () => {
    let s = startSession();
    s = reduce(s, env(at(2_000, { type: 'agent.invoke', agentName: 'Heavy' })));
    for (let i = 0; i < TOOL_CALLS_PER_AGENT_CAP + 10; i += 1) {
      s = reduce(
        s,
        env(at(2_100 + i, { type: 'tool.use', tool: `Tool${i}` }), `-${i}`),
      );
    }
    const calls = s.agents.Heavy!.toolCalls;
    expect(calls).toHaveLength(TOOL_CALLS_PER_AGENT_CAP);
    expect(calls[0]?.name).toBe('Tool10');
    expect(calls[calls.length - 1]?.name).toBe(`Tool${TOOL_CALLS_PER_AGENT_CAP + 9}`);
  });
});

describe('reduce — agent.complete', () => {
  it('flips status to completed, records durationMs, and clears currentAgent', () => {
    let s = startSession();
    s = reduce(s, env(at(2_000, { type: 'agent.invoke', agentName: 'Explore' })));
    s = reduce(
      s,
      env(at(5_000, { type: 'agent.complete', agentName: 'Explore', durationMs: 3_000 })),
    );
    expect(s.currentAgent).toBeNull();
    expect(s.agents.Explore!.status).toBe('completed');
    expect(s.agents.Explore!.endedAt).toBe(5_000);
    expect(s.agents.Explore!.durationMs).toBe(3_000);
    expect(s.agents.Explore!.error).toBeNull();
  });

  it('flips status to errored when the completion carries an error', () => {
    let s = startSession();
    s = reduce(s, env(at(2_000, { type: 'agent.invoke', agentName: 'Plan' })));
    s = reduce(
      s,
      env(
        at(2_500, {
          type: 'agent.complete',
          agentName: 'Plan',
          durationMs: 500,
          error: 'timed out',
        }),
      ),
    );
    expect(s.agents.Plan!.status).toBe('errored');
    expect(s.agents.Plan!.error).toBe('timed out');
  });

  it('preserves toolCalls captured during the run', () => {
    let s = startSession();
    s = reduce(s, env(at(2_000, { type: 'agent.invoke', agentName: 'Explore' })));
    s = reduce(s, env(at(2_010, { type: 'tool.use', tool: 'Read' })));
    s = reduce(s, env(at(2_020, { type: 'tool.use', tool: 'Grep' })));
    s = reduce(s, env(at(3_000, { type: 'agent.complete', agentName: 'Explore' })));
    expect(s.agents.Explore!.toolCalls.map((c) => c.name)).toEqual(['Read', 'Grep']);
  });
});

describe('reduce — sessions.snapshot', () => {
  function snapshotEvent(ts: number, sessions: Array<Record<string, unknown>>): HudEvent {
    return { type: 'sessions.snapshot', ts, sessions } as unknown as HudEvent;
  }

  const SAMPLE = {
    pid: 11131,
    sessionId: 'sess-1',
    name: 'Edit bank profile',
    cwd: '/repo',
    status: 'busy',
    kind: 'bg',
    agent: 'claude',
    version: '2.1.150',
    startedAt: 1000,
    updatedAt: 2000,
  };

  it('populates codeSessions keyed by sessionId on the first snapshot', () => {
    const s = reduce(EMPTY_STATE, env(snapshotEvent(5_000, [SAMPLE])));
    expect(s.codeSessions['sess-1']).toMatchObject({ name: 'Edit bank profile', status: 'busy' });
    expect(s.codeSessionsUpdatedAt).toBe(5_000);
  });

  it('replaces the map wholesale so removed sessions disappear', () => {
    let s = reduce(
      EMPTY_STATE,
      env(snapshotEvent(5_000, [SAMPLE, { ...SAMPLE, sessionId: 'sess-2', name: 'Plan task' }])),
    );
    expect(Object.keys(s.codeSessions).sort()).toEqual(['sess-1', 'sess-2']);

    s = reduce(s, env(snapshotEvent(6_000, [SAMPLE])));
    expect(Object.keys(s.codeSessions)).toEqual(['sess-1']);
    expect(s.codeSessions['sess-2']).toBeUndefined();
    expect(s.codeSessionsUpdatedAt).toBe(6_000);
  });

  it('does NOT bump lastActivityAt — the snapshot is a passive heartbeat', () => {
    const s0 = startSession();
    expect(s0.lastActivityAt).toBe(1_000);
    const s1 = reduce(s0, env(snapshotEvent(9_999, [SAMPLE])));
    expect(s1.lastActivityAt).toBe(1_000);
  });

  it('does not touch session/agents/currentAgent state', () => {
    let s = startSession();
    s = reduce(s, env(at(2_000, { type: 'agent.invoke', agentName: 'Explore' })));
    const before = { session: s.session, agents: s.agents, currentAgent: s.currentAgent };
    s = reduce(s, env(snapshotEvent(9_000, [SAMPLE])));
    expect(s.session).toEqual(before.session);
    expect(s.agents).toEqual(before.agents);
    expect(s.currentAgent).toBe(before.currentAgent);
  });
});

describe('reduce — replay via reduceAll', () => {
  it('reconstructs the full agent state from a stream of envelopes', () => {
    const stream: HudEnvelope[] = [
      env(at(1_000, { type: 'session.start', cwd: '/x', model: 'opus' })),
      env(at(2_000, { type: 'agent.invoke', agentName: 'Explore', prompt: 'p' })),
      env(at(2_010, { type: 'tool.use', tool: 'Read', toolInput: { file_path: '/a' } })),
      env(at(2_020, { type: 'tool.use', tool: 'Bash' })),
      env(at(3_000, { type: 'agent.complete', agentName: 'Explore', durationMs: 1_000 })),
      env(at(3_100, { type: 'agent.invoke', agentName: 'Plan' })),
    ];
    const s = reduceAll(stream);
    expect(s.agents.Explore!.status).toBe('completed');
    expect(s.agents.Explore!.toolCalls).toHaveLength(2);
    expect(s.agents.Plan!.status).toBe('working');
    expect(s.currentAgent).toBe('Plan');
  });
});
