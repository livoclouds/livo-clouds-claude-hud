import type { SessionAggregate } from '@/lib/aggregations';
import { basename, formatCost, formatTokens, relativeTime, truncate } from '@/lib/format';

type Props = {
  sessions: ReadonlyArray<SessionAggregate>;
  now: number;
};

function formatDuration(ms: number | null): string {
  if (!ms || ms <= 0) return '—';
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ${sec % 60}s`;
  const hr = Math.floor(min / 60);
  return `${hr}h ${min % 60}m`;
}

export function SessionsCardList({ sessions, now }: Props) {
  return (
    <div className="hud-card divide-y divide-[var(--color-hud-card-border)] overflow-hidden">
      {sessions.map((s, i) => {
        const duration = s.endedAt && s.startedAt ? s.endedAt - s.startedAt : null;
        return (
          <div
            key={`${s.day}-${s.id}-${i}`}
            className="flex min-h-[56px] flex-col justify-center gap-1 px-4 py-3"
          >
            <div className="flex items-center justify-between gap-2">
              <p className="hud-fg font-mono text-xs" title={s.id}>
                {truncate(s.id, 18)}
              </p>
              <span className="hud-fg-muted font-mono text-[11px]">{s.day}</span>
            </div>
            {s.cwd && (
              <p className="hud-fg-muted font-mono text-[11px]" title={s.cwd}>
                {basename(s.cwd)}
              </p>
            )}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
              {s.model && (
                <span className="hud-fg-muted font-mono" title={s.model}>
                  {truncate(s.model, 22)}
                </span>
              )}
              <span className="hud-fg-muted">{relativeTime(s.startedAt, now)}</span>
              <span className="hud-fg font-mono tabular-nums">{formatTokens(s.tokensOut)} tok</span>
              <span className="hud-fg font-mono tabular-nums">{formatCost(s.costUsd)}</span>
              <span className="hud-fg-soft font-mono tabular-nums">{formatDuration(duration)}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
