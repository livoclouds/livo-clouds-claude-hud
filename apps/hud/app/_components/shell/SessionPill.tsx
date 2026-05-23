'use client';

import { useHud } from '../live/HudProvider';

export function SessionPill() {
  const session = useHud((s) => s.session);

  if (!session) {
    return (
      <span className="hud-fg-muted inline-flex items-center rounded-full border border-[var(--color-hud-card-border)] bg-[var(--color-hud-card-bg)] px-3 py-1.5 font-mono text-xs">
        No active session
      </span>
    );
  }

  const idShort = session.id.slice(0, 8);
  const model = session.model ?? 'unknown model';
  const isLive = session.endedAt === null;

  return (
    <span className="hud-fg-soft inline-flex items-center gap-2 rounded-full border border-[var(--color-hud-card-border)] bg-[var(--color-hud-card-bg)] px-3 py-1.5 font-mono text-xs">
      <span aria-hidden className="hud-accent">
        {isLive ? '●' : '○'}
      </span>
      <span className="hud-fg">{idShort}</span>
      <span className="hud-fg-muted">·</span>
      <span className="hud-fg-soft">{model}</span>
    </span>
  );
}
