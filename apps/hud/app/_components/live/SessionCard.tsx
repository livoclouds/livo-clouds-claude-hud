'use client';

import { useEffect, useState } from 'react';
import { useHud, useHudHydrated } from './HudProvider';
import { basename, relativeTime, truncate } from '@/lib/format';

export function SessionCard() {
  const session = useHud((s) => s.session);
  const hydrated = useHudHydrated();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!session || session.endedAt !== null) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [session]);

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
  const ended = session.endedAt !== null;

  return (
    <div className="hud-card p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="hud-fg-muted text-xs uppercase tracking-wider">Active session</p>
          <p className="hud-fg-soft mt-1 font-mono text-sm" title={session.id}>
            {idLabel}
          </p>
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
          <p className="hud-fg-soft mt-1 font-mono" title={session.model ?? undefined}>
            {session.model ? truncate(session.model, 22) : '—'}
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
