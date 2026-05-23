'use client';

import { useHud } from './HudProvider';
import { AnimatedNumber } from './AnimatedNumber';
import { formatTokens } from '@/lib/format';
import { LongPressable } from '../LongPressable';
import { useMetricSheet } from '../MetricSheet';

export function TokenStat() {
  const tokens = useHud((s) => s.tokens);
  const { show } = useMetricSheet();

  return (
    <LongPressable onLongPress={() => show('tokens')}>
      <div className="hud-card p-6">
        <p className="hud-fg-muted text-xs uppercase tracking-wider">Tokens</p>
        <div className="mt-4 grid grid-cols-3 gap-4">
          <Stat label="In" value={tokens.in} />
          <Stat label="Out" value={tokens.out} />
          <Stat label="Cached" value={tokens.cached} />
        </div>
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
