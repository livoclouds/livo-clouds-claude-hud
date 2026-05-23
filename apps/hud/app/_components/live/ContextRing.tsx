'use client';

import { motion, useReducedMotion, useSpring, useTransform } from 'motion/react';
import { useEffect } from 'react';
import { useHud } from './HudProvider';
import { contextBand } from '@/lib/thresholds';
import { formatPct } from '@/lib/format';

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
  const clamped = Math.max(0, Math.min(100, contextPct));
  const band = contextBand(clamped);
  const reduceMotion = useReducedMotion();

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
    <div className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-xl">
      <p className="text-xs uppercase tracking-wider text-white/40">Context</p>
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
            stroke="rgba(255,255,255,0.08)"
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
            className="fill-white/90 font-mono"
            style={{ fontSize: 22 }}
          >
            {formatPct(clamped)}
          </text>
        </svg>
      </div>
      <p className="mt-3 text-center text-xs text-white/40">
        {band === 'critical'
          ? 'Critical · compact soon'
          : band === 'warn'
            ? 'Approaching limit'
            : 'Within budget'}
      </p>
    </div>
  );
}
