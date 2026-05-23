'use client';

import { useState } from 'react';
import { Mascot } from './Mascot';
import { MASCOT_STATES, type MascotState } from '@/lib/mascot/state';

// Hidden QA surface: exhaustively renders every canonical mascot state without
// requiring a real Claude Code session. No network calls, no mutations.
export function MascotDiagnostics() {
  const [override, setOverride] = useState<MascotState | null>('idle');

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-8 px-4 py-8 md:px-8 md:py-12">
      <header>
        <p className="hud-fg-muted text-xs uppercase tracking-wider">Mascot</p>
        <h1 className="hud-fg mt-1 font-mono text-lg">Live + diagnostics</h1>
        <p className="hud-fg-soft mt-2 max-w-prose text-sm">
          Pin the mascot to any canonical state, or fall back to the live
          event-derived state. Use this page to verify each animation in
          isolation.
        </p>
      </header>

      <section className="hud-card flex justify-center p-6">
        <Mascot overrideState={override} />
      </section>

      <section aria-label="Mascot state controls" className="flex flex-col gap-3">
        <p className="hud-fg-muted text-xs uppercase tracking-wider">
          Current: <span className="hud-fg">{override ?? 'live (derived)'}</span>
        </p>
        <div className="flex flex-wrap gap-2">
          {MASCOT_STATES.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setOverride(s)}
              aria-pressed={override === s}
              className={`min-h-[44px] rounded-full px-4 py-2 font-mono text-sm transition ${
                override === s
                  ? 'bg-[var(--color-hud-accent)] text-[color:var(--color-hud-bg)]'
                  : 'border border-[var(--color-hud-card-border)] bg-[var(--color-hud-card-bg)] text-[color:var(--color-hud-fg-soft)] hover:text-[color:var(--color-hud-fg)]'
              }`}
            >
              {s}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setOverride(null)}
            aria-pressed={override === null}
            className={`min-h-[44px] rounded-full px-4 py-2 font-mono text-sm transition ${
              override === null
                ? 'bg-[var(--color-hud-accent)] text-[color:var(--color-hud-bg)]'
                : 'border border-[var(--color-hud-card-border)] bg-[var(--color-hud-card-bg)] text-[color:var(--color-hud-fg-soft)] hover:text-[color:var(--color-hud-fg)]'
            }`}
          >
            live (derived)
          </button>
        </div>
      </section>
    </main>
  );
}
