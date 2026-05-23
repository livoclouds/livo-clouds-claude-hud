'use client';

import {
  useCallback,
  useEffect,
  useRef,
  type ReactNode,
} from 'react';

export type LongPressableProps = {
  onLongPress: () => void;
  /** Press duration in ms before firing. Defaults to 500. */
  delay?: number;
  /** Movement (px) that cancels the press. Defaults to 8. */
  cancelThreshold?: number;
  className?: string;
  children: ReactNode;
};

// Wraps children with pointer-down/up handlers that detect a long-press without
// stealing taps or scrolls. Honors prefers-reduced-motion for visual cues only;
// long-press is a discoverable input gesture and remains active regardless.
export function LongPressable({
  onLongPress,
  delay = 500,
  cancelThreshold = 8,
  className = '',
  children,
}: LongPressableProps) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const fired = useRef(false);

  const clear = useCallback(() => {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    start.current = null;
  }, []);

  useEffect(() => clear, [clear]);

  const onPointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      // Ignore non-primary buttons on mouse.
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      start.current = { x: event.clientX, y: event.clientY };
      fired.current = false;
      timer.current = setTimeout(() => {
        fired.current = true;
        onLongPress();
      }, delay);
    },
    [delay, onLongPress],
  );

  const onPointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!start.current || timer.current === null) return;
      const dx = event.clientX - start.current.x;
      const dy = event.clientY - start.current.y;
      if (Math.hypot(dx, dy) > cancelThreshold) clear();
    },
    [cancelThreshold, clear],
  );

  const onPointerEnd = useCallback(() => {
    clear();
  }, [clear]);

  const onContextMenu = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      // Prevent the iOS/macOS touch-callout that fights long-press on touch.
      if (fired.current) event.preventDefault();
    },
    [],
  );

  return (
    <div
      className={className}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
      onPointerLeave={onPointerEnd}
      onContextMenu={onContextMenu}
      style={{ touchAction: 'manipulation' }}
    >
      {children}
    </div>
  );
}
