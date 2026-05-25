'use client';

import { useReducedMotion } from 'motion/react';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useHudReconnect } from '../live/HudProvider';

const PULL_THRESHOLD = 80;   // px of overscroll needed to trigger a refresh
const RUBBER_CAP = 80;       // max visual rubber-band displacement in px
const SPINNER_DURATION = 1500; // ms the spinner stays visible after trigger

interface PullToRefreshProps {
  children: ReactNode;
}

// Wraps scroll content and adds a pull-down-to-reconnect gesture.
// Only activates on touch input at the top of the scroll area.
// Respects prefers-reduced-motion: no rubber-band, immediate trigger at threshold.
export function PullToRefresh({ children }: PullToRefreshProps) {
  const reduced = useReducedMotion();
  const reconnect = useHudReconnect();

  const [pullY, setPullY] = useState(0);
  const [spinning, setSpinning] = useState(false);

  const startYRef = useRef<number | null>(null);
  const activeRef = useRef(false);
  const spinTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const triggerRefresh = useCallback(() => {
    if (spinning) return;
    setSpinning(true);
    setPullY(0);
    reconnect();
    if (spinTimerRef.current !== null) clearTimeout(spinTimerRef.current);
    spinTimerRef.current = setTimeout(() => {
      setSpinning(false);
      spinTimerRef.current = null;
    }, SPINNER_DURATION);
  }, [spinning, reconnect]);

  useEffect(() => {
    const el = document.documentElement;

    const onPointerDown = (e: PointerEvent) => {
      if (e.pointerType !== 'touch') return;
      if (window.scrollY > 0) return;
      startYRef.current = e.clientY;
      activeRef.current = true;
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!activeRef.current || startYRef.current === null) return;
      const delta = e.clientY - startYRef.current;
      if (delta <= 0) {
        setPullY(0);
        return;
      }
      if (reduced) {
        // No rubber-band; fire immediately when threshold is hit.
        if (delta >= PULL_THRESHOLD) {
          activeRef.current = false;
          startYRef.current = null;
          triggerRefresh();
        }
        return;
      }
      setPullY(Math.min(delta, RUBBER_CAP));
    };

    const onPointerUp = () => {
      if (!activeRef.current) return;
      const pulled = pullY;
      activeRef.current = false;
      startYRef.current = null;
      if (pulled >= PULL_THRESHOLD) {
        triggerRefresh();
      } else {
        setPullY(0);
      }
    };

    const onPointerCancel = () => {
      activeRef.current = false;
      startYRef.current = null;
      setPullY(0);
    };

    el.addEventListener('pointerdown', onPointerDown);
    el.addEventListener('pointermove', onPointerMove);
    el.addEventListener('pointerup', onPointerUp);
    el.addEventListener('pointercancel', onPointerCancel);

    return () => {
      el.removeEventListener('pointerdown', onPointerDown);
      el.removeEventListener('pointermove', onPointerMove);
      el.removeEventListener('pointerup', onPointerUp);
      el.removeEventListener('pointercancel', onPointerCancel);
      if (spinTimerRef.current !== null) clearTimeout(spinTimerRef.current);
    };
  }, [pullY, reduced, triggerRefresh]);

  return (
    <div
      style={pullY > 0 ? { transform: `translateY(${pullY}px)`, willChange: 'transform' } : undefined}
    >
      {spinning && (
        <div
          aria-label="Refreshing"
          className="pointer-events-none absolute left-1/2 top-0 z-50 -translate-x-1/2 -translate-y-full pt-2"
        >
          <svg
            className="h-6 w-6 animate-spin text-[var(--color-hud-accent)]"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden
          >
            <circle
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
              strokeDasharray="40 60"
            />
          </svg>
        </div>
      )}
      {children}
    </div>
  );
}
