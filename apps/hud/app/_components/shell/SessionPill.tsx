'use client';

import { useHud } from '../live/HudProvider';

export function SessionPill() {
  const session = useHud((s) => s.session);
  // Resolve model via the fallback chain. The hook's `session.start` is the
  // happy-path source; if the HUD started mid-session the transcript poller
  // backfills it through sessionMetrics. `defaultModel` (also from
  // session.start) is the last resort. Only when none of those have arrived
  // do we render "Loading…" — never the confusing "unknown model".
  const sessionModel = useHud((s) => s.session?.model ?? null);
  const sessionMetricsModel = useHud((s) =>
    s.session ? s.sessionMetrics[s.session.id]?.model ?? null : null,
  );
  const defaultModel = useHud((s) => s.defaultModel);
  const currentAgent = useHud((s) => s.currentAgent);

  if (!session) {
    return (
      <span className="hud-fg-muted inline-flex items-center rounded-full border border-[var(--color-hud-card-border)] bg-[var(--color-hud-card-bg)] px-3 py-1.5 font-mono text-xs">
        No active session
      </span>
    );
  }

  const idShort = session.id.slice(0, 8);
  const model = sessionModel ?? sessionMetricsModel ?? defaultModel ?? 'Loading…';
  const isLive = session.endedAt === null;

  return (
    <span className="hud-fg-soft inline-flex items-center gap-2 rounded-full border border-[var(--color-hud-card-border)] bg-[var(--color-hud-card-bg)] px-3 py-1.5 font-mono text-xs">
      <span aria-hidden className="hud-accent">
        {isLive ? '●' : '○'}
      </span>
      <span className="hud-fg">{idShort}</span>
      <span className="hud-fg-muted">·</span>
      <span className="hud-fg-soft">{model}</span>
      {currentAgent && (
        <>
          <span className="hud-fg-muted">·</span>
          <span className="hud-fg-soft">agent: {currentAgent}</span>
        </>
      )}
    </span>
  );
}
