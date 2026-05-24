'use client';

import { AnimatePresence, motion } from 'motion/react';
import { useHud, useHudHydrated } from './HudProvider';
import { relativeTime, truncate } from '@/lib/format';
import { useGlobalTick } from '@/lib/use-global-tick';
import { selectLastTool } from '@/lib/store-selectors';

export function LastTool() {
  const lastTool = useHud(selectLastTool);
  const hydrated = useHudHydrated();
  const now = useGlobalTick('fast');

  return (
    <div className="hud-card p-6">
      <p className="hud-fg-muted text-xs uppercase tracking-wider">Last tool</p>
      <div className="mt-4 min-h-[44px]">
        <AnimatePresence mode="wait">
          {lastTool ? (
            <motion.div
              key={`${lastTool.name}-${lastTool.ts}`}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.18 }}
              className="flex items-center gap-3"
            >
              <span
                className="inline-flex max-w-full items-center rounded-full border border-[var(--color-hud-card-border)] bg-[var(--color-hud-card-bg)] px-3 py-2 font-mono text-sm hud-fg"
                title={lastTool.name}
              >
                {truncate(lastTool.name, 28)}
              </span>
              <span className="hud-fg-muted text-xs">
                {hydrated ? relativeTime(lastTool.ts, now) : '…'}
              </span>
            </motion.div>
          ) : (
            <motion.p
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="hud-fg-muted text-sm"
            >
              No tool calls yet
            </motion.p>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
