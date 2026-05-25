'use client';

import { useCallback, useMemo, useRef } from 'react';
import { motion } from 'motion/react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useHud, useHudHydrated } from './HudProvider';
import { useSessionDetailSheet } from './SessionDetailSheet';
import { usePinnedCodeSessions } from '@/lib/pins';
import type { HudCodeSession } from '@/lib/store';
import { basename, relativeTime, truncate } from '@/lib/format';
import {
  applyFilters,
  bucketFor,
  useSessionsFilters,
  type Bucket,
  type CollapsibleSection,
} from '@/lib/sessions-filters';
import { SessionsFilterBar } from './SessionsFilterBar';
import { useGlobalTick } from '@/lib/use-global-tick';
import {
  selectCodeSessions,
  selectCodeSessionsUpdatedAt,
  selectDefaultModel,
} from '@/lib/store-selectors';

// Re-export the bucket type so other modules (e.g. SessionDetailSheet) keep
// importing it from here without caring that the canonical definition now
// lives in lib/sessions-filters.
export type { Bucket };

const BUCKET_LABEL: Record<Bucket, string> = {
  awaiting: 'Awaiting input',
  working: 'Working',
  completed: 'Completed',
};

const BUCKET_DOT: Record<Bucket, string> = {
  awaiting: 'var(--color-hud-accent)',
  working: 'var(--color-hud-warn)',
  completed: 'var(--color-hud-success)',
};

const BUCKET_HEADER_COLOR: Record<Bucket, string> = {
  awaiting: 'var(--color-hud-accent)',
  working: 'var(--color-hud-warn)',
  completed: 'var(--color-hud-success)',
};

// Estimated row heights for the virtualizer. Headers are shorter than data rows.
const HEADER_HEIGHT = 36;
const ROW_HEIGHT = 68;

// Double-tap / double-click detector. Returns a stable handler that fires
// `onDouble` only when two taps land within `windowMs`. Used on session
// cards because explicit double-activation avoids accidental sheet opens
// while the user is scrolling on iPad.
const DOUBLE_TAP_WINDOW_MS = 320;

function useDoubleTap(onDouble: () => void) {
  const lastRef = useRef(0);
  return useCallback(() => {
    const now = Date.now();
    if (now - lastRef.current < DOUBLE_TAP_WINDOW_MS) {
      lastRef.current = 0;
      onDouble();
    } else {
      lastRef.current = now;
    }
  }, [onDouble]);
}

// Asterisk-glyph status icon matching the terminal /agents view.
export function SessionStatusIcon({
  bucket,
  color,
  size,
}: {
  bucket: Bucket;
  color?: string;
  size?: number;
}) {
  const cls =
    bucket === 'working'
      ? 'session-icon session-icon-working'
      : bucket === 'awaiting'
        ? 'session-icon session-icon-awaiting'
        : 'session-icon';
  return (
    <span
      aria-hidden
      className={cls}
      style={{
        color: color ?? BUCKET_DOT[bucket],
        marginTop: 4,
        flex: 'none',
        ...(typeof size === 'number'
          ? { width: size, height: size, fontSize: size }
          : {}),
      }}
    >
      ✻
    </span>
  );
}

function PinButton({
  pinned,
  onToggle,
  sessionName,
}: {
  pinned: boolean;
  onToggle: () => void;
  sessionName: string;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      aria-label={pinned ? `Unpin ${sessionName}` : `Pin ${sessionName}`}
      title={pinned ? 'Unpin' : 'Pin'}
      className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full text-[color:var(--color-hud-fg-muted)] transition-opacity active:opacity-60 hover:text-[color:var(--color-hud-fg)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-hud-accent)]"
      style={pinned ? { color: 'var(--color-hud-accent)' } : undefined}
    >
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill={pinned ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M12 17v5" />
        <path d="M5 17h14l-2-5V5H7v7l-2 5Z" />
      </svg>
    </button>
  );
}

