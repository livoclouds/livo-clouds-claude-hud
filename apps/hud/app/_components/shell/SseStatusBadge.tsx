'use client';

import { useSseStatus } from '../live/HudProvider';

const COPY: Record<ReturnType<typeof useSseStatus>, { label: string; tone: string }> = {
  connecting: { label: 'Connecting', tone: 'var(--color-hud-fg-muted)' },
  open: { label: 'Live', tone: 'var(--color-hud-success)' },
  reconnecting: { label: 'Reconnecting', tone: 'var(--color-hud-warn)' },
};

export function SseStatusBadge() {
  const status = useSseStatus();
  const { label, tone } = COPY[status];

  return (
    <span
      role="status"
      aria-live="polite"
      className="hud-fg-soft inline-flex items-center gap-2 rounded-full border border-[var(--color-hud-card-border)] bg-[var(--color-hud-card-bg)] px-3 py-1.5 text-xs font-medium"
    >
      <span
        aria-hidden
        className={status === 'open' ? 'animate-pulse' : ''}
        style={{
          display: 'inline-block',
          width: 8,
          height: 8,
          borderRadius: '999px',
          background: tone,
          boxShadow: `0 0 8px ${tone}`,
        }}
      />
      {label}
    </span>
  );
}
