'use client';

import { useState } from 'react';
import { useMotionValueEvent, useReducedMotion, useScroll } from 'motion/react';
import { Mascot } from '../mascot/Mascot';

// Mascot sticks just below the StatusBar (h-14 = 56 px) and shrinks as the
// user scrolls so it stops dominating the viewport but stays present. CLAUDE.md
// §7 calls the mascot the emotional core of the HUD — it should not disappear
// when the user is reading the Sessions or Subagents panels below.
const MAX_SIZE = 220;
const MIN_SIZE = 80;
const SHRINK_START_PX = 80;   // scroll distance before shrink begins
const SHRINK_END_PX = 240;    // scroll distance at which size locks at MIN_SIZE
const REDUCED_MOTION_SIZE = 120; // a sensible mid-point when animations are disabled

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

export function StickyMascot() {
  const reduced = useReducedMotion();
  const { scrollY } = useScroll();
  // useState ensures Mascot re-renders only when the rounded size actually
  // changes — at most ~120 updates over a 240 px scroll window, which is
  // cheap and stays out of the animation thread.
  const [size, setSize] = useState<number>(reduced ? REDUCED_MOTION_SIZE : MAX_SIZE);

  useMotionValueEvent(scrollY, 'change', (latest: number) => {
    if (reduced) return;
    const t = clamp(
      (latest - SHRINK_START_PX) / (SHRINK_END_PX - SHRINK_START_PX),
      0,
      1,
    );
    const next = Math.round(MAX_SIZE + (MIN_SIZE - MAX_SIZE) * t);
    setSize((prev) => (prev === next ? prev : next));
  });

  return <Mascot size={size} />;
}
