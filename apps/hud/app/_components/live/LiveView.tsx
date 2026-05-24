'use client';

import { Mascot } from '../mascot/Mascot';
import { MetricSheetProvider } from '../MetricSheet';
import { SessionCard } from './SessionCard';
import { TokenStat } from './TokenStat';
import { CostStat } from './CostStat';
import { ContextRing } from './ContextRing';
import { AgentsDashboard } from './AgentsDashboard';
import { SessionsDashboard } from './SessionsDashboard';
import { AgentDetailSheetProvider } from './AgentDetailSheet';
import { ErrorPill } from './ErrorPill';

export function LiveView() {
  return (
    <MetricSheetProvider>
      <AgentDetailSheetProvider>
        <main className="mx-auto flex min-h-screen max-w-6xl flex-col gap-6 px-4 py-6 md:px-8 md:py-10">
          <ErrorPill />

          <section className="flex justify-center py-2">
            <Mascot />
          </section>

          <section className="grid grid-cols-1 gap-6 md:grid-cols-3">
            <div className="md:col-span-2">
              <SessionCard />
            </div>
            <ContextRing />
          </section>

          <section className="grid grid-cols-1 gap-6 md:grid-cols-3">
            <div className="md:col-span-2">
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
      </AgentDetailSheetProvider>
    </MetricSheetProvider>
  );
}
