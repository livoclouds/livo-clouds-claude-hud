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
const agentName = z.string().min(1);

const SessionStart = z
  .object({
    type: z.literal('session.start'),
    sessionId,
    ts,
    cwd,
    model,
    // Claude Code runtime metadata, captured by the hook script from
    // CLAUDE_CODE_EXECPATH and ~/.claude/settings.json respectively. Both are
    // optional because older hook scripts (and synthetic test events) may not
    // provide them.
    claudeCodeVersion: z.string().min(1).optional(),
    defaultModel: z.string().min(1).optional(),
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

// Subagent lifecycle. AgentInvoke is emitted when Claude Code's `PostToolUse`
// hook fires with `tool_name == "Agent"`; AgentComplete is emitted on the
// `SubagentStop` hook (distinct from the parent-turn `Stop`). This is what
// powers the live agents dashboard in the HUD.
const AgentInvoke = z
  .object({
    type: z.literal('agent.invoke'),
    sessionId,
    ts,
    cwd,
    model,
    agentName,
    agentDescription: z.string().min(1).optional(),
    // CSS color name from the agent definition's frontmatter. Optional —
    // the hook script does not parse frontmatter today; the HUD falls back to
    // a built-in color map and then to status colors.
    agentColor: z.string().min(1).optional(),
  })
  .strict();

const AgentComplete = z
  .object({
    type: z.literal('agent.complete'),
    sessionId,
    ts,
    cwd,
    model,
    agentName,
    tokens: tokens.optional(),
    costUsd: costUsd.optional(),
    durationMs: durationMs.optional(),
    error: z.string().min(1).optional(),
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
  AgentInvoke,
  AgentComplete,
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
  'agent.invoke',
  'agent.complete',
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
export type AgentInvokeEvent = Extract<HudEvent, { type: 'agent.invoke' }>;
export type AgentCompleteEvent = Extract<HudEvent, { type: 'agent.complete' }>;
export type HudErrorEvent = Extract<HudEvent, { type: 'error' }>;
