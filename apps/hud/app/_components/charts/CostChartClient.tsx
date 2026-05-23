'use client';

import nextDynamic from 'next/dynamic';
import type { DayTotal } from '@/lib/aggregations';

// Recharts touches `document` at import time, so it must be loaded only after
// hydration. A thin client wrapper is the simplest way to keep the page itself
// a server component while disabling SSR for the chart bundle.
const CostChart = nextDynamic(() => import('./CostChart'), {
  ssr: false,
  loading: () => (
    <div
      className="hud-card grid place-items-center"
      style={{ aspectRatio: '2 / 1', minHeight: 280 }}
      data-no-swipe="true"
    >
      <span className="hud-fg-muted text-sm">Loading chart…</span>
    </div>
  ),
});

export function CostChartClient({ data }: { data: ReadonlyArray<DayTotal> }) {
  return <CostChart data={data} />;
}
