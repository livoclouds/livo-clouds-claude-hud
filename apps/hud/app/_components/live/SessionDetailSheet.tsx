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
import { SessionStatusIcon, type Bucket } from './SessionsDashboard';
import { usePinnedCodeSessions } from '@/lib/pins';
import type { HudCodeSession } from '@/lib/store';
import { relativeTime, truncate } from '@/lib/format';

type SheetState = {
  open: string | null;
  show: (sessionId: string) => void;
  hide: () => void;
};

const SessionDetailSheetContext = createContext<SheetState | null>(null);

export function SessionDetailSheetProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState<string | null>(null);
  const show = useCallback((sessionId: string) => setOpen(sessionId), []);
  const hide = useCallback(() => setOpen(null), []);
  return (
    <SessionDetailSheetContext.Provider value={{ open, show, hide }}>
      {children}
      <SessionDetailSheet />
    </SessionDetailSheetContext.Provider>
  );
}

export function useSessionDetailSheet(): SheetState {
  const ctx = useContext(SessionDetailSheetContext);
  if (!ctx) {
    throw new Error('useSessionDetailSheet must be used inside <SessionDetailSheetProvider>');
  }
  return ctx;
}

const DISMISS_THRESHOLD = 96;
const DISMISS_VELOCITY = 0.4;

const BUCKET_COLOR: Record<Bucket, string> = {
  awaiting: 'var(--color-hud-accent)',
  working: 'var(--color-hud-warn)',
  completed: 'var(--color-hud-success)',
};

const BUCKET_LABEL: Record<Bucket, string> = {
  awaiting: 'Awaiting input',
  working: 'Working',
  completed: 'Completed',
};

// Same precedence the SessionsDashboard uses — duplicated here so this sheet
// stays self-contained. If the rules diverge, the dashboard is authoritative.
function bucketFor(session: HudCodeSession): Bucket {
  const s = session.status.toLowerCase();
  if (s === 'blocked') return 'awaiting';
  if (s === 'working') return 'working';
  if (s === 'done') return 'completed';
  if (s === 'busy' || s === 'running' || s === 'shell') return 'working';
  if (s === 'awaiting_input' || s === 'awaiting' || s === 'idle' || s === 'waiting') return 'awaiting';
  return 'completed';
}

function formatIsoOrDash(ms: number | null | undefined): string {
  if (!ms || ms <= 0) return '—';
  try {
    return new Date(ms).toISOString();
  } catch {
    return '—';
  }
}

function SessionDetailSheet() {
  const { open, hide } = useSessionDetailSheet();
  const session = useHud((s) => (open ? s.codeSessions[open] ?? null : null));
  const reduced = useReducedMotion();
  const hydrated = useHudHydrated();
  const { isPinned, toggle } = usePinnedCodeSessions();
  const titleId = useId();
  const y = useMotionValue(0);
  const lastTrigger = useRef<HTMLElement | null>(null);
  const [now, setNow] = useState(() => Date.now());

  // Restore focus when the sheet closes.
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

  // Tick every 10 s so relative timestamps stay fresh while the sheet is up.
  useEffect(() => {
    if (!open) return;
    const id = setInterval(() => setNow(Date.now()), 10_000);
    return () => clearInterval(id);
  }, [open]);

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
      {open && session ? (
        <motion.div
          key="session-backdrop"
          className="fixed inset-0 z-50 bg-black/55"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduced ? 0 : 0.18 }}
          onClick={hide}
          data-no-swipe="true"
        >
          <motion.div
            key="session-sheet"
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

            <SessionHeader
              session={session}
              titleId={titleId}
              hide={hide}
              isPinned={isPinned(session.sessionId)}
              onTogglePin={() => toggle(session.sessionId)}
            />

            <div className="mt-4 overflow-y-auto pr-1">
              <SessionBody session={session} now={now} hydrated={hydrated} />
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

function SessionHeader({
  session,
  titleId,
  hide,
  isPinned,
  onTogglePin,
}: {
  session: HudCodeSession;
  titleId: string;
  hide: () => void;
  isPinned: boolean;
  onTogglePin: () => void;
}) {
  const bucket = bucketFor(session);
  const color = BUCKET_COLOR[bucket];
  return (
    <>
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <SessionStatusIcon bucket={bucket} size={18} />
          <h2
            id={titleId}
            className="hud-fg truncate font-mono text-base"
            title={session.name}
          >
            {session.name}
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onTogglePin}
            aria-label={isPinned ? 'Unpin from HUD' : 'Pin in HUD'}
            title={isPinned ? 'Unpin from HUD' : 'Pin in HUD'}
            className="inline-flex h-11 w-11 items-center justify-center rounded-full text-[color:var(--color-hud-fg-muted)] hover:text-[color:var(--color-hud-fg)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-hud-accent)]"
            style={isPinned ? { color: 'var(--color-hud-accent)' } : undefined}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill={isPinned ? 'currentColor' : 'none'}
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M12 17v5" />
              <path d="M5 17h14l-2-5V5H7v7l-2 5Z" />
            </svg>
          </button>
          <button
            type="button"
            onClick={hide}
            aria-label="Dismiss"
            className="inline-flex h-11 w-11 items-center justify-center rounded-full text-[color:var(--color-hud-fg-soft)] hover:text-[color:var(--color-hud-fg)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-hud-accent)]"
          >
            ✕
          </button>
        </div>
      </div>
      <div className="hud-fg-muted mt-1 flex flex-wrap items-center gap-2 text-xs">
        <span
          className="rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wider"
          style={{
            background: `color-mix(in srgb, ${color} 18%, transparent)`,
            color,
          }}
        >
          {BUCKET_LABEL[bucket]}
        </span>
        {session.pinnedByClaudeCode && (
          <span
            className="rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wider"
            style={{
              background: 'color-mix(in srgb, var(--color-hud-accent) 14%, transparent)',
              color: 'var(--color-hud-accent)',
            }}
            title="Pinned in Claude Code (~/.claude/jobs/pins.json)"
          >
            ★ pinned in Claude Code
          </span>
        )}
        {session.kind && (
          <span
            className="hud-fg-muted rounded-full px-1.5 text-[10px] font-medium uppercase tracking-wide"
            style={{ background: 'var(--color-hud-card-bg)' }}
            title={`kind: ${session.kind}`}
          >
            {session.kind}
          </span>
        )}
      </div>
    </>
  );
}

