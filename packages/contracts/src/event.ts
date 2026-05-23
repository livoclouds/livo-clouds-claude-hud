import { z } from 'zod';

const sessionId = z.string().min(1);
const ts = z.number().int().nonnegative();
const cwd = z.string().min(1).optional();
const model = z.string().min(1).optional();
const tool = z.string().min(1);
const toolInput = z.record(z.string(), z.unknown()).optional();
const tokens = z
  .object({
    in: z.number().int().nonnegative(),
    out: z.number().int().nonnegative(),
    cached: z.number().int().nonnegative().optional(),
  })
  .strict();
const costUsd = z.number().nonnegative();
const contextPct = z.number().min(0).max(100);
const durationMs = z.number().int().nonnegative();

const SessionStart = z
  .object({
    type: z.literal('session.start'),
    sessionId,
    ts,
    cwd,
    model,
  })
  .strict();

const SessionEnd = z
  .object({
    type: z.literal('session.end'),
    sessionId,
    ts,
    cwd,
    model,
    tokens: tokens.optional(),
    costUsd: costUsd.optional(),
    durationMs: durationMs.optional(),
  })
  .strict();

const PromptSubmit = z
  .object({
    type: z.literal('prompt.submit'),
    sessionId,
    ts,
    cwd,
    model,
  })
  .strict();

const ToolUse = z
  .object({
    type: z.literal('tool.use'),
    sessionId,
    ts,
    cwd,
    model,
    tool,
    toolInput,
    durationMs: durationMs.optional(),
  })
  .strict();

const TurnStop = z
  .object({
    type: z.literal('turn.stop'),
    sessionId,
    ts,
    cwd,
    model,
    tokens: tokens.optional(),
    costUsd: costUsd.optional(),
    contextPct: contextPct.optional(),
    durationMs: durationMs.optional(),
  })
  .strict();

const CompactStart = z
  .object({
    type: z.literal('compact.start'),
    sessionId,
    ts,
    cwd,
    model,
  })
  .strict();

const CompactEnd = z
  .object({
    type: z.literal('compact.end'),
    sessionId,
    ts,
    cwd,
    model,
    durationMs: durationMs.optional(),
  })
  .strict();

const ErrorEvent = z
  .object({
    type: z.literal('error'),
    sessionId,
    ts,
    cwd,
    model,
    tool: tool.optional(),
    message: z.string().min(1).optional(),
  })
  .strict();

export const HudEventSchema = z.discriminatedUnion('type', [
  SessionStart,
  SessionEnd,
  PromptSubmit,
  ToolUse,
  TurnStop,
  CompactStart,
  CompactEnd,
  ErrorEvent,
]);

export const HudEventTypes = [
  'session.start',
  'session.end',
  'prompt.submit',
  'tool.use',
  'turn.stop',
  'compact.start',
  'compact.end',
  'error',
] as const;

export type HudEvent = z.infer<typeof HudEventSchema>;
export type HudEventType = HudEvent['type'];

export type SessionStartEvent = Extract<HudEvent, { type: 'session.start' }>;
export type SessionEndEvent = Extract<HudEvent, { type: 'session.end' }>;
export type PromptSubmitEvent = Extract<HudEvent, { type: 'prompt.submit' }>;
export type ToolUseEvent = Extract<HudEvent, { type: 'tool.use' }>;
export type TurnStopEvent = Extract<HudEvent, { type: 'turn.stop' }>;
export type CompactStartEvent = Extract<HudEvent, { type: 'compact.start' }>;
export type CompactEndEvent = Extract<HudEvent, { type: 'compact.end' }>;
export type HudErrorEvent = Extract<HudEvent, { type: 'error' }>;
