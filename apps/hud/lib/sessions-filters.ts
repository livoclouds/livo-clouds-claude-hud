'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { HudCodeSession } from '@/lib/store';

// Status buckets in the order the terminal `/agents` view renders them.
// Re-exported from here so SessionsDashboard imports the same definition
// the filter logic uses — single source of truth.
export type Bucket = 'awaiting' | 'working' | 'completed';

// Fallback idle threshold for "orphan" sessions that have no daemon
// state.json (those don't carry a semantic state field, so we fall back to
// the JSONL mtime heuristic).
const COMPLETED_THRESHOLD_MS = 5 * 60 * 1000;

export function bucketFor(session: HudCodeSession, now: number): Bucket {
  const s = session.status.toLowerCase();
  if (s === 'blocked') return 'awaiting';
  if (s === 'working') return 'working';
  if (s === 'done') return 'completed';
  if (s === 'busy' || s === 'running' || s === 'shell') return 'working';
  if (s === 'awaiting_input' || s === 'awaiting' || s === 'idle' || s === 'waiting')
    return 'awaiting';
  const lastActivity = session.lastActivityAt ?? session.updatedAt;
  if (lastActivity > 0 && now - lastActivity > COMPLETED_THRESHOLD_MS) return 'completed';
  return 'awaiting';
}

export type CollapsibleSection = 'pinned' | 'awaiting' | 'working' | 'completed';
export type SortKey = 'recent' | 'name';

export type SessionsFilters = {
  searchText: string;
  statuses: ReadonlySet<Bucket>;
  kinds: ReadonlySet<string>;
  pinnedOnly: boolean;
  sortBy: SortKey;
  collapsed: ReadonlySet<CollapsibleSection>;
};

export const EMPTY_FILTERS: SessionsFilters = {
  searchText: '',
  statuses: new Set(),
  kinds: new Set(),
  pinnedOnly: false,
  sortBy: 'recent',
  collapsed: new Set(),
};

const STORAGE_KEY = 'livo-hud-sessions-filters-v1';

type Serialized = {
  searchText?: string;
  statuses?: string[];
  kinds?: string[];
  pinnedOnly?: boolean;
  sortBy?: string;
  collapsed?: string[];
};

function readFilters(): SessionsFilters {
  if (typeof window === 'undefined') return EMPTY_FILTERS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY_FILTERS;
    const parsed = JSON.parse(raw) as Serialized;
    if (!parsed || typeof parsed !== 'object') return EMPTY_FILTERS;
    return {
      searchText: typeof parsed.searchText === 'string' ? parsed.searchText : '',
      statuses: new Set(
        (Array.isArray(parsed.statuses) ? parsed.statuses : []).filter(
          (s): s is Bucket => s === 'awaiting' || s === 'working' || s === 'completed',
        ),
      ),
      kinds: new Set(
        (Array.isArray(parsed.kinds) ? parsed.kinds : []).filter(
          (k): k is string => typeof k === 'string' && k.length > 0,
        ),
      ),
      pinnedOnly: parsed.pinnedOnly === true,
      sortBy: parsed.sortBy === 'name' ? 'name' : 'recent',
      collapsed: new Set(
        (Array.isArray(parsed.collapsed) ? parsed.collapsed : []).filter(
          (c): c is CollapsibleSection =>
            c === 'pinned' || c === 'awaiting' || c === 'working' || c === 'completed',
        ),
      ),
    };
  } catch {
    return EMPTY_FILTERS;
  }
}

function writeFilters(filters: SessionsFilters): void {
  if (typeof window === 'undefined') return;
  try {
    const serialized: Serialized = {
      searchText: filters.searchText,
      statuses: [...filters.statuses],
      kinds: [...filters.kinds],
      pinnedOnly: filters.pinnedOnly,
      sortBy: filters.sortBy,
      collapsed: [...filters.collapsed],
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(serialized));
  } catch {
    // Quota exceeded / privacy mode — preferences simply don't persist.
  }
}

export function isAnyFilterActive(filters: SessionsFilters): boolean {
  return (
    filters.searchText.length > 0 ||
    filters.statuses.size > 0 ||
    filters.kinds.size > 0 ||
    filters.pinnedOnly
  );
}

