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
import errorEvent from './fixtures/error.json' with { type: 'json' };

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
  ['error', errorEvent],
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