function SessionCardRow({
  session,
  bucket,
  pinned,
  onPinToggle,
  now,
  hydrated,
}: {
  session: HudCodeSession;
  bucket: Bucket;
  pinned: boolean;
  onPinToggle: () => void;
  now: number;
  hydrated: boolean;
}) {
  const dot = BUCKET_DOT[bucket];
  const { show } = useSessionDetailSheet();
  const handleDoubleActivate = useDoubleTap(() => show(session.sessionId));
  return (
    <div
      data-no-swipe="true"
      role="button"
      tabIndex={0}
      aria-label={`Open details for ${session.name}`}
      onClick={handleDoubleActivate}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          show(session.sessionId);
        }
      }}
      className="flex cursor-pointer items-start gap-3 rounded-md px-2 py-2 transition-colors active:brightness-90 hover:bg-[color:color-mix(in_srgb,var(--color-hud-accent)_10%,transparent)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-hud-accent)]"
    >
      <SessionStatusIcon bucket={bucket} color={dot} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span
            className="hud-fg font-mono text-sm leading-tight"
            title={session.name}
          >
            {truncate(session.name, 38)}
          </span>
          {session.kind && session.kind !== 'fg' && (
            <span
              className="hud-fg-muted rounded-full px-1.5 text-[10px] font-medium uppercase tracking-wide"
              style={{ background: 'var(--color-hud-card-bg)' }}
              title={`kind: ${session.kind}`}
            >
              {session.kind}
            </span>
          )}
        </div>
        <div className="mt-0.5 flex items-center gap-2 text-[11px]">
          <span className="hud-fg-muted font-mono" title={session.cwd}>
            {truncate(basename(session.cwd), 26)}
          </span>
          <span className="hud-fg-muted">·</span>
          <span
            className="hud-fg-muted"
            title={`updatedAt: ${new Date(session.updatedAt).toISOString()}`}
          >
            {hydrated
              ? relativeTime(session.lastActivityAt ?? session.updatedAt, now)
              : '…'}
          </span>
        </div>
        {session.detail && (
          <p
            className="hud-fg-muted mt-1 text-[11px] leading-snug"
            title={session.detail}
          >
            {truncate(session.detail, 110)}
          </p>
        )}
      </div>
      <PinButton pinned={pinned} onToggle={onPinToggle} sessionName={session.name} />
    </div>
  );
}

function CollapseChevron({ collapsed }: { collapsed: boolean }) {
  return (
    <motion.span
      aria-hidden
      initial={false}
      animate={{ rotate: collapsed ? -90 : 0 }}
      transition={{ duration: 0.18 }}
      className="inline-block"
      style={{ width: 12, height: 12 }}
    >
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="6 9 12 15 18 9" />
      </svg>
    </motion.span>
  );
}

function CollapsibleHeader({
  label,
  count,
  color,
  section,
  collapsed,
  onToggle,
}: {
  label: string;
  count: number;
  color: string;
  section: CollapsibleSection;
  collapsed: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={!collapsed}
      aria-controls={`bucket-${section}`}
      className="flex min-h-[44px] w-full items-center gap-2 rounded-md px-1 py-1 text-left text-[10px] uppercase tracking-wider transition-colors active:opacity-70 hover:bg-[color:color-mix(in_srgb,var(--color-hud-accent)_8%,transparent)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-hud-accent)]"
      style={{ color }}
    >
      <CollapseChevron collapsed={collapsed} />
      <span>
        {label} · {count}
      </span>
    </button>
  );
}

// ─── Flat virtual items ────────────────────────────────────────────────────────
// The virtualizer works on a flat array of typed items. Headers are
// interleaved with rows; rows are omitted when the section is collapsed so
// the virtual height collapses instantly (no AnimatePresence needed).

type VirtualItem =
  | {
      kind: 'header';
      section: CollapsibleSection;
      label: string;
      count: number;
      color: string;
      collapsed: boolean;
    }
  | {
      kind: 'row';
      session: HudCodeSession;
      bucket: Bucket;
      isPinned: boolean;
    };

