import { getDailyTotals } from '@/lib/aggregations';
import { formatCost, formatTokens } from '@/lib/format';
import { CostChartClient } from '../_components/charts/CostChartClient';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const revalidate = 0;

export default async function CostPage() {
  const data = await getDailyTotals(14);
  const totalCost = data.reduce((acc, d) => acc + d.costUsd, 0);
  const totalTokensOut = data.reduce((acc, d) => acc + d.tokensOut, 0);
  const totalTokensIn = data.reduce((acc, d) => acc + d.tokensIn, 0);
  const totalSessions = data.reduce((acc, d) => acc + d.sessions, 0);

  const hasAny = totalCost > 0 || totalTokensOut > 0 || totalSessions > 0;

  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col gap-6 px-4 py-6 md:px-8 md:py-10 kiosk:max-w-[1600px]">
      <header className="flex items-baseline justify-between">
        <h1 className="font-mono text-lg hud-fg">
          <span aria-hidden className="mr-2 hud-accent">
            $
          </span>
          Cost &amp; tokens
        </h1>
        <p className="hud-fg-muted text-xs">Last 14 days</p>
      </header>

      <section className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Summary label="Total cost" value={formatCost(totalCost)} />
        <Summary label="Tokens out" value={formatTokens(totalTokensOut)} />
        <Summary label="Tokens in" value={formatTokens(totalTokensIn)} />
        <Summary label="Sessions" value={String(totalSessions)} />
      </section>

      {hasAny ? (
        <CostChartClient data={data} />
      ) : (
        <div className="hud-card grid place-items-center p-10">
          <p className="hud-fg-muted text-sm">
            No activity in the last 14 days yet.
          </p>
        </div>
      )}
    </main>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div className="hud-card p-4">
      <p className="hud-fg-muted text-[10px] uppercase tracking-wider">{label}</p>
      <p className="mt-2 font-mono text-2xl tabular-nums hud-fg">{value}</p>
    </div>
  );
}