export function useSessionsFilters(): {
  filters: SessionsFilters;
  hydrated: boolean;
  setSearchText: (text: string) => void;
  toggleStatus: (bucket: Bucket) => void;
  toggleKind: (kind: string) => void;
  setPinnedOnly: (on: boolean) => void;
  setSortBy: (sort: SortKey) => void;
  toggleCollapsed: (section: CollapsibleSection) => void;
  clear: () => void;
} {
  // SSR-safe: server emits EMPTY_FILTERS; client hydrates on first effect.
  const [filters, setFilters] = useState<SessionsFilters>(EMPTY_FILTERS);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setFilters(readFilters());
    setHydrated(true);
  }, []);

  // Cross-tab sync — another tab on the same device editing filters
  // propagates here, matching the pins.ts pattern.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY) return;
      setFilters(readFilters());
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const update = useCallback((next: SessionsFilters) => {
    setFilters(next);
    writeFilters(next);
  }, []);

  const setSearchText = useCallback(
    (text: string) => update({ ...filters, searchText: text }),
    [filters, update],
  );
  const toggleStatus = useCallback(
    (bucket: Bucket) => {
      const next = new Set(filters.statuses);
      if (next.has(bucket)) next.delete(bucket);
      else next.add(bucket);
      update({ ...filters, statuses: next });
    },
    [filters, update],
  );
  const toggleKind = useCallback(
    (kind: string) => {
      const next = new Set(filters.kinds);
      if (next.has(kind)) next.delete(kind);
      else next.add(kind);
      update({ ...filters, kinds: next });
    },
    [filters, update],
  );
  const setPinnedOnly = useCallback(
    (on: boolean) => update({ ...filters, pinnedOnly: on }),
    [filters, update],
  );
  const setSortBy = useCallback(
    (sort: SortKey) => update({ ...filters, sortBy: sort }),
    [filters, update],
  );
  const toggleCollapsed = useCallback(
    (section: CollapsibleSection) => {
      const next = new Set(filters.collapsed);
      if (next.has(section)) next.delete(section);
      else next.add(section);
      update({ ...filters, collapsed: next });
    },
    [filters, update],
  );
  const clear = useCallback(() => update(EMPTY_FILTERS), [update]);

  return useMemo(
    () => ({
      filters,
      hydrated,
      setSearchText,
      toggleStatus,
      toggleKind,
      setPinnedOnly,
      setSortBy,
      toggleCollapsed,
      clear,
    }),
    [
      filters,
      hydrated,
      setSearchText,
      toggleStatus,
      toggleKind,
      setPinnedOnly,
      setSortBy,
      toggleCollapsed,
      clear,
    ],
  );
}

export type FilteredSessions = {
  pinned: HudCodeSession[];
  awaiting: HudCodeSession[];
  working: HudCodeSession[];
  completed: HudCodeSession[];
  totalCounts: { awaiting: number; working: number; completed: number; total: number };
  filteredTotal: number;
  rawTotal: number;
  kindsAvailable: string[];
};

function matchesText(s: HudCodeSession, q: string): boolean {
  if (!q) return true;
  const lower = q.toLowerCase();
  return (
    s.name.toLowerCase().includes(lower) ||
    s.cwd.toLowerCase().includes(lower) ||
    (s.detail ? s.detail.toLowerCase().includes(lower) : false)
  );
}

export function applyFilters(
  sessions: ReadonlyArray<HudCodeSession>,
  filters: SessionsFilters,
  pinSet: ReadonlySet<string>,
  now: number,
): FilteredSessions {
  // Pre-compute totals from the UNFILTERED set so the chip labels show the
  // real counts regardless of which chips are active (matches the spec at
  // CLAUDE.md §10 — the user should see how many they're hiding).
  const rawTotal = sessions.length;
  const allBuckets = { awaiting: 0, working: 0, completed: 0 };
  const kindsSeen = new Set<string>();
  for (const s of sessions) {
    allBuckets[bucketFor(s, now)] += 1;
    if (s.kind) kindsSeen.add(s.kind);
  }
  const totalCounts = { ...allBuckets, total: rawTotal };

  // Apply filters in order: text → kind → pinned → status. Each pass shrinks
  // the working set; the cheapest predicates run first.
  const isPinned = (s: HudCodeSession) =>
    pinSet.has(s.sessionId) || s.pinnedByClaudeCode === true;
  let working = sessions.filter((s) => matchesText(s, filters.searchText));
  if (filters.kinds.size > 0)
    working = working.filter((s) => filters.kinds.has(s.kind));
  if (filters.pinnedOnly) working = working.filter(isPinned);
  if (filters.statuses.size > 0)
    working = working.filter((s) => filters.statuses.has(bucketFor(s, now)));

  // Bucketize the filtered set; pinned sessions live in their own section
  // and are excluded from the status buckets to avoid showing them twice.
  const pinned: HudCodeSession[] = [];
  const pinIds = new Set<string>();
  const aw: HudCodeSession[] = [];
  const wk: HudCodeSession[] = [];
  const co: HudCodeSession[] = [];
  for (const s of working) {
    if (isPinned(s)) {
      pinned.push(s);
      pinIds.add(s.sessionId);
    }
    const b = bucketFor(s, now);
    if (pinIds.has(s.sessionId)) continue;
    if (b === 'awaiting') aw.push(s);
    else if (b === 'working') wk.push(s);
    else co.push(s);
  }

  const cmp =
    filters.sortBy === 'name'
      ? (a: HudCodeSession, b: HudCodeSession) =>
          a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
      : (a: HudCodeSession, b: HudCodeSession) => b.updatedAt - a.updatedAt;
  pinned.sort(cmp);
  aw.sort(cmp);
  wk.sort(cmp);
  co.sort(cmp);

  return {
    pinned,
    awaiting: aw,
    working: wk,
    completed: co,
    totalCounts,
    filteredTotal: working.length,
    rawTotal,
    kindsAvailable: [...kindsSeen].sort(),
  };
}
