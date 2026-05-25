'use client';

import { useHud } from './HudProvider';
import { AnimatedNumber } from './AnimatedNumber';
import { formatCost } from '@/lib/format';
import { LongPressable } from '../LongPressable';
import { useMetricSheet } from '../MetricSheet';
import { Skeleton } from '../ui/Skeleton';

export function CostStat() {
  const costUsd = useHud((s) => s.costUsd);
  const loadingMetrics = useHud((s) => {
    if (!s.session) return true;
    return s.sessionMetrics[s.session.id] === undefined;
  });
  const currentAgent = useHud((s) => s.currentAgent);
  const { show } = useMetricSheet();

  return (
    <LongPressable onLongPress={() => show('cost')}>
      <div className="hud-card p-6">
        <div className="flex items-baseline justify-between gap-3">
          <p className="hud-fg-muted text-xs uppercase tracking-wider">Cost</p>
          {currentAgent && (
            <p className="hud-fg-muted text-[10px] uppercase tracking-wider">
              Subagent: <span className="hud-fg">{currentAgent}</span>
            </p>
          )}
        </div>
        {loadingMetrics ? (
          <Skeleton className="mt-4 h-9 w-24" />
        ) : (
          <p className="mt-4 font-mono text-3xl tabular-nums hud-fg">
            <AnimatedNumber value={costUsd} format={formatCost} />
          </p>
        )}
        <p className="hud-fg-muted mt-2 text-xs">Running total · USD</p>
      </div>
    </LongPressable>
  );
}
