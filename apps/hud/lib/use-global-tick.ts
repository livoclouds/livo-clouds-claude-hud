import { useEffect, useState } from 'react';

// Module-level singleton: one interval per cadence shared by all subscribers.
// Callbacks are skipped when the document is hidden, saving CPU and battery.
const subs: { fast: Set<() => void>; slow: Set<() => void> } = {
  fast: new Set(),
  slow: new Set(),
};
const timers: { fast: ReturnType<typeof setInterval> | null; slow: ReturnType<typeof setInterval> | null } = {
  fast: null,
  slow: null,
};

function ensureTimer(cadence: 'fast' | 'slow') {
  if (timers[cadence]) return;
  const ms = cadence === 'fast' ? 1_000 : 10_000;
  timers[cadence] = setInterval(() => {
    if (document.visibilityState !== 'visible') return;
    for (const cb of subs[cadence]) cb();
  }, ms);
}

export function useGlobalTick(cadence: 'fast' | 'slow'): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const tick = () => setNow(Date.now());
    subs[cadence].add(tick);
    ensureTimer(cadence);
    return () => {
      subs[cadence].delete(tick);
    };
  }, [cadence]);
  return now;
}
