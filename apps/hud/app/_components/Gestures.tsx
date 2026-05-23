'use client';

import { useMemo, useRef, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { animate, useMotionValue, useReducedMotion, useTransform, motion } from 'motion/react';
import { useDrag } from '@use-gesture/react';

// Ordered ring of primary views; swiping left advances, swiping right retreats.
// Order matches the on-screen NavBar (Cost · Live · Sessions · Mascot).
const ROUTES = ['/cost', '/', '/sessions', '/mascot'] as const;

function routeIndex(pathname: string): number {
  if (pathname === '/') return ROUTES.indexOf('/');
  // Match by prefix for nested routes (none expected in v1, but cheap).
  const i = ROUTES.findIndex((r) => r !== '/' && pathname.startsWith(r));
  return i === -1 ? -1 : i;
}

function isInsideNoSwipe(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return target.closest('[data-no-swipe="true"]') !== null;
}

const COMMIT_VELOCITY = 0.35;
const COMMIT_RATIO = 0.22;

export function Gestures({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname() ?? '/';
  const reduced = useReducedMotion();

  const index = useMemo(() => routeIndex(pathname), [pathname]);

  const x = useMotionValue(0);
  const opacity = useTransform(x, [-300, 0, 300], [0.78, 1, 0.78]);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const bind = useDrag(
    ({ event, last, movement: [mx], velocity: [vx], direction: [dx], cancel, tap }) => {
      if (tap) return;
      if (event && isInsideNoSwipe(event.target)) {
        cancel?.();
        return;
      }
      if (index === -1) {
        // Unknown route — let the page handle its own touch interactions.
        cancel?.();
        return;
      }

      if (!last) {
        if (!reduced) x.set(mx);
        return;
      }

      const width = containerRef.current?.clientWidth ?? window.innerWidth;
      const shouldCommit =
        Math.abs(mx) > width * COMMIT_RATIO || vx > COMMIT_VELOCITY;
      if (shouldCommit) {
        // dx is -1 (swipe left) → advance, +1 (swipe right) → retreat.
        const targetIdx = index + (dx < 0 ? 1 : -1);
        const target = ROUTES[targetIdx];
        if (target) {
          if (!reduced) {
            void animate(x, dx < 0 ? -width : width, {
              duration: 0.18,
              ease: 'easeOut',
              onComplete: () => x.set(0),
            });
          }
          router.push(target);
          return;
        }
      }
      if (!reduced) void animate(x, 0, { type: 'spring', stiffness: 260, damping: 28 });
    },
    {
      axis: 'x',
      filterTaps: true,
      pointer: { touch: true },
      preventScroll: false,
      threshold: 12,
    },
  );

  return (
    <div
      ref={containerRef}
      {...bind()}
      className="relative min-h-[100dvh] touch-pan-y overflow-x-hidden"
    >
      <motion.div
        style={reduced ? undefined : { x, opacity }}
        className="will-change-transform"
      >
        {children}
      </motion.div>
    </div>
  );
}