function SessionBody({
  session,
  now,
  hydrated,
}: {
  session: HudCodeSession;
  now: number;
  hydrated: boolean;
}) {
  const lastActivity = session.lastActivityAt ?? session.updatedAt;
  return (
    <>
      <section className="mt-2">
        <p className="hud-fg-muted text-[10px] uppercase tracking-wider">Working directory</p>
        <pre className="hud-fg-soft mt-1 overflow-x-auto rounded-md border border-[var(--color-hud-card-border)] bg-[var(--color-hud-card-bg)] px-3 py-2 font-mono text-[11px] leading-snug">
          {session.cwd}
        </pre>
      </section>

      {session.detail && (
        <section className="mt-4">
          <p className="hud-fg-muted text-[10px] uppercase tracking-wider">Detail</p>
          <p className="hud-fg-soft mt-1 whitespace-pre-wrap text-sm leading-snug">
            {session.detail}
          </p>
        </section>
      )}

      <section className="mt-4">
        <p className="hud-fg-muted text-[10px] uppercase tracking-wider">Metadata</p>
        <dl className="mt-2 grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-2">
          <Meta label="Session ID" value={truncate(session.sessionId, 28)} title={session.sessionId} mono />
          <Meta
            label="PID"
            value={typeof session.pid === 'number' && session.pid > 0 ? String(session.pid) : '—'}
            mono
          />
          <Meta label="Claude Code" value={session.version ?? '—'} mono />
          <Meta label="Agent" value={session.agent ?? '—'} mono />
          {session.tempo && <Meta label="Tempo" value={session.tempo} mono />}
          <Meta
            label="Last activity"
            value={hydrated ? relativeTime(lastActivity, now) : '…'}
            title={formatIsoOrDash(lastActivity)}
          />
          <Meta
            label="Updated"
            value={hydrated ? relativeTime(session.updatedAt, now) : '…'}
            title={formatIsoOrDash(session.updatedAt)}
          />
          <Meta
            label="Started"
            value={hydrated ? relativeTime(session.startedAt, now) : '…'}
            title={formatIsoOrDash(session.startedAt)}
          />
        </dl>
      </section>
    </>
  );
}

function Meta({
  label,
  value,
  title,
  mono = false,
}: {
  label: string;
  value: string;
  title?: string;
  mono?: boolean;
}) {
  return (
    <div className="min-w-0">
      <dt className="hud-fg-muted text-[10px] uppercase tracking-wider">{label}</dt>
      <dd
        className={`hud-fg-soft mt-0.5 truncate text-xs ${mono ? 'font-mono' : ''}`}
        title={title ?? value}
      >
        {value}
      </dd>
    </div>
  );
}
