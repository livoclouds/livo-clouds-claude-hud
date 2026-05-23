'use client';

import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useHud } from './live/HudProvider';

const COPY = {
  reconnecting: 'Reconnecting…',
  disconnected: 'Disconnected — waiting for network',
} as const;

export function ConnectionBanner() {
  const state = useHud((s) => s.connectionState);
  const reduceMotion = useReducedMotion();
  const visible = state !== 'connected';
  const message = visible ? COPY[state] : null;

  return (
    <AnimatePresence>
      {visible ? (
        <motion.div
          key={state}
          initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -16 }}
          animate={reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
          exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -16 }}
          transition={{ duration: 0.18 }}
          role="status"
          aria-live="polite"
          data-no-swipe="true"
          className="pointer-events-none fixed left-0 right-0 top-0 z-50 flex justify-center px-3"
          style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 0.5rem)' }}
        >
          <div
            className="hud-card pointer-events-auto flex min-h-[44px] items-center gap-2 px-4 py-2 text-sm shadow-lg backdrop-blur"
            style={{
              borderColor:
                state === 'disconnected'
                  ? 'color-mix(in srgb, var(--color-hud-warn) 45%, transparent)'
                  : 'var(--color-hud-card-border)',
            }}
          >
            <span
              aria-hidden
              className={`inline-block h-2 w-2 rounded-full ${
                reduceMotion ? '' : 'animate-pulse'
              }`}
              style={{
                background:
                  state === 'disconnected'
                    ? 'var(--color-hud-warn)'
                    : 'var(--color-hud-accent)',
              }}
            />
            <span className="hud-fg font-mono text-xs uppercase tracking-wider">
              {message}
            </span>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