function buildItems(
  pinned: ReadonlyArray<HudCodeSession>,
  awaiting: ReadonlyArray<HudCodeSession>,
  working: ReadonlyArray<HudCodeSession>,
  completed: ReadonlyArray<HudCodeSession>,
  pinnedSet: ReadonlySet<string>,
  collapsed: ReadonlySet<CollapsibleSection>,
  now: number,
): VirtualItem[] {
  const items: VirtualItem[] = [];

  if (pinned.length > 0) {
    const isCollapsed = collapsed.has('pinned');
    items.push({
      kind: 'header',
      section: 'pinned',
      label: 'Pinned',
      count: pinned.length,
      color: 'var(--color-hud-fg-muted)',
      collapsed: isCollapsed,
    });
    if (!isCollapsed) {
      for (const s of pinned) {
        items.push({ kind: 'row', session: s, bucket: bucketFor(s, now), isPinned: true });
      }
    }
  }

  if (awaiting.length > 0) {
    const isCollapsed = collapsed.has('awaiting');
    items.push({
      kind: 'header',
      section: 'awaiting',
      label: BUCKET_LABEL['awaiting'],
      count: awaiting.length,
      color: BUCKET_HEADER_COLOR['awaiting'],
      collapsed: isCollapsed,
    });
    if (!isCollapsed) {
      for (const s of awaiting) {
        items.push({ kind: 'row', session: s, bucket: 'awaiting', isPinned: pinnedSet.has(s.sessionId) });
      }
    }
  }

  if (working.length > 0) {
    const isCollapsed = collapsed.has('working');
    items.push({
      kind: 'header',
      section: 'working',
      label: BUCKET_LABEL['working'],
      count: working.length,
      color: BUCKET_HEADER_COLOR['working'],
      collapsed: isCollapsed,
    });
    if (!isCollapsed) {
      for (const s of working) {
        items.push({ kind: 'row', session: s, bucket: 'working', isPinned: pinnedSet.has(s.sessionId) });
      }
    }
  }

  if (completed.length > 0) {
    const isCollapsed = collapsed.has('completed');
    items.push({
      kind: 'header',
      section: 'completed',
      label: BUCKET_LABEL['completed'],
      count: completed.length,
      color: BUCKET_HEADER_COLOR['completed'],
      collapsed: isCollapsed,
    });
    if (!isCollapsed) {
      for (const s of completed) {
        items.push({ kind: 'row', session: s, bucket: 'completed', isPinned: pinnedSet.has(s.sessionId) });
      }
    }
  }

  return items;
}

