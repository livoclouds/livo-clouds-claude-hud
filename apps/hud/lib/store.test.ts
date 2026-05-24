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
