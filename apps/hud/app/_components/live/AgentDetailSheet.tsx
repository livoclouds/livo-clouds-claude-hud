'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  AnimatePresence,
  animate,
  motion,
  useMotionValue,
  useReducedMotion,
} from 'motion/react';
import { useDrag } from '@use-gesture/react';
import { useHud, useHudHydrated } from './HudProvider';
import { classifyTool } from '@/lib/mascot/state';
import type { HudAgent, HudAgentToolCall } from '@/lib/store';
import { relativeTime, truncate } from '@/lib/format';
import { useGlobalTick } from '@/lib/use-global-tick';

type SheetState = {
  open: string | null;
  show: (name: string) => void;
  hide: () => void;
};

const AgentDetailSheetContext = createContext<SheetState | null>(null);

export function AgentDetailSheetProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState<string | null>(null);
  const show = useCallback((name: string) => setOpen(name), []);
  const hide = useCallback(() => setOpen(null), []);
  return (
    <AgentDetailSheetContext.Provider value={{ open, show, hide }}>
      {children}
      <AgentDetailSheet />
    </AgentDetailSheetContext.Provider>
  );
}

export function useAgentDetailSheet(): SheetState {
  const ctx = useContext(AgentDetailSheetContext);
  if (!ctx) {
    throw new Error('useAgentDetailSheet must be used inside <AgentDetailSheetProvider>');
  }
  return ctx;
}

const DISMISS_THRESHOLD = 96;
const DISMISS_VELOCITY = 0.4;

const STATUS_COLOR: Record<HudAgent['status'], string> = {
  working: 'var(--color-hud-warn)',
  completed: 'var(--color-hud-success)',
  errored: 'var(--color-hud-critical)',
};

const TOOL_COLOR: Record<ReturnType<typeof classifyTool>, string> = {
  editing: 'var(--color-hud-accent)',
  running: 'var(--color-hud-warn)',
  thinking: 'var(--color-hud-fg-muted)',
  idle: 'var(--color-hud-fg-muted)',
  listening: 'var(--color-hud-accent)',
  succeeded: 'var(--color-hud-success)',
  errored: 'var(--color-hud-critical)',
  compacting: 'var(--color-hud-fg-muted)',
};

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const s = Math.round(ms / 100) / 10;
  if (s < 60) return `${s.toFixed(s < 10 ? 1 : 0)}s`;
  const m = Math.floor(s / 60);
  const rs = Math.round(s - m * 60);
  return rs === 0 ? `${m}m` : `${m}m${rs}s`;
}

// Picks the most informative single key/value from a tool's input to show on
// the collapsed row. Falls back to the JSON-stringified object.
function summarizeToolInput(input: Readonly<Record<string, unknown>> | null): string | null {
  if (!input) return null;
  const PRIORITY = [
    'command',
    'file_path',
    'pattern',
    'url',
    'prompt',
    'description',
    'query',
  ];
  for (const k of PRIORITY) {
    const v = input[k];
    if (typeof v === 'string' && v.length > 0) {
      return `${k}: ${v}`;
    }
  }
  // Fallback: first string-valued field.
  for (const [k, v] of Object.entries(input)) {
    if (typeof v === 'string' && v.length > 0) return `${k}: ${v}`;
  }
  try {
    return JSON.stringify(input);
  } catch {
    return null;
  }
}

