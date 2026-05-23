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
import { useHud } from './live/HudProvider';
import { formatCost, formatPct, formatTokens } from '@/lib/format';
import { contextBand } from '@/lib/thresholds';

export type MetricKey = 'tokens' | 'cost' | 'context';

type SheetState = {
  open: MetricKey | null;
  show: (key: MetricKey) => void;
  hide: () => void;
};

const MetricSheetContext = createContext<SheetState | null>(null);

export function MetricSheetProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState<MetricKey | null>(null);

  const show = useCallback((key: MetricKey) => setOpen(key), []);
  const hide = useCallback(() => setOpen(null), []);

  return (
    <MetricSheetContext.Provider value={{ open, show, hide }}>
      {children}
      <MetricSheet />
    </MetricSheetContext.Provider>
  );
}

export function useMetricSheet(): SheetState {
  const ctx = useContext(MetricSheetContext);
  if (!ctx) throw new Error('useMetricSheet must be used inside <MetricSheetProvider>');
  return ctx;
}

const TITLES: Record<MetricKey, string> = {
  tokens: 'Tokens',
  cost: 'Cost',
  context: 'Context window',
};

const DISMISS_THRESHOLD = 96;
const DISMISS_VELOCITY = 0.4;

function MetricSheet() {
  const { open, hide } = useMetricSheet();
  const reduced = useReducedMotion();
  const titleId = useId();
  const y = useMotionValue(0);
  const lastTrigger = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (open) {
      lastTrigger.current = (document.activeElement as HTMLElement) ?? null;
    } else if (lastTrigger.current) {
      try {
        lastTrigger.current.focus({ preventScroll: true });
      } catch {
        // Ignore — the originating element may have unmounted.
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
      {open ? (
        <motion.div
          key="backdrop"
          className="fixed inset-0 z-50 bg-black/55"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduced ? 0 : 0.18 }}
          onClick={hide}
          data-no-swipe="true"
        >
          <motion.div
            key="sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className="hud-card absolute inset-x-0 bottom-0 mx-auto max-w-2xl p-6"
            style={
              reduced
                ? { borderRadius: '20px 20px 0 0' }
                : { borderRadius: '20px 20px 0 0', y }
            }
            initial={reduced ? { opacity: 0 } : { y: 360 }}
            animate={reduced ? { opacity: 1 } : { y: 0 }}
            exit={reduced ? { opacity: 0 } : { y: 360 }}
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
              <h2 id={titleId} className="font-mono text-base hud-fg">
                {TITLES[open]}
              </h2>
              <button
                type="button"
                onClick={hide}
                aria-label="Dismiss"
                className="inline-flex h-11 w-11 items-center justify-center rounded-full text-[color:var(--color-hud-fg-soft)] hover:text-[color:var(--color-hud-fg)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-hud-accent)]"
              >
                ✕
              </button>
            </div>
            <div className="mt-4">
              <MetricBody metric={open} />
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

function MetricBody({ metric }: { metric: MetricKey }) {
  const tokens = useHud((s) => s.tokens);
  const costUsd = useHud((s) => s.costUsd);
  const contextPct = useHud((s) => s.contextPct);

  switch (metric) {
    case 'tokens':
      return (
        <div className="grid grid-cols-3 gap-4">
          <Stat label="In" value={formatTokens(tokens.in)} />
          <Stat label="Out" value={formatTokens(tokens.out)} />
          <Stat label="Cached" value={formatTokens(tokens.cached)} />
          <p className="hud-fg-muted col-span-3 text-xs">
            Cumulative tokens reported for the current session. The HUD never
            charges or rate-limits — these are display values only.
          </p>
        </div>
      );
    case 'cost':
      return (
        <div className="space-y-3">
          <p className="font-mono text-3xl tabular-nums hud-fg">
            {formatCost(costUsd)}
          </p>
          <p className="hud-fg-muted text-xs">
            Running cost for the active session, in USD. The 14-day breakdown
            lives on the <span className="font-mono">/cost</span> view.
          </p>
        </div>
      );
    case 'context': {
      const band = contextBand(contextPct);
      return (
        <div className="space-y-4">
          <p className="font-mono text-3xl tabular-nums hud-fg">
            {formatPct(contextPct)}
          </p>
          <div className="hud-fg-soft text-xs">
            <ul className="space-y-1">
              <li>
                <span className="hud-accent">●</span> 0–69% &nbsp;Within budget
              </li>
              <li>
                <span style={{ color: 'var(--color-hud-warn)' }}>●</span> 70–89%
                &nbsp;Approaching limit
              </li>
              <li>
                <span style={{ color: 'var(--color-hud-critical)' }}>●</span> ≥90%
                &nbsp;Critical — compact soon
              </li>
            </ul>
          </div>
          <p className="hud-fg-muted text-xs">
            Current band:{' '}
            <span className="font-mono hud-fg">{band}</span>
          </p>
        </div>
      );
    }
  }
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="hud-card p-3">
      <p className="hud-fg-muted text-[10px] uppercase tracking-wider">{label}</p>
      <p className="mt-2 font-mono text-xl tabular-nums hud-fg">{value}</p>
    </div>
  );
}
