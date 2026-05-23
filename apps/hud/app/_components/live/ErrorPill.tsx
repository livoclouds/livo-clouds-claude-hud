'use client';

import { AnimatePresence, motion } from 'motion/react';
import { useHud } from './HudProvider';
import { truncate } from '@/lib/format';

export function ErrorPill() {
  const lastError = useHud((s) => s.lastError);

  return (
    <AnimatePresence>
      {lastError ? (
        <motion.div
          key={lastError.ts}
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.2 }}
          role="status"
          className="rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-2 text-sm text-red-200"
          title={lastError.message}
        >
          <span className="font-mono text-xs uppercase tracking-wider text-red-300/80">
            {lastError.tool ? `${lastError.tool} · error` : 'Error'}
          </span>
          <p className="mt-1">{truncate(lastError.message, 200)}</p>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
