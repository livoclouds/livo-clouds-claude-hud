'use client';

import { MetricSheetProvider } from '../MetricSheet';
import { SessionCard } from './SessionCard';
import { TokenStat } from './TokenStat';
import { CostStat } from './CostStat';
import { ContextRing } from './ContextRing';
import { AgentsDashboard } from './AgentsDashboard';
import { SessionsDashboard } from './SessionsDashboard';
import { AgentDetailSheetProvider } from './AgentDetailSheet';
import { SessionDetailSheetProvider } from './SessionDetailSheet';
import { ErrorPill } from './ErrorPill';
import { StickyMascot } from './StickyMascot';

export function LiveView() {
  return (
    <MetricSheetProvider>
      <AgentDetailSheetProvider>
        <SessionDetailSheetProvider>
          <main className="mx-auto flex min-h-screen max-w-6xl flex-col gap-6 px-4 py-6 md:px-8 md:py-10 kiosk:max-w-[1600px]">
          <ErrorPill />

          {/* Mascot sticks below the StatusBar (h-14 = 56 px → top-14) and
              shrinks on scroll so it stays visible while the user is reading
              the panels below. data-no-swipe prevents the sticky area from
              swallowing horizontal swipes between tabs. */}
          <section
            className="sticky top-14 z-20 flex justify-center py-2"
            data-no-swipe="true"
          >
            <StickyMascot />
          </section>

          <section className="grid grid-cols-1 gap-6 md:grid-cols-3 lg:grid-cols-4">
            <div className="md:col-span-2 lg:col-span-3">
              <SessionCard />
            </div>
            <ContextRing />
          </section>

          <section className="grid grid-cols-1 gap-6 md:grid-cols-3 lg:grid-cols-4">
            <div className="md:col-span-2 lg:col-span-3">
              <TokenStat />
            </div>
            <CostStat />
          </section>

          {/* Top-level Sessions panel mirrors Claude Code's terminal `/agents`
              view (every running session on the source Mac, fed by the
              sidecar poller). The Subagents panel below covers Task-tool
              invocations within whichever session this HUD is observing
              via the hook stream — a different concept under the same word
              "agent". Both stay visible. */}
          <section>
            <SessionsDashboard />
          </section>

          <section>
            <AgentsDashboard />
          </section>
          </main>
        </SessionDetailSheetProvider>
      </AgentDetailSheetProvider>
    </MetricSheetProvider>
  );
}
