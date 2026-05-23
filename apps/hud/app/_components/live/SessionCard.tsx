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
      <div className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-xl">
        <div className="flex flex-col items-center justify-center py-10 text-center">
          <span aria-hidden className="text-5xl text-[var(--color-hud-accent)]">
            ✦
          </span>
          <p className="mt-3 text-sm text-white/60">Waiting for a Claude Code session…</p>
          <p className="mt-1 text-xs text-white/30">
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
    <div className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-xl">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wider text-white/40">Active session</p>
          <p className="mt-1 font-mono text-sm text-white/80" title={session.id}>
            {idLabel}
          </p>
        </div>
        <span
          className={
            ended
              ? 'rounded-full bg-white/10 px-2 py-1 text-[10px] uppercase tracking-wider text-white/50'
              : 'rounded-full bg-emerald-400/15 px-2 py-1 text-[10px] uppercase tracking-wider text-emerald-300'
          }
        >
          {ended ? 'Ended' : 'Live'}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
        <div>
          <p className="text-white/40">Model</p>
          <p
            className="mt-1 font-mono text-white/80"
            title={session.model ?? undefined}
          >
            {session.model ? truncate(session.model, 22) : '—'}
          </p>
        </div>
        <div>
          <p className="text-white/40">Working dir</p>
          <p className="mt-1 font-mono text-white/80" title={session.cwd ?? undefined}>
            {cwdLabel ?? '—'}
          </p>
        </div>
        <div>
          <p className="text-white/40">Started</p>
          <p className="mt-1 font-mono text-white/80">
            {hydrated ? relativeTime(session.startedAt, now) : '…'}
          </p>
        </div>
        <div>
          <p className="text-white/40">Status</p>
          <p className="mt-1 font-mono text-white/80">{ended ? 'Frozen' : 'Streaming'}</p>
        </div>
      </div>
    </div>
  );
}
