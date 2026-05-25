'use client';

import { useState } from 'react';
import { useMotionValueEvent, useReducedMotion, useScroll } from 'motion/react';
import { Mascot } from '../mascot/Mascot';
import { useDocumentVisibility } from '@/lib/use-visibility';
import { useIsLandscape } from '@/lib/use-orientation';

// Mascot sticks just below the StatusBar (h-14 = 56 px) and shrinks as the
// user scrolls so it stops dominating the viewport but stays present. CLAUDE.md
// §7 calls the mascot the emotional core of the HUD — it should not disappear
// when the user is reading the Sessions or Subagents panels below.
const MAX_SIZE = 220;
const MIN_SIZE = 80;
const REDUCED_MOTION_SIZE = 120; // a sensible mid-point when animations are disabled

// In landscape the viewport is shorter, so shrink earlier to keep panels readable.
const SHRINK_START_PORTRAIT = 80;
const SHRINK_END_PORTRAIT = 240;
const SHRINK_START_LANDSCAPE = 40;
const SHRINK_END_LANDSCAPE = 120;

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

export function StickyMascot() {
  const reduced = useReducedMotion();
  const visibility = useDocumentVisibility();
  const isLandscape = useIsLandscape();
  const { scrollY } = useScroll();
  // useState ensures Mascot re-renders only when the rounded size actually
  // changes — at most ~120 updates over the scroll window, which is cheap
  // and stays out of the animation thread.
  const [size, setSize] = useState<number>(reduced ? REDUCED_MOTION_SIZE : MAX_SIZE);

  useMotionValueEvent(scrollY, 'change', (latest: number) => {
    if (reduced || visibility !== 'visible') return;
    const shrinkStart = isLandscape ? SHRINK_START_LANDSCAPE : SHRINK_START_PORTRAIT;
    const shrinkEnd = isLandscape ? SHRINK_END_LANDSCAPE : SHRINK_END_PORTRAIT;
    const t = clamp((latest - shrinkStart) / (shrinkEnd - shrinkStart), 0, 1);
    const next = Math.round(MAX_SIZE + (MIN_SIZE - MAX_SIZE) * t);
    setSize((prev) => (prev === next ? prev : next));
  });

  return <Mascot size={size} />;
}
