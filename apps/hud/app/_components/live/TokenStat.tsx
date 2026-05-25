'use client';

import { useHud } from './HudProvider';
import { AnimatedNumber } from './AnimatedNumber';
import { formatTokens } from '@/lib/format';
import { LongPressable } from '../LongPressable';
import { useMetricSheet } from '../MetricSheet';
import { Skeleton } from '../ui/Skeleton';

export function TokenStat() {
  const tokens = useHud((s) => s.tokens);
  // "Loading" = active session has no turn.metrics row yet. Distinct from
  // "no activity at all": once the user actually starts working, lastActivityAt
  // bumps but tokens stay 0 until the transcript poller catches up. We want
  // a Loading skeleton in that window, not a misleading "0/0/0".
  const loadingMetrics = useHud((s) => {
    if (!s.session) return true;
    return s.sessionMetrics[s.session.id] === undefined;
  });
  const currentAgent = useHud((s) => s.currentAgent);
  const { show } = useMetricSheet();

  return (
    <LongPressable onLongPress={() => show('tokens')}>
      <div className="hud-card p-6">
        <div className="flex items-baseline justify-between gap-3">
          <p className="hud-fg-muted text-xs uppercase tracking-wider">Tokens</p>
          {currentAgent && (
            <p className="hud-fg-muted text-[10px] uppercase tracking-wider">
              Subagent: <span className="hud-fg">{currentAgent}</span>
            </p>
          )}
        </div>
        {loadingMetrics ? (
          <div className="mt-4 grid grid-cols-3 gap-4">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        ) : (
          <div className="mt-4 grid grid-cols-3 gap-4">
            <Stat label="In" value={tokens.in} />
            <Stat label="Out" value={tokens.out} />
            <Stat label="Cached" value={tokens.cached} />
          </div>
        )}
        <p className="hud-fg-muted mt-3 text-[10px]">Long-press for details</p>
      </div>
    </LongPressable>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <p className="hud-fg-muted text-[10px] uppercase tracking-wider">{label}</p>
      <p className="mt-1 font-mono text-2xl tabular-nums hud-fg">
        <AnimatedNumber value={value} format={formatTokens} />
      </p>
    </div>
  );
}
