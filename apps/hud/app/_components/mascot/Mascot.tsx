'use client';

import { useMemo } from 'react';
import {
  AnimatePresence,
  motion,
  useReducedMotion,
  type TargetAndTransition,
  type Transition,
} from 'motion/react';
import { useHud } from '../live/HudProvider';
import { deriveMascotState, type MascotState } from '@/lib/mascot/state';
import type { HudEnvelope } from '@/lib/store';
import { MascotGlyph } from './MascotGlyph';
import { useDocumentVisibility } from '@/lib/use-visibility';
import { useGlobalTick } from '@/lib/use-global-tick';
import { selectRecentEvents } from '@/lib/store-selectors';

const STATE_TINT: Record<MascotState, string> = {
  idle: 'text-[color:var(--color-hud-fg-soft)]',
  listening: 'text-[var(--color-hud-accent)]',
  thinking: 'text-[var(--color-hud-accent)]',
  editing: 'text-[var(--color-hud-accent)]',
  running: 'text-[var(--color-hud-warn)]',
  succeeded: 'text-[color:var(--color-hud-success)]',
  errored: 'text-[var(--color-hud-critical)]',
  compacting: 'text-sky-300',
};

const STATE_LABEL: Record<MascotState, string> = {
  idle: 'Idle',
  listening: 'Listening',
  thinking: 'Thinking',
  editing: 'Editing',
  running: 'Running command',
  succeeded: 'Succeeded',
  errored: 'Error',
  compacting: 'Compacting context',
};

const SPRING: Transition = { type: 'spring', stiffness: 110, damping: 18 };

// Variants animate compositor-friendly properties only (transform, opacity,
// filter) so the mascot stays on the GPU and doesn't trigger layout passes.
const VARIANTS: Record<MascotState, TargetAndTransition> = {
  idle: {
    scale: [1, 1.04, 1],
    rotate: 0,
    opacity: [0.85, 1, 0.85],
    filter: 'drop-shadow(0 0 0px rgba(255,255,255,0))',
    transition: { duration: 3.6, repeat: Infinity, ease: 'easeInOut' },
  },
  listening: {
    scale: 1.06,
    rotate: -4,
    opacity: 1,
    filter: 'drop-shadow(0 0 14px rgba(204,120,92,0.45))',
    transition: { ...SPRING, duration: 0.45 },
  },
  thinking: {
    scale: [1, 1.02, 1],
    rotate: [0, 6, -6, 0],
    opacity: 1,
    filter: 'drop-shadow(0 0 10px rgba(204,120,92,0.35))',
    transition: { duration: 2.4, repeat: Infinity, ease: 'easeInOut' },
  },
  editing: {
    scale: [1, 1.05, 1],
    rotate: [0, 2, -2, 0],
    opacity: 1,
    filter: 'drop-shadow(0 0 12px rgba(204,120,92,0.5))',
    transition: { duration: 1.1, repeat: Infinity, ease: 'easeInOut' },
  },
  running: {
    scale: 1.04,
    rotate: 360,
    opacity: 1,
    filter: 'drop-shadow(0 0 12px rgba(232,163,61,0.55))',
    transition: {
      rotate: { duration: 4.5, repeat: Infinity, ease: 'linear' },
      default: SPRING,
    },
  },
  succeeded: {
    scale: [1, 1.15, 1.02],
    rotate: 0,
    opacity: 1,
    filter: 'drop-shadow(0 0 20px rgba(110,231,183,0.55))',
    transition: { duration: 1.2, ease: 'easeOut' },
  },
  errored: {
    scale: 1,
    rotate: 0,
    x: [0, -4, 4, -3, 3, 0],
    opacity: 1,
    filter: 'drop-shadow(0 0 16px rgba(224,85,106,0.6))',
    transition: { duration: 0.6, ease: 'easeInOut' },
  },
  compacting: {
    scale: [1, 0.7, 0.72, 0.7],
    rotate: 0,
    opacity: [1, 0.7, 0.85, 0.7],
    filter: 'drop-shadow(0 0 8px rgba(125,211,252,0.45))',
    transition: { duration: 1.6, repeat: Infinity, ease: 'easeInOut' },
  },
};

const STATIC_FRAME: TargetAndTransition = {
  scale: 1,
  rotate: 0,
  opacity: 1,
  x: 0,
  filter: 'drop-shadow(0 0 6px rgba(255,255,255,0.15))',
  transition: { duration: 0 },
};

const ORBIT_SPIN: TargetAndTransition = {
  rotate: 360,
  transition: { duration: 4.5, repeat: Infinity, ease: 'linear' },
};

export type MascotProps = {
  /** Optional override; when set, the diagnostics route can pin a state. */
  overrideState?: MascotState | null;
  /** Pixel size of the glyph; defaults to a fluid clamp. */
  size?: number;
};

export function Mascot({ overrideState = null, size }: MascotProps) {
  const recentEvents = useHud(selectRecentEvents);
  const reduced = useReducedMotion();
  const visibility = useDocumentVisibility();
  const isHidden = visibility !== 'visible';
  const state = useDerivedMascotState(recentEvents, overrideState);
  const label = STATE_LABEL[state];

  const showOrbit = state === 'running' && !reduced && !isHidden;

  return (
    <div
      role="img"
      aria-label={`Mascot: ${label}`}
      className="relative mx-auto flex items-center justify-center"
      style={{ width: size ?? 'min(28vw, 220px)', height: size ?? 'min(28vw, 220px)' }}
    >
      <motion.div
        key={reduced ? 'reduced' : 'animated'}
        className={`relative ${STATE_TINT[state]}`}
        initial={false}
        animate={reduced || isHidden ? STATIC_FRAME : VARIANTS[state]}
        style={{ transformOrigin: '50% 50%' }}
      >
        <MascotGlyph size={size ?? 160} />
      </motion.div>

      {/* Orbital terminal pip during `running` state. Hidden under reduced motion. */}
      <AnimatePresence>
        {showOrbit ? (
          <motion.div
            key="orbit"
            className="pointer-events-none absolute inset-0"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, ...ORBIT_SPIN }}
            exit={{ opacity: 0 }}
          >
            <div className="absolute left-1/2 top-0 -translate-x-1/2">
              <span className="block h-2 w-2 rounded-full bg-[var(--color-hud-warn)]" />
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {/* Screen-reader-only live region so changes are announced */}
      <span className="sr-only" aria-live="polite">
        {label}
      </span>
    </div>
  );
}

function useDerivedMascotState(
  recentEvents: ReadonlyArray<HudEnvelope>,
  overrideState: MascotState | null,
): MascotState {
  // Shared global tick replaces the per-component setInterval so the
  // idle-timeout fallback fires without fragmented polling.
  const nowSec = Math.floor(useGlobalTick('fast') / 1000);

  return useMemo(() => {
    if (overrideState !== null) return overrideState;
    return deriveMascotState({
      recentEvents,
      nowMs: nowSec * 1000,
    });
  }, [overrideState, recentEvents, nowSec]);
}
