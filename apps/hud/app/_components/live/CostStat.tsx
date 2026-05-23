'use client';

import { useHud } from './HudProvider';
import { AnimatedNumber } from './AnimatedNumber';
import { formatCost } from '@/lib/format';

export function CostStat() {
  const costUsd = useHud((s) => s.costUsd);

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-xl">
      <p className="text-xs uppercase tracking-wider text-white/40">Cost</p>
      <p className="mt-4 font-mono text-3xl text-white/90 tabular-nums">
        <AnimatedNumber value={costUsd} format={formatCost} />
      </p>
      <p className="mt-2 text-xs text-white/40">Running total · USD</p>
    </div>
  );
}
