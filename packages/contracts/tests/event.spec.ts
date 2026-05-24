import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  HudEventSchema,
  HudEventTypes,
  type HudEvent,
  type SessionStartEvent,
  type ToolUseEvent,
  type TurnStopEvent,
} from '../src/index';

// Fixtures captured against Claude Code 2.x hook payloads, anonymized.
import sessionStart from './fixtures/session-start.json' with { type: 'json' };
import sessionEnd from './fixtures/session-end.json' with { type: 'json' };
import promptSubmit from './fixtures/prompt-submit.json' with { type: 'json' };
import toolUseEdit from './fixtures/tool-use-edit.json' with { type: 'json' };
import toolUseBash from './fixtures/tool-use-bash.json' with { type: 'json' };
import turnStopOk from './fixtures/turn-stop-ok.json' with { type: 'json' };
import turnStopError from './fixtures/turn-stop-error.json' with { type: 'json' };
import compactStart from './fixtures/compact-start.json' with { type: 'json' };
import compactEnd from './fixtures/compact-end.json' with { type: 'json' };
import agentInvoke from './fixtures/agent-invoke.json' with { type: 'json' };
import agentComplete from './fixtures/agent-complete.json' with { type: 'json' };
import errorEvent from './fixtures/error.json' with { type: 'json' };
import sessionsSnapshot from './fixtures/sessions-snapshot.json' with { type: 'json' };

const positives = [
  ['session.start', sessionStart],
  ['session.end', sessionEnd],
  ['prompt.submit', promptSubmit],
  ['tool.use (Edit)', toolUseEdit],
  ['tool.use (Bash)', toolUseBash],
  ['turn.stop (ok)', turnStopOk],
  ['turn.stop (error)', turnStopError],
  ['compact.start', compactStart],
  ['compact.end', compactEnd],
  ['agent.invoke', agentInvoke],
  ['agent.complete', agentComplete],
  ['error', errorEvent],
  ['sessions.snapshot', sessionsSnapshot],
] as const;

describe('HudEventSchema — positive parses', () => {
  it.each(positives)('parses fixture: %s', (_label, fixture) => {
    const result = HudEventSchema.safeParse(fixture);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.type).toBe(fixture.type);
    }
  });

  it('covers every declared event type', () => {
    const parsedTypes = new Set(positives.map(([, f]) => f.type));
    for (const t of HudEventTypes) {
      expect(parsedTypes.has(t)).toBe(true);
    }
  });
});

describe('HudEventSchema — negative parses', () => {
  it('rejects missing ts', () => {
    const { ts: _omit, ...payload } = sessionStart;
    const result = HudEventSchema.safeParse(payload);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(['ts']);
    }
  });

  it('rejects missing sessionId', () => {
    const { sessionId: _omit, ...payload } = sessionStart;
    const result = HudEventSchema.safeParse(payload);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(['sessionId']);
    }
  });

  it('rejects an unknown discriminator value', () => {
    const result = HudEventSchema.safeParse({
      ...sessionStart,
      type: 'unknown.event',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(['type']);
    }
  });

  it('rejects contextPct out of [0, 100]', () => {
    const payload = { ...turnStopOk, contextPct: 150 };
    const result = HudEventSchema.safeParse(payload);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(['contextPct']);
    }
  });

  it('rejects negative tokens.in', () => {
    const payload = {
      ...turnStopOk,
      tokens: { in: -1, out: turnStopOk.tokens.out },
    };
    const result = HudEventSchema.safeParse(payload);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(['tokens', 'in']);
    }
  });

  it('rejects non-integer ts', () => {
    const payload = { ...sessionStart, ts: 1.5 };
    const result = HudEventSchema.safeParse(payload);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(['ts']);
    }
  });

  it('rejects unrecognized extra fields on a strict variant', () => {
    const payload = { ...sessionStart, rogueField: 'nope' };
    const result = HudEventSchema.safeParse(payload);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.code).toBe('unrecognized_keys');
    }
  });

  it('rejects tool.use missing the required tool field', () => {
    const { tool: _omit, ...payload } = toolUseEdit;
    const result = HudEventSchema.safeParse(payload);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(['tool']);
    }
  });

  it('rejects empty sessionId', () => {
    const payload = { ...sessionStart, sessionId: '' };
    const result = HudEventSchema.safeParse(payload);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(['sessionId']);
    }
  });

  it('rejects agent.invoke missing agentName', () => {
    const { agentName: _omit, ...payload } = agentInvoke;
    const result = HudEventSchema.safeParse(payload);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(['agentName']);
    }
  });

  it('rejects agent.complete missing agentName', () => {
    const { agentName: _omit, ...payload } = agentComplete;
    const result = HudEventSchema.safeParse(payload);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(['agentName']);
    }
  });
});

