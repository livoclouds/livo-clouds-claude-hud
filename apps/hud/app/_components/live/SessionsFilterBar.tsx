'use client';

import { useId } from 'react';
import {
  isAnyFilterActive,
  type Bucket,
  type SessionsFilters,
  type SortKey,
} from '@/lib/sessions-filters';

type Counts = { awaiting: number; working: number; completed: number };

type Props = {
  filters: SessionsFilters;
  counts: Counts;
  filteredTotal: number;
  rawTotal: number;
  kindsAvailable: ReadonlyArray<string>;
  onSearchChange: (text: string) => void;
  onToggleStatus: (bucket: Bucket) => void;
  onToggleKind: (kind: string) => void;
  onTogglePinnedOnly: () => void;
  onSortChange: (sort: SortKey) => void;
  onClear: () => void;
};

const STATUS_CHIPS: ReadonlyArray<{ bucket: Bucket; label: string; dot: string }> = [
  { bucket: 'awaiting', label: 'Awaiting', dot: 'var(--color-hud-accent)' },
  { bucket: 'working', label: 'Working', dot: 'var(--color-hud-warn)' },
  { bucket: 'completed', label: 'Completed', dot: 'var(--color-hud-success)' },
];

function chipClass(active: boolean): string {
  const base =
    'inline-flex h-11 items-center gap-1.5 rounded-full px-3 text-[11px] uppercase tracking-wider transition-colors active:scale-[0.97] active:opacity-80 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-hud-accent)]';
  return active
    ? `${base} bg-[var(--color-hud-accent)]/15 text-[color:var(--color-hud-fg)]`
    : `${base} text-[color:var(--color-hud-fg-muted)] hover:text-[color:var(--color-hud-fg)]`;
}

export function SessionsFilterBar({
  filters,
  counts,
  filteredTotal,
  rawTotal,
  kindsAvailable,
  onSearchChange,
  onToggleStatus,
  onToggleKind,
  onTogglePinnedOnly,
  onSortChange,
  onClear,
}: Props) {
  const searchId = useId();
  const sortId = useId();
  const kindId = useId();
  const showClear = isAnyFilterActive(filters);

  return (
    <div className="mt-3 flex flex-col gap-2" role="search" aria-label="Filter sessions">
      {/* Row 1 — search + sort */}
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor={searchId} className="sr-only">
          Search sessions
        </label>
        <input
          id={searchId}
          type="search"
          value={filters.searchText}
          onChange={(e) => onSearchChange(e.currentTarget.value)}
          placeholder="Search by name, path, or detail…"
          className="hud-fg h-11 flex-1 min-w-[180px] rounded-full border border-[var(--color-hud-card-border)] bg-[var(--color-hud-card-bg)] px-4 text-sm placeholder:text-[color:var(--color-hud-fg-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--color-hud-accent)]"
        />
        <label htmlFor={sortId} className="sr-only">
          Sort sessions
        </label>
        <select
          id={sortId}
          value={filters.sortBy}
          onChange={(e) => onSortChange(e.currentTarget.value as SortKey)}
          className="hud-fg h-11 rounded-full border border-[var(--color-hud-card-border)] bg-[var(--color-hud-card-bg)] px-3 text-xs uppercase tracking-wider focus:outline-none focus:ring-2 focus:ring-[var(--color-hud-accent)]"
          title="Sort order"
        >
          <option value="recent">Most recent</option>
          <option value="name">A–Z</option>
        </select>
      </div>

      {/* Row 2 — status chips · kind dropdown · pinned toggle · clear */}
      <div className="-mx-1 flex flex-wrap items-center gap-2 overflow-x-auto px-1">
        {STATUS_CHIPS.map((c) => {
          const active = filters.statuses.has(c.bucket);
          return (
            <button
              key={c.bucket}
              type="button"
              onClick={() => onToggleStatus(c.bucket)}
              aria-pressed={active}
              className={chipClass(active)}
            >
              <span
                aria-hidden
                style={{
                  display: 'inline-block',
                  width: 6,
                  height: 6,
                  borderRadius: 3,
                  background: c.dot,
                }}
              />
              {c.label}
              <span className="hud-fg-muted">·{counts[c.bucket]}</span>
            </button>
          );
        })}

        {kindsAvailable.length > 0 && (
          <>
            <label htmlFor={kindId} className="sr-only">
              Filter by kind
            </label>
            <select
              id={kindId}
              multiple={false}
              value={
                filters.kinds.size === 1 ? [...filters.kinds][0] : '__all__'
              }
              onChange={(e) => {
                const v = e.currentTarget.value;
                // Toggle behavior: selecting __all__ clears; selecting a
                // kind replaces the set with that single kind. Multi-select
                // would need a popover, deferred.
                if (v === '__all__') {
                  for (const k of filters.kinds) onToggleKind(k);
                } else {
                  for (const k of filters.kinds) if (k !== v) onToggleKind(k);
                  if (!filters.kinds.has(v)) onToggleKind(v);
                }
              }}
              className="hud-fg h-11 rounded-full border border-[var(--color-hud-card-border)] bg-[var(--color-hud-card-bg)] px-3 text-[11px] uppercase tracking-wider focus:outline-none focus:ring-2 focus:ring-[var(--color-hud-accent)]"
              title="Filter by kind"
            >
              <option value="__all__">All kinds</option>
              {kindsAvailable.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          </>
        )}

        <button
          type="button"
          onClick={onTogglePinnedOnly}
          aria-pressed={filters.pinnedOnly}
          className={chipClass(filters.pinnedOnly)}
          title="Show only pinned sessions"
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill={filters.pinnedOnly ? 'currentColor' : 'none'}
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="M12 17v5" />
            <path d="M5 17h14l-2-5V5H7v7l-2 5Z" />
          </svg>
          Pinned only
        </button>

        {showClear && (
          <button
            type="button"
            onClick={onClear}
            className="hud-fg-muted ml-auto inline-flex h-11 items-center gap-1 rounded-full px-3 text-[11px] uppercase tracking-wider transition-colors active:scale-[0.97] active:opacity-80 hover:text-[color:var(--color-hud-fg)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-hud-accent)]"
            title="Clear all filters"
          >
            ✕ Clear
          </button>
        )}
      </div>

      {/* Aria-live region — announces filter result counts to screen readers
          without rendering visible text (the header already shows counts). */}
      <span aria-live="polite" className="sr-only">
        Showing {filteredTotal} of {rawTotal} sessions
      </span>
    </div>
  );
}
