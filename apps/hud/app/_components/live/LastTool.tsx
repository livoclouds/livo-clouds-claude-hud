'use client';

import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useHud, useHudHydrated } from './HudProvider';
import { relativeTime, truncate } from '@/lib/format';

export function LastTool() {
  const lastTool = useHud((s) => s.lastTool);
  const hydrated = useHudHydrated();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!lastTool) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [lastTool]);

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-xl">
      <p className="text-xs uppercase tracking-wider text-white/40">Last tool</p>
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
                className="inline-flex max-w-full items-center rounded-full bg-white/10 px-3 py-2 font-mono text-sm text-white/90"
                title={lastTool.name}
              >
                {truncate(lastTool.name, 28)}
              </span>
              <span className="text-xs text-white/40">
                {hydrated ? relativeTime(lastTool.ts, now) : '…'}
              </span>
            </motion.div>
          ) : (
            <motion.p
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="text-sm text-white/40"
            >
              No tool calls yet
            </motion.p>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
