import { describe, expect, it } from 'vitest';
import type { HudEvent } from '@livoclouds/contracts';
import {
  classifyTool,
  deriveMascotState,
  type MascotEnvelope,
} from './state';
import {
  COMPACT_END_WINDOW_MS,
  IDLE_TIMEOUT_MS,
  LISTEN_WINDOW_MS,
} from './timeouts';

const SESSION_ID = 'sess-test';

function envelope(event: HudEvent, idSuffix = ''): MascotEnvelope {
  return {
    id: `env-${event.type}-${event.ts}${idSuffix}`,
    event,
  };
}

// Build an event without re-stating ts/sessionId in every fixture. The discriminated
// union is loosened to a generic record at construction and re-asserted as HudEvent —
// the runtime shape still matches the schema; this only relaxes the literal narrowing
// the test helper would otherwise require.
function at(ts: number, partial: Record<string, unknown> & { type: HudEvent['type'] }): HudEvent {
  return { ...partial, ts, sessionId: SESSION_ID } as unknown as HudEvent;
}

describe('deriveMascotState', () => {
  it('returns idle when no events have been seen', () => {
    expect(deriveMascotState({ recentEvents: [], nowMs: 1_000 })).toBe('idle');
  });

  it('returns idle when the latest event is older than IDLE_TIMEOUT_MS', () => {
    const e = envelope(at(1_000, { type: 'tool.use', tool: 'Bash' }));
    expect(
      deriveMascotState({
        recentEvents: [e],
        nowMs: 1_000 + IDLE_TIMEOUT_MS + 1,
      }),
    ).toBe('idle');
  });

  it('maps session.start → idle', () => {
    const e = envelope(at(1_000, { type: 'session.start' }));
    expect(deriveMascotState({ recentEvents: [e], nowMs: 1_001 })).toBe('idle');
  });

  it('maps session.end → succeeded', () => {
    const e = envelope(at(1_000, { type: 'session.end' }));
    expect(deriveMascotState({ recentEvents: [e], nowMs: 1_001 })).toBe(
      'succeeded',
    );
  });

  it('prompt.submit is listening within LISTEN_WINDOW_MS, then thinking', () => {
    const e = envelope(at(1_000, { type: 'prompt.submit' }));
    expect(deriveMascotState({ recentEvents: [e], nowMs: 1_100 })).toBe(
      'listening',
    );
    expect(
      deriveMascotState({
        recentEvents: [e],
        nowMs: 1_000 + LISTEN_WINDOW_MS + 1,
      }),
    ).toBe('thinking');
  });

  it('classifies tool.use Edit/Write/MultiEdit as editing', () => {
    for (const tool of ['Edit', 'Write', 'MultiEdit', 'NotebookEdit', 'Update']) {
      const e = envelope(at(1_000, { type: 'tool.use', tool }));
      expect(deriveMascotState({ recentEvents: [e], nowMs: 1_001 })).toBe(
        'editing',
      );
    }
  });

  it('classifies tool.use Bash/BashOutput as running', () => {
    for (const tool of ['Bash', 'BashOutput', 'KillBash']) {
      const e = envelope(at(1_000, { type: 'tool.use', tool }));
      expect(deriveMascotState({ recentEvents: [e], nowMs: 1_001 })).toBe(
        'running',
      );
    }
  });

  it('classifies unknown tools as thinking', () => {
    const e = envelope(at(1_000, { type: 'tool.use', tool: 'Read' }));
    expect(deriveMascotState({ recentEvents: [e], nowMs: 1_001 })).toBe(
      'thinking',
    );
  });

  it('maps turn.stop → succeeded', () => {
    const e = envelope(at(1_000, { type: 'turn.stop' }));
    expect(deriveMascotState({ recentEvents: [e], nowMs: 1_001 })).toBe(
      'succeeded',
    );
  });

  it('maps compact.start → compacting', () => {
    const e = envelope(at(1_000, { type: 'compact.start' }));
    expect(deriveMascotState({ recentEvents: [e], nowMs: 1_001 })).toBe(
      'compacting',
    );
  });

  it('compact.end stays compacting within window then falls back to prior state', () => {
    const tool = envelope(at(500, { type: 'tool.use', tool: 'Bash' }));
    const compactStart = envelope(at(800, { type: 'compact.start' }));
    const compactEnd = envelope(at(1_000, { type: 'compact.end' }));
    expect(
      deriveMascotState({
        recentEvents: [tool, compactStart, compactEnd],
        nowMs: 1_100,
      }),
    ).toBe('compacting');
    expect(
      deriveMascotState({
        recentEvents: [tool, compactStart, compactEnd],
        nowMs: 1_000 + COMPACT_END_WINDOW_MS + 1,
      }),
    ).toBe('running');
  });

  it('compact.end with no prior activity falls back to idle', () => {
    const compactStart = envelope(at(800, { type: 'compact.start' }));
    const compactEnd = envelope(at(1_000, { type: 'compact.end' }));
    expect(
      deriveMascotState({
        recentEvents: [compactStart, compactEnd],
        nowMs: 1_000 + COMPACT_END_WINDOW_MS + 1,
      }),
    ).toBe('idle');
  });

  it('maps error → errored', () => {
    const e = envelope(at(1_000, { type: 'error', message: 'boom' }));
    expect(deriveMascotState({ recentEvents: [e], nowMs: 1_001 })).toBe(
      'errored',
    );
  });

  it('maps agent.invoke → running', () => {
    const e = envelope(at(1_000, { type: 'agent.invoke', agentName: 'Explore' }));
    expect(deriveMascotState({ recentEvents: [e], nowMs: 1_001 })).toBe(
      'running',
    );
  });

  it('maps agent.complete (no error) → succeeded', () => {
    const e = envelope(at(1_000, { type: 'agent.complete', agentName: 'Explore' }));
    expect(deriveMascotState({ recentEvents: [e], nowMs: 1_001 })).toBe(
      'succeeded',
    );
  });

  it('maps agent.complete with error → errored', () => {
    const e = envelope(
      at(1_000, { type: 'agent.complete', agentName: 'Plan', error: 'boom' }),
    );
    expect(deriveMascotState({ recentEvents: [e], nowMs: 1_001 })).toBe(
      'errored',
    );
  });

  it('latest event wins on back-to-back conflicting events', () => {
    const toolUse = envelope(at(1_000, { type: 'tool.use', tool: 'Bash' }));
    const turnStop = envelope(at(1_010, { type: 'turn.stop' }));
    expect(
      deriveMascotState({ recentEvents: [toolUse, turnStop], nowMs: 1_020 }),
    ).toBe('succeeded');
  });
});

describe('classifyTool', () => {
  it.each([
    ['Edit', 'editing'],
    ['Write', 'editing'],
    ['MultiEdit', 'editing'],
    ['Bash', 'running'],
    ['BashOutput', 'running'],
    ['Read', 'thinking'],
    ['Grep', 'thinking'],
    ['WebFetch', 'thinking'],
  ] as const)('classifies %s → %s', (tool, expected) => {
    expect(classifyTool(tool)).toBe(expected);
  });
});
