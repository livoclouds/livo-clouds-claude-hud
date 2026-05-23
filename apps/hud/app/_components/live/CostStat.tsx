'use client';

import { useHud } from './HudProvider';
import { AnimatedNumber } from './AnimatedNumber';
import { formatCost } from '@/lib/format';
import { LongPressable } from '../LongPressable';
import { useMetricSheet } from '../MetricSheet';

export function CostStat() {
  const costUsd = useHud((s) => s.costUsd);
  const { show } = useMetricSheet();

  return (
    <LongPressable onLongPress={() => show('cost')}>
      <div className="hud-card p-6">
        <p className="hud-fg-muted text-xs uppercase tracking-wider">Cost</p>
        <p className="mt-4 font-mono text-3xl tabular-nums hud-fg">
          <AnimatedNumber value={costUsd} format={formatCost} />
        </p>
        <p className="hud-fg-muted mt-2 text-xs">Running total · USD</p>
      </div>
    </LongPressable>
  );
}
