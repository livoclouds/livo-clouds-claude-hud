export const CONTEXT_THRESHOLDS = {
  warn: 70,
  critical: 90,
} as const;

export type ContextBand = 'neutral' | 'warn' | 'critical';

export function contextBand(pct: number): ContextBand {
  if (pct >= CONTEXT_THRESHOLDS.critical) return 'critical';
  if (pct >= CONTEXT_THRESHOLDS.warn) return 'warn';
  return 'neutral';
}
