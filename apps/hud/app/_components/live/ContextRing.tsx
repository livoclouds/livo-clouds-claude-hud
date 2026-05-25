'use client';

import { motion, useReducedMotion, useSpring, useTransform } from 'motion/react';
import { useEffect } from 'react';
import { useHud } from './HudProvider';
import { contextBand } from '@/lib/thresholds';
import { formatPct } from '@/lib/format';
import { LongPressable } from '../LongPressable';
import { useMetricSheet } from '../MetricSheet';
import { Skeleton } from '../ui/Skeleton';

const SIZE = 140;
const STROKE = 12;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

const BAND_COLOR: Record<ReturnType<typeof contextBand>, string> = {
  neutral: 'var(--color-hud-accent)',
  warn: 'var(--color-hud-warn)',
  critical: 'var(--color-hud-critical)',
};

export function ContextRing() {
  const contextPct = useHud((s) => s.contextPct);
  const loading = useHud((s) => {
    if (!s.session) return true;
    return s.sessionMetrics[s.session.id] === undefined;
  });
  const currentAgent = useHud((s) => s.currentAgent);
  const clamped = Math.max(0, Math.min(100, contextPct));
  const band = contextBand(clamped);
  const reduceMotion = useReducedMotion();
  const { show } = useMetricSheet();

  const spring = useSpring(clamped, { stiffness: 200, damping: 30 });
  const dashOffset = useTransform(spring, (pct) => CIRCUMFERENCE * (1 - pct / 100));

  useEffect(() => {
    if (reduceMotion) {
      spring.jump(clamped);
    } else {
      spring.set(clamped);
    }
  }, [clamped, reduceMotion, spring]);

  return (
    <LongPressable onLongPress={() => show('context')}>
      <div className="hud-card p-6">
        <div className="flex items-baseline justify-between gap-3">
          <p className="hud-fg-muted text-xs uppercase tracking-wider">Context</p>
          {currentAgent && (
            <p className="hud-fg-muted text-[10px] uppercase tracking-wider">
              Subagent: <span className="hud-fg">{currentAgent}</span>
            </p>
          )}
        </div>
        {loading ? (
          <div className="mt-4 flex items-center justify-center">
            <Skeleton className="h-[140px] w-[140px] rounded-full" />
          </div>
        ) : (
          <div className="mt-4 flex items-center justify-center">
            <svg
              width={SIZE}
              height={SIZE}
              viewBox={`0 0 ${SIZE} ${SIZE}`}
              role="img"
              aria-label={`Context usage ${clamped.toFixed(0)} percent (${band})`}
            >
              <circle
                cx={SIZE / 2}
                cy={SIZE / 2}
                r={RADIUS}
                stroke="var(--color-hud-card-border)"
                strokeWidth={STROKE}
                fill="none"
              />
              <motion.circle
                cx={SIZE / 2}
                cy={SIZE / 2}
                r={RADIUS}
                stroke={BAND_COLOR[band]}
                strokeWidth={STROKE}
                strokeLinecap="round"
                fill="none"
                strokeDasharray={CIRCUMFERENCE}
                style={{
                  strokeDashoffset: reduceMotion
                    ? CIRCUMFERENCE * (1 - clamped / 100)
                    : dashOffset,
                  transform: `rotate(-90deg)`,
                  transformOrigin: '50% 50%',
                }}
              />
              <text
                x="50%"
                y="50%"
                dominantBaseline="middle"
                textAnchor="middle"
                className="font-mono"
                style={{ fontSize: 22, fill: 'var(--color-hud-fg)' }}
              >
                {formatPct(clamped)}
              </text>
            </svg>
          </div>
        )}
        <p className="hud-fg-muted mt-3 text-center text-xs">
          {band === 'critical'
            ? 'Critical · compact soon'
            : band === 'warn'
              ? 'Approaching limit'
              : 'Within budget'}
        </p>
      </div>
    </LongPressable>
  );
}
