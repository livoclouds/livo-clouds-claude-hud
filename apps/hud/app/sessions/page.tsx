import Link from 'next/link';
import {
  getSessionsLast14Days,
  sortSessions,
  type SessionSort,
} from '@/lib/aggregations';
import {
  basename,
  formatCost,
  formatTokens,
  relativeTime,
  truncate,
} from '@/lib/format';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const revalidate = 0;

function parseSort(value: string | string[] | undefined): SessionSort {
  return value === 'recent' ? 'recent' : 'cost';
}

function formatDuration(ms: number | null): string {
  if (!ms || ms <= 0) return '—';
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ${sec % 60}s`;
  const hr = Math.floor(min / 60);
  return `${hr}h ${min % 60}m`;
}

export default async function SessionsPage({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string | string[] }>;
}) {
  const params = await searchParams;
  const sort = parseSort(params.sort);
  const sessions = sortSessions(await getSessionsLast14Days(), sort);
  const now = Date.now();

  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col gap-6 px-4 py-6 md:px-8 md:py-10">
      <header className="flex items-baseline justify-between">
        <h1 className="font-mono text-lg hud-fg">
          <span aria-hidden className="mr-2 hud-accent">
            ≡
          </span>
          Sessions
        </h1>
        <p className="hud-fg-muted text-xs">Last 14 days</p>
      </header>

      <nav
        aria-label="Sort sessions"
        className="hud-card flex w-fit items-center gap-1 p-1"
      >
        <SortLink current={sort} value="cost" label="By cost" />
        <SortLink current={sort} value="recent" label="Most recent" />
      </nav>

      {sessions.length === 0 ? (
        <div className="hud-card flex flex-col items-center justify-center px-6 py-12 text-center">
          <span aria-hidden className="hud-accent text-5xl">
            ✦
          </span>
          <p className="hud-fg-soft mt-3 text-sm">No sessions recorded yet.</p>
          <p className="hud-fg-muted mt-1 text-xs">
            Install the hook with <code className="font-mono">pnpm hud:install-hook</code>{' '}
            and start a Claude Code session.
          </p>
        </div>
      ) : (
        <div className="hud-card overflow-hidden">
          <table className="w-full border-collapse text-sm">
            <thead className="hud-fg-muted text-[10px] uppercase tracking-wider">
              <tr>
                <th className="px-4 py-3 text-left font-normal">Session</th>
                <th className="px-4 py-3 text-left font-normal">Day</th>
                <th className="px-4 py-3 text-left font-normal">Model</th>
                <th className="px-4 py-3 text-right font-normal">Tokens out</th>
                <th className="px-4 py-3 text-right font-normal">Cost</th>
                <th className="px-4 py-3 text-right font-normal">Duration</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((s, i) => {
                const duration =
                  s.endedAt && s.startedAt ? s.endedAt - s.startedAt : null;
                return (
                  <tr
                    key={`${s.day}-${s.id}-${i}`}
                    className="border-t border-[var(--color-hud-card-border)]"
                  >
                    <td className="px-4 py-3 align-top">
                      <p
                        className="font-mono text-xs hud-fg"
                        title={s.id}
                      >
                        {truncate(s.id, 18)}
                      </p>
                      {s.cwd ? (
                        <p
                          className="hud-fg-muted mt-1 font-mono text-[11px]"
                          title={s.cwd}
                        >
                          {basename(s.cwd)}
                        </p>
                      ) : null}
                    </td>
                    <td className="hud-fg-soft px-4 py-3 align-top font-mono text-xs">
                      {s.day}
                      <p className="hud-fg-muted mt-1 text-[11px]">
                        {relativeTime(s.startedAt, now)}
                      </p>
                    </td>
                    <td
                      className="hud-fg-soft px-4 py-3 align-top font-mono text-xs"
                      title={s.model ?? undefined}
                    >
                      {s.model ? truncate(s.model, 22) : '—'}
                    </td>
                    <td className="hud-fg px-4 py-3 text-right align-top font-mono text-xs tabular-nums">
                      {formatTokens(s.tokensOut)}
                    </td>
                    <td className="hud-fg px-4 py-3 text-right align-top font-mono text-xs tabular-nums">
                      {formatCost(s.costUsd)}
                    </td>
                    <td className="hud-fg-soft px-4 py-3 text-right align-top font-mono text-xs tabular-nums">
                      {formatDuration(duration)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}

function SortLink({
  current,
  value,
  label,
}: {
  current: SessionSort;
  value: SessionSort;
  label: string;
}) {
  const active = current === value;
  return (
    <Link
      href={value === 'cost' ? '/sessions' : `/sessions?sort=${value}`}
      aria-current={active ? 'true' : undefined}
      className={`inline-flex h-11 items-center rounded-full px-4 text-sm transition-colors ${
        active
          ? 'bg-[var(--color-hud-accent)]/15 text-[color:var(--color-hud-fg)]'
          : 'text-[color:var(--color-hud-fg-soft)] hover:text-[color:var(--color-hud-fg)]'
      }`}
    >
      {label}
    </Link>
  );
}
