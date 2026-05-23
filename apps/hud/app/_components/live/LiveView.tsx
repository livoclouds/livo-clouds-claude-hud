'use client';

import { Mascot } from '../mascot/Mascot';
import { MetricSheetProvider } from '../MetricSheet';
import { SessionCard } from './SessionCard';
import { TokenStat } from './TokenStat';
import { CostStat } from './CostStat';
import { ContextRing } from './ContextRing';
import { LastTool } from './LastTool';
import { ErrorPill } from './ErrorPill';

export function LiveView() {
  return (
    <MetricSheetProvider>
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

        <section>
          <LastTool />
        </section>
      </main>
    </MetricSheetProvider>
  );
}
