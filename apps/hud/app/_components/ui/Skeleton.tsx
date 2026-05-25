'use client';

import { useReducedMotion } from 'motion/react';

interface SkeletonProps {
  className?: string;
}

export function Skeleton({ className = '' }: SkeletonProps) {
  const reduced = useReducedMotion();
  return (
    <div
      className={`rounded bg-[var(--color-hud-card-border)] ${reduced ? '' : 'skeleton-shimmer'} ${className}`}
    />
  );
}
