'use client';

import { useHud } from './HudProvider';
import { AnimatedNumber } from './AnimatedNumber';
import { formatTokens } from '@/lib/format';

export function TokenStat() {
  const tokens = useHud((s) => s.tokens);

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-xl">
      <p className="text-xs uppercase tracking-wider text-white/40">Tokens</p>
      <div className="mt-4 grid grid-cols-3 gap-4">
        <Stat label="In" value={tokens.in} />
        <Stat label="Out" value={tokens.out} />
        <Stat label="Cached" value={tokens.cached} />
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-white/40">{label}</p>
      <p className="mt-1 font-mono text-2xl text-white/90 tabular-nums">
        <AnimatedNumber value={value} format={formatTokens} />
      </p>
    </div>
  );
}