function AgentDetailSheet() {
  const { open, hide } = useAgentDetailSheet();
  const agent = useHud((s) => (open ? s.agents[open] ?? null : null));
  const reduced = useReducedMotion();
  const hydrated = useHudHydrated();
  const titleId = useId();
  const y = useMotionValue(0);
  const lastTrigger = useRef<HTMLElement | null>(null);
  const now = useGlobalTick('fast');

  useEffect(() => {
    if (open) {
      lastTrigger.current = (document.activeElement as HTMLElement) ?? null;
    } else if (lastTrigger.current) {
      try {
        lastTrigger.current.focus({ preventScroll: true });
      } catch {
        // ignore
      }
      lastTrigger.current = null;
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') hide();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, hide]);

  useEffect(() => {
    if (!open) y.set(0);
  }, [open, y]);


  const bindDismiss = useDrag(
    ({ last, movement: [, my], velocity: [, vy], direction: [, dy] }) => {
      if (!last) {
        y.set(Math.max(0, my));
        return;
      }
      const shouldDismiss =
        (my > DISMISS_THRESHOLD || vy > DISMISS_VELOCITY) && dy > 0;
      if (shouldDismiss) {
        hide();
        return;
      }
      if (!reduced) void animate(y, 0, { type: 'spring', stiffness: 280, damping: 30 });
      else y.set(0);
    },
    { axis: 'y', filterTaps: true, pointer: { touch: true } },
  );

  return (
    <AnimatePresence>
      {open && agent ? (
        <motion.div
          key="agent-backdrop"
          className="fixed inset-0 z-50 bg-black/55"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduced ? 0 : 0.18 }}
          onClick={hide}
          data-no-swipe="true"
        >
          <motion.div
            key="agent-sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className="hud-card absolute inset-x-0 bottom-0 mx-auto flex max-h-[85vh] max-w-2xl flex-col p-6"
            style={
              reduced
                ? { borderRadius: '20px 20px 0 0' }
                : { borderRadius: '20px 20px 0 0', y }
            }
            initial={reduced ? { opacity: 0 } : { y: 480 }}
            animate={reduced ? { opacity: 1 } : { y: 0 }}
            exit={reduced ? { opacity: 0 } : { y: 480 }}
            transition={
              reduced ? { duration: 0 } : { type: 'spring', stiffness: 240, damping: 28 }
            }
            onClick={(e) => e.stopPropagation()}
          >
            <div
              {...bindDismiss()}
              className="-mt-2 mb-2 flex h-6 cursor-grab items-center justify-center"
              aria-hidden
            >
              <span className="block h-1.5 w-12 rounded-full bg-[var(--color-hud-card-border)]" />
            </div>
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0">
                <span
                  aria-hidden
                  style={{
                    display: 'inline-block',
                    width: 12,
                    height: 12,
                    borderRadius: 999,
                    background: STATUS_COLOR[agent.status],
                    boxShadow: `0 0 8px ${STATUS_COLOR[agent.status]}`,
                    flex: 'none',
                  }}
                />
                <h2 id={titleId} className="font-mono text-base hud-fg truncate" title={agent.name}>
                  {agent.name}
                </h2>
              </div>
              <button
                type="button"
                onClick={hide}
                aria-label="Dismiss"
                className="inline-flex h-11 w-11 items-center justify-center rounded-full text-[color:var(--color-hud-fg-soft)] hover:text-[color:var(--color-hud-fg)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-hud-accent)]"
              >
                ✕
              </button>
            </div>
            <div className="hud-fg-muted mt-1 flex items-center gap-2 text-xs">
              <span style={{ color: STATUS_COLOR[agent.status] }}>
                {agent.status === 'working' ? 'Working' : agent.status === 'completed' ? 'Completed' : 'Errored'}
              </span>
              <span aria-hidden>·</span>
              <span>
                {agent.status === 'working'
                  ? hydrated
                    ? `${formatDuration(Math.max(0, now - agent.startedAt))} elapsed`
                    : '…'
                  : formatDuration(agent.durationMs ?? Math.max(0, (agent.endedAt ?? agent.startedAt) - agent.startedAt))}
              </span>
              {agent.invocations > 1 && (
                <>
                  <span aria-hidden>·</span>
                  <span title={`Invoked ${agent.invocations} times`}>×{agent.invocations}</span>
                </>
              )}
            </div>

            <div className="mt-4 overflow-y-auto pr-1">
              {agent.description && (
                <section className="mt-2">
                  <p className="hud-fg-muted text-[10px] uppercase tracking-wider">Description</p>
                  <p className="hud-fg-soft mt-1 text-sm">{agent.description}</p>
                </section>
              )}
              {agent.prompt && (
                <section className="mt-4">
                  <p className="hud-fg-muted text-[10px] uppercase tracking-wider">Prompt</p>
                  <pre className="mt-1 max-h-48 overflow-y-auto whitespace-pre-wrap rounded-md border border-[var(--color-hud-card-border)] bg-[var(--color-hud-card-bg)] p-3 font-mono text-xs leading-relaxed hud-fg-soft">
                    {agent.prompt}
                  </pre>
                </section>
              )}
              <section className="mt-4">
                <p className="hud-fg-muted text-[10px] uppercase tracking-wider">
                  Tools executed ({agent.toolCalls.length})
                </p>
                {agent.toolCalls.length === 0 ? (
                  <p className="hud-fg-muted mt-1 text-xs">
                    {agent.status === 'working' ? 'Waiting for the first tool call…' : 'No tool calls captured.'}
                  </p>
                ) : (
                  <ul className="mt-2 space-y-1.5">
                    {agent.toolCalls.map((c, i) => (
                      <ToolRow key={`${c.name}-${c.ts}-${i}`} call={c} now={now} hydrated={hydrated} />
                    ))}
                  </ul>
                )}
              </section>
              {agent.error && (
                <section className="mt-4">
                  <p
                    className="text-[10px] uppercase tracking-wider"
                    style={{ color: 'var(--color-hud-critical)' }}
                  >
                    Error
                  </p>
                  <p className="mt-1 font-mono text-xs" style={{ color: 'var(--color-hud-critical)' }}>
                    {agent.error}
                  </p>
                </section>
              )}
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

function ToolRow({
  call,
  now,
  hydrated,
}: {
  call: HudAgentToolCall;
  now: number;
  hydrated: boolean;
}) {
  const tone = TOOL_COLOR[classifyTool(call.name)];
  const summary = summarizeToolInput(call.toolInput);
  return (
    <li className="rounded-md border border-[var(--color-hud-card-border)] bg-[var(--color-hud-card-bg)] px-3 py-2">
      <div className="flex items-center gap-2 text-xs">
        <span
          aria-hidden
          style={{
            display: 'inline-block',
            width: 8,
            height: 8,
            borderRadius: 999,
            background: tone,
            boxShadow: `0 0 4px color-mix(in srgb, ${tone} 50%, transparent)`,
            flex: 'none',
          }}
        />
        <span className="hud-fg font-mono">{call.name}</span>
        {call.durationMs !== null && (
          <span className="hud-fg-muted">· {formatDuration(call.durationMs)}</span>
        )}
        <span className="hud-fg-muted ml-auto">
          {hydrated ? relativeTime(call.ts, now) : '…'}
        </span>
      </div>
      {summary && (
        <p
          className="hud-fg-soft mt-1 truncate font-mono text-[11px]"
          title={summary}
        >
          {truncate(summary, 120)}
        </p>
      )}
    </li>
  );
}
