'use client';

import { useEffect, useState } from 'react';

// Returns true when the viewport is wider than it is tall (landscape mode).
// SSR-safe: defaults to false (portrait) during the server render.
export function useIsLandscape(): boolean {
  const [isLandscape, setIsLandscape] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(orientation: landscape)');
    setIsLandscape(mq.matches);

    const handler = (e: MediaQueryListEvent) => setIsLandscape(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  return isLandscape;
}
