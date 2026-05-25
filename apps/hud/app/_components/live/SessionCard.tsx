'use client';

import { useHud, useHudHydrated } from './HudProvider';
import { basename, relativeTime, truncate } from '@/lib/format';
import { useGlobalTick } from '@/lib/use-global-tick';
import { selectSession } from '@/lib/store-selectors';

export function SessionCard() {
  const session = useHud(selectSession);
  // Look up a human-readable name from the sessions poller snapshot. When the
  // poller is feeding data (default with `pnpm dev`), the name is the title
  // the user gave the session in Claude Code (e.g. "Edit bank profile -
  // popup") instead of a truncated UUID.
  const sessionName = useHud((s) =>
    s.session ? (s.codeSessions[s.session.id]?.name ?? null) : null,
  );
  // Authoritative model fallback chain: hook session.start → transcript
  // poller's JSONL `message.model` → defaultModel. Surfaces "Loading…"
  // (not "—") while none have arrived so the user knows the HUD is alive,
  // not broken.
  const metricsModel = useHud((s) =>
    s.session ? s.sessionMetrics[s.session.id]?.model ?? null : null,
  );
  const defaultModel = useHud((s) => s.defaultModel);
  const hydrated = useHudHydrated();
  const now = useGlobalTick('fast');

  if (!session) {
    return (
      <div className="hud-card p-6">
        <div className="flex flex-col items-center justify-center py-10 text-center">
          <span aria-hidden className="hud-accent text-5xl">
            ✦
          </span>
          <p className="hud-fg-soft mt-3 text-sm">Waiting for a Claude Code session…</p>
          <p className="hud-fg-muted mt-1 text-xs">
            Install the HUD hook with <code className="font-mono">pnpm hud:install-hook</code>
          </p>
        </div>
      </div>
    );
  }

  const idLabel = truncate(session.id, 24);
  const cwdLabel = session.cwd ? basename(session.cwd) : null;
  const resolvedModel = session.model ?? metricsModel ?? defaultModel ?? null;
  const ended = session.endedAt !== null;

  return (
    <div className="hud-card p-6">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="hud-fg-muted text-xs uppercase tracking-wider">Active session</p>
          <p
            className="hud-fg-soft mt-1 truncate font-mono text-sm"
            title={sessionName ? `${sessionName} · ${session.id}` : session.id}
          >
            {sessionName ?? idLabel}
          </p>
          {sessionName && (
            <p className="hud-fg-muted mt-0.5 truncate font-mono text-[10px]" title={session.id}>
              {idLabel}
            </p>
          )}
        </div>
        <span
          className="rounded-full px-2 py-1 text-[10px] uppercase tracking-wider"
          style={
            ended
              ? {
                  background: 'var(--color-hud-card-bg)',
                  color: 'var(--color-hud-fg-muted)',
                }
              : {
                  background:
                    'color-mix(in srgb, var(--color-hud-success) 18%, transparent)',
                  color: 'var(--color-hud-success)',
                }
          }
        >
          {ended ? 'Ended' : 'Live'}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
        <div>
          <p className="hud-fg-muted">Model</p>
          <p className="hud-fg-soft mt-1 font-mono" title={resolvedModel ?? undefined}>
            {resolvedModel ? truncate(resolvedModel, 22) : 'Loading…'}
          </p>
        </div>
        <div>
          <p className="hud-fg-muted">Working dir</p>
          <p className="hud-fg-soft mt-1 font-mono" title={session.cwd ?? undefined}>
            {cwdLabel ?? '—'}
          </p>
        </div>
        <div>
          <p className="hud-fg-muted">Started</p>
          <p className="hud-fg-soft mt-1 font-mono">
            {hydrated ? relativeTime(session.startedAt, now) : '…'}
          </p>
        </div>
        <div>
          <p className="hud-fg-muted">Status</p>
          <p className="hud-fg-soft mt-1 font-mono">{ended ? 'Frozen' : 'Streaming'}</p>
        </div>
      </div>
    </div>
  );
}
