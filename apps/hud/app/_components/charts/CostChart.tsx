'use client';

import { useEffect, useState } from 'react';
import { useReducedMotion } from 'motion/react';
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { DayTotal } from '@/lib/aggregations';
import { formatCost, formatTokens } from '@/lib/format';

export type CostChartProps = {
  data: ReadonlyArray<DayTotal>;
};

function shortDay(day: string): string {
  // day = YYYY-MM-DD → MM-DD for compactness on iPad portrait.
  return day.slice(5);
}

export default function CostChart({ data }: CostChartProps) {
  const reduced = useReducedMotion();
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);

  // Recharts measures from the DOM on mount; rendering only after hydration
  // avoids a brief 0-width container flash on slow iPads.
  if (!hydrated) {
    return (
      <div
        className="hud-card grid place-items-center"
        style={{ aspectRatio: '2 / 1', minHeight: 240 }}
        data-no-swipe="true"
      >
        <span className="hud-fg-muted text-sm">Loading chart…</span>
      </div>
    );
  }

  return (
    <div
      className="hud-card p-4"
      style={{ minHeight: 280 }}
      data-no-swipe="true"
    >
      <ResponsiveContainer width="100%" aspect={2}>
        <ComposedChart
          data={data.map((d) => ({ ...d, label: shortDay(d.day) }))}
          margin={{ top: 8, right: 16, bottom: 8, left: 0 }}
        >
          <CartesianGrid stroke="var(--color-hud-card-border)" strokeDasharray="3 3" />
          <XAxis
            dataKey="label"
            tick={{ fill: 'var(--color-hud-fg-muted)', fontSize: 11 }}
            stroke="var(--color-hud-card-border)"
          />
          <YAxis
            yAxisId="usd"
            tick={{ fill: 'var(--color-hud-fg-muted)', fontSize: 11 }}
            stroke="var(--color-hud-card-border)"
            tickFormatter={(v: number) => formatCost(v)}
            width={64}
          />
          <YAxis
            yAxisId="tokens"
            orientation="right"
            tick={{ fill: 'var(--color-hud-fg-muted)', fontSize: 11 }}
            stroke="var(--color-hud-card-border)"
            tickFormatter={(v: number) => formatTokens(v)}
            width={56}
          />
          <Tooltip
            contentStyle={{
              background: 'var(--color-hud-bg-elev)',
              border: '1px solid var(--color-hud-card-border)',
              borderRadius: 12,
              color: 'var(--color-hud-fg)',
              fontSize: 12,
            }}
            labelStyle={{ color: 'var(--color-hud-fg-soft)' }}
            formatter={(value: number, name: string) =>
              name === 'Cost (USD)'
                ? [formatCost(value), name]
                : [formatTokens(value), name]
            }
          />
          <Legend
            wrapperStyle={{ color: 'var(--color-hud-fg-soft)', fontSize: 12 }}
          />
          <Bar
            yAxisId="usd"
            dataKey="costUsd"
            name="Cost (USD)"
            fill="var(--color-hud-accent)"
            isAnimationActive={!reduced}
            radius={[4, 4, 0, 0]}
          />
          <Line
            yAxisId="tokens"
            type="monotone"
            dataKey="tokensOut"
            name="Tokens out"
            stroke="var(--color-hud-warn)"
            strokeWidth={2}
            dot={{ r: 3, fill: 'var(--color-hud-warn)' }}
            isAnimationActive={!reduced}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