describe('HudEventSchema — optional fields', () => {
  it('accepts session.start with claudeCodeVersion + defaultModel', () => {
    const payload = {
      ...sessionStart,
      claudeCodeVersion: '2.1.150',
      defaultModel: 'opus',
    };
    const result = HudEventSchema.safeParse(payload);
    expect(result.success).toBe(true);
    if (result.success && result.data.type === 'session.start') {
      expect(result.data.claudeCodeVersion).toBe('2.1.150');
      expect(result.data.defaultModel).toBe('opus');
    }
  });

  it('accepts agent.complete with an error field', () => {
    const payload = { ...agentComplete, error: 'agent crashed' };
    const result = HudEventSchema.safeParse(payload);
    expect(result.success).toBe(true);
    if (result.success && result.data.type === 'agent.complete') {
      expect(result.data.error).toBe('agent crashed');
    }
  });

  it('agent.invoke carries the parent prompt', () => {
    const result = HudEventSchema.safeParse(agentInvoke);
    expect(result.success).toBe(true);
    if (result.success && result.data.type === 'agent.invoke') {
      expect(result.data.prompt).toBeDefined();
      expect(typeof result.data.prompt).toBe('string');
      expect(result.data.prompt!.length).toBeGreaterThan(0);
    }
  });

  it('sessions.snapshot carries an array of CodeSessionInfo entries', () => {
    const result = HudEventSchema.safeParse(sessionsSnapshot);
    expect(result.success).toBe(true);
    if (result.success && result.data.type === 'sessions.snapshot') {
      expect(result.data.sessions.length).toBe(2);
      expect(result.data.sessions[0]!.name).toBe('Edit bank profile - popup');
      expect(result.data.sessions[0]!.status).toBe('blocked');
      expect(result.data.sessions[1]!.kind).toBe('fg');
    }
  });

  it('CodeSessionInfo carries the optional lastActivityAt (JSONL mtime)', () => {
    const result = HudEventSchema.safeParse(sessionsSnapshot);
    expect(result.success).toBe(true);
    if (result.success && result.data.type === 'sessions.snapshot') {
      expect(result.data.sessions[0]!.lastActivityAt).toBe(1779608790000);
      expect(result.data.sessions[1]!.lastActivityAt).toBe(1779608100000);
    }
  });

  it('CodeSessionInfo carries pinnedByClaudeCode + detail + tempo from ~/.claude/jobs/<short>/state.json', () => {
    const result = HudEventSchema.safeParse(sessionsSnapshot);
    expect(result.success).toBe(true);
    if (result.success && result.data.type === 'sessions.snapshot') {
      const first = result.data.sessions[0]!;
      expect(first.status).toBe('blocked');
      expect(first.pinnedByClaudeCode).toBe(true);
      expect(first.detail).toBe('awaiting reviewer confirmation on schema change');
      expect(first.tempo).toBe('blocked');
      // The second fixture entry omits the new fields — confirms they're optional.
      const second = result.data.sessions[1]!;
      expect(second.pinnedByClaudeCode).toBeUndefined();
      expect(second.detail).toBeUndefined();
      expect(second.tempo).toBeUndefined();
    }
  });

  it('CodeSessionInfo accepts a session without lastActivityAt', () => {
    const payload = {
      type: 'sessions.snapshot',
      ts: 1779608768000,
      sessions: [
        {
          pid: 1,
          sessionId: 'sess',
          name: 'No JSONL yet',
          cwd: '/tmp',
          status: 'busy',
          kind: 'bg',
          startedAt: 1,
          updatedAt: 2,
        },
      ],
    };
    const result = HudEventSchema.safeParse(payload);
    expect(result.success).toBe(true);
  });

  it('sessions.snapshot accepts an empty sessions array', () => {
    const payload = { type: 'sessions.snapshot', ts: 1779608000000, sessions: [] };
    const result = HudEventSchema.safeParse(payload);
    expect(result.success).toBe(true);
  });

  it('sessions.snapshot rejects more than 1000 sessions (C1)', () => {
    const entry = {
      sessionId: 'x', name: 'n', cwd: '/tmp', status: 'active',
      kind: 'fg', startedAt: 1, updatedAt: 1,
    };
    const payload = {
      type: 'sessions.snapshot',
      ts: 1779608000000,
      sessions: Array.from({ length: 1001 }, () => ({ ...entry })),
    };
    const result = HudEventSchema.safeParse(payload);
    expect(result.success).toBe(false);
  });

  it('sessions.snapshot accepts exactly 1000 sessions (C1)', () => {
    const entry = {
      sessionId: 'x', name: 'n', cwd: '/tmp', status: 'active',
      kind: 'fg', startedAt: 1, updatedAt: 1,
    };
    const payload = {
      type: 'sessions.snapshot',
      ts: 1779608000000,
      sessions: Array.from({ length: 1000 }, (_, i) => ({ ...entry, sessionId: 's' + i })),
    };
    const result = HudEventSchema.safeParse(payload);
    expect(result.success).toBe(true);
  });

  it('sessions.snapshot rejects a session entry missing name', () => {
    const broken = {
      ...sessionsSnapshot,
      sessions: [
        { ...sessionsSnapshot.sessions[0], name: undefined },
      ],
    };
    const result = HudEventSchema.safeParse(broken);
    expect(result.success).toBe(false);
  });
});

describe('HudEventSchema — type inference', () => {
  it('narrows by discriminator', () => {
    const parsed = HudEventSchema.parse(toolUseEdit) as HudEvent;
    if (parsed.type === 'tool.use') {
      expectTypeOf(parsed).toEqualTypeOf<ToolUseEvent>();
      expect(parsed.tool).toBe('Edit');
    } else {
      throw new Error('expected tool.use');
    }
  });

  it('exposes per-variant types', () => {
    expectTypeOf<SessionStartEvent['type']>().toEqualTypeOf<'session.start'>();
    expectTypeOf<TurnStopEvent['type']>().toEqualTypeOf<'turn.stop'>();
  });
});