export function SessionsDashboard() {
  const codeSessions = useHud(selectCodeSessions);
  const codeSessionsUpdatedAt = useHud(selectCodeSessionsUpdatedAt);
  const defaultModel = useHud(selectDefaultModel);
  const hydrated = useHudHydrated();
  const { pins, toggle } = usePinnedCodeSessions();
  const {
    filters,
    setSearchText,
    toggleStatus,
    toggleKind,
    setPinnedOnly,
    setSortBy,
    toggleCollapsed,
    clear,
  } = useSessionsFilters();

  // Single shared ticker replaces the per-component setInterval (C4).
  const now = useGlobalTick('slow');

  const filtered = useMemo(
    () => applyFilters(Object.values(codeSessions), filters, pins, now),
    [codeSessions, filters, pins, now],
  );

  const { pinned, awaiting, working, completed, totalCounts, filteredTotal, rawTotal, kindsAvailable } =
    filtered;
  const isEmpty = rawTotal === 0;
  const noResults =
    !isEmpty && filteredTotal === 0 && pinned.length === 0;
  const stale =
    codeSessionsUpdatedAt !== null && hydrated && now - codeSessionsUpdatedAt > 30_000;

  // Build flat virtualizable items from the filtered + collapsed state.
  const items = useMemo(
    () => buildItems(pinned, awaiting, working, completed, pins, filters.collapsed, now),
    [pinned, awaiting, working, completed, pins, filters.collapsed, now],
  );

  const scrollRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (i) => (items[i]?.kind === 'header' ? HEADER_HEIGHT : ROW_HEIGHT),
    overscan: 4,
  });

  return (
    <div className="hud-card p-6">
      <div className="flex items-baseline justify-between gap-4">
        <p className="hud-fg-muted text-xs uppercase tracking-wider">Sessions</p>
        <div className="hud-fg-muted flex items-center gap-2 text-[11px] font-mono">
          {!isEmpty && (
            <span aria-label="counts">
              {totalCounts.awaiting} awaiting · {totalCounts.working} working ·{' '}
              {totalCounts.completed} completed
            </span>
          )}
          {defaultModel && (
            <>
              <span aria-hidden>·</span>
              <span title="Default model">default {defaultModel}</span>
            </>
          )}
        </div>
      </div>

      {isEmpty ? (
        <p className="hud-fg-muted mt-4 text-sm">
          {codeSessionsUpdatedAt === null
            ? 'Waiting for sessions snapshot from the poller…'
            : 'No active Claude Code sessions.'}
        </p>
      ) : (
        <>
          <SessionsFilterBar
            filters={filters}
            counts={{
              awaiting: totalCounts.awaiting,
              working: totalCounts.working,
              completed: totalCounts.completed,
            }}
            filteredTotal={filteredTotal + pinned.length}
            rawTotal={rawTotal}
            kindsAvailable={kindsAvailable}
            onSearchChange={setSearchText}
            onToggleStatus={toggleStatus}
            onToggleKind={toggleKind}
            onTogglePinnedOnly={() => setPinnedOnly(!filters.pinnedOnly)}
            onSortChange={setSortBy}
            onClear={clear}
          />

          {noResults ? (
            <div className="mt-4 rounded-md border border-dashed border-[var(--color-hud-card-border)] bg-[var(--color-hud-card-bg)]/40 p-6 text-center">
              <span aria-hidden className="hud-fg-muted text-2xl">
                ◯
              </span>
              <p className="hud-fg-soft mt-2 text-sm">
                No sessions match the current filters
              </p>
              <button
                type="button"
                onClick={clear}
                className="hud-fg-muted mt-3 inline-flex h-11 items-center gap-1 rounded-full bg-[var(--color-hud-accent)]/10 px-3 text-[11px] uppercase tracking-wider transition-colors active:scale-[0.97] active:opacity-80 hover:bg-[var(--color-hud-accent)]/20 hover:text-[color:var(--color-hud-accent)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-hud-accent)]"
              >
                ✕ Clear filters
              </button>
            </div>
          ) : (
            // Virtualized scroll container: only the ~10 visible rows plus
            // overscan are mounted, regardless of total session count (C2).
            <div
              ref={scrollRef}
              className="hud-scrollbar mt-3 max-h-[60vh] overflow-y-auto pr-1"
            >
              <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
                {virtualizer.getVirtualItems().map((vItem) => {
                  const item = items[vItem.index];
                  if (!item) return null;
                  return (
                    <div
                      key={vItem.key}
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        height: `${vItem.size}px`,
                        transform: `translateY(${vItem.start}px)`,
                      }}
                    >
                      {item.kind === 'header' ? (
                        <CollapsibleHeader
                          label={item.label}
                          count={item.count}
                          color={item.color}
                          section={item.section}
                          collapsed={item.collapsed}
                          onToggle={() => toggleCollapsed(item.section)}
                        />
                      ) : (
                        <SessionCardRow
                          session={item.session}
                          bucket={item.bucket}
                          pinned={item.isPinned}
                          onPinToggle={() => toggle(item.session.sessionId)}
                          now={now}
                          hydrated={hydrated}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}

      {stale && (
        <p
          className="mt-3 text-[10px] uppercase tracking-wider"
          style={{ color: 'var(--color-hud-warn)' }}
          title={`Last snapshot ${relativeTime(codeSessionsUpdatedAt!, now)}`}
        >
          ⚠ Sessions data stale — is the poller running?
        </p>
      )}
    </div>
  );
}
