'use client';

import { SessionPill } from './SessionPill';
import { SseStatusBadge } from './SseStatusBadge';

// Top status bar — mirrors the visual language of the `TopBar` in
// `livo-clouds-web-app` (h-14, border-b, flex left/right) but with HUD-specific
// content: brand mark on the left, session pill + SSE health on the right.
// Tab navigation and theme toggle live in the floating `NavBar` (bottom),
// so this header stays focused on observer-state at a glance.
export function StatusBar() {
  return (
    <header
      data-no-swipe="true"
      className="sticky top-0 z-30 border-b border-[var(--color-hud-card-border)] bg-[color-mix(in_srgb,var(--color-hud-bg)_72%,transparent)] backdrop-blur-md"
    >
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4 md:px-6 kiosk:max-w-[1600px]">
        <span className="hud-fg inline-flex items-baseline gap-2 font-mono text-sm">
          <span aria-hidden className="hud-accent text-base leading-none">
            ✦
          </span>
          <span className="hidden sm:inline">Claude Code HUD</span>
        </span>

        <div className="ml-auto flex items-center gap-2">
          <SessionPill />
          <SseStatusBadge />
        </div>
      </div>
    </header>
  );
}
