'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useHud, useHudHydrated } from './HudProvider';
import { useSessionDetailSheet } from './SessionDetailSheet';
import { usePinnedCodeSessions } from '@/lib/pins';
import type { HudCodeSession } from '@/lib/store';
import { basename, relativeTime, truncate } from '@/lib/format';

// Status buckets in the order the terminal `/agents` view renders them.
export type Bucket = 'awaiting' | 'working' | 'completed';

// Fallback idle threshold for "orphan" sessions that have no daemon
// state.json (those don't carry a semantic state field, so we fall back to
// the JSONL mtime heuristic).
const COMPLETED_THRESHOLD_MS = 5 * 60 * 1000;

function bucketFor(session: HudCodeSession, now: number): Bucket {
  const s = session.status.toLowerCase();
  // Authoritative Claude Code daemon states from
  // ~/.claude/jobs/<short>/state.json. The terminal `/agents` view buckets
  // from these and the HUD matches that mapping 1:1.
  if (s === 'blocked') return 'awaiting';
  if (s === 'working') return 'working';
  if (s === 'done') return 'completed';
  // Legacy OS-level session.json statuses for orphan sessions that have no
  // daemon state.json yet (very new sessions, or non-daemon ones).
  if (s === 'busy' || s === 'running' || s === 'shell') return 'working';
  if (s === 'awaiting_input' || s === 'awaiting' || s === 'idle' || s === 'waiting') return 'awaiting';
  // Final fallback: a session we can't classify but whose JSONL has been
  // silent for >5 min is treated as Completed.
  const lastActivity = session.lastActivityAt ?? session.updatedAt;
  if (lastActivity > 0 && now - lastActivity > COMPLETED_THRESHOLD_MS) return 'completed';
  return 'awaiting';
}

const BUCKET_LABEL: Record<Bucket, string> = {
  // The terminal `/agents` header says "N awaiting input" but the section
  // heading is just "Pinned" — pinned sessions are the ones counted as
  // awaiting input. We follow the section convention here.
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

function sortByUpdated(a: HudCodeSession, b: HudCodeSession): number {
  return b.updatedAt - a.updatedAt;
}

// Double-tap / double-click detector. Returns a stable handler that fires
// `onDouble` only when two taps land within `windowMs`. Used on session
// cards because explicit double-activation avoids accidental sheet opens
// while the user is scrolling on iPad. Mirrors the long-press counter
// pattern in `LongPressable.tsx`.
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

// Asterisk-glyph status icon matching the terminal /agents view. Animation
// classes (defined in apps/hud/app/globals.css) cycle CSS keyframes that
// the global reduced-motion rule flattens, so no JS guard is required.
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
      className="inline-flex h-7 w-7 items-center justify-center rounded-full text-[color:var(--color-hud-fg-muted)] hover:text-[color:var(--color-hud-fg)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-hud-accent)]"
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
    <motion.div
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.16 }}
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
      className="flex cursor-pointer items-start gap-3 rounded-md px-2 py-2 transition-colors hover:bg-[color:color-mix(in_srgb,var(--color-hud-accent)_10%,transparent)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-hud-accent)]"
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
    </motion.div>
  );
}

function BucketSection({
  bucket,
  sessions,
  pinnedSet,
  togglePin,
  now,
  hydrated,
}: {
  bucket: Bucket;
  sessions: ReadonlyArray<HudCodeSession>;
  pinnedSet: ReadonlySet<string>;
  togglePin: (sessionId: string) => void;
  now: number;
  hydrated: boolean;
}) {
  if (sessions.length === 0) return null;
  return (
    <section>
      <p
        className="text-[10px] uppercase tracking-wider"
        style={{ color: BUCKET_HEADER_COLOR[bucket] }}
      >
        {BUCKET_LABEL[bucket]} · {sessions.length}
      </p>
      <div className="mt-1 flex flex-col">
        <AnimatePresence initial={false}>
          {sessions.map((s) => (
            <SessionCardRow
              key={s.sessionId}
              session={s}
              bucket={bucket}
              pinned={pinnedSet.has(s.sessionId)}
              onPinToggle={() => togglePin(s.sessionId)}
              now={now}
              hydrated={hydrated}
            />
          ))}
        </AnimatePresence>
      </div>
    </section>
  );
}

export function SessionsDashboard() {
  const codeSessions = useHud((s) => s.codeSessions);
  const codeSessionsUpdatedAt = useHud((s) => s.codeSessionsUpdatedAt);
  const defaultModel = useHud((s) => s.defaultModel);
  const hydrated = useHudHydrated();
  const { pins, toggle } = usePinnedCodeSessions();
  const [now, setNow] = useState(() => Date.now());

  // Bump every 10s so relative timestamps refresh and the activity-based
  // bucketing re-evaluates promptly (a session crossing the 5-minute idle
  // threshold should fall into "Completed" without waiting for the next
  // poller snapshot to arrive).
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 10_000);
    return () => clearInterval(id);
  }, []);

  const { pinned, awaiting, working, completed, counts } = useMemo(() => {
    const all = Object.values(codeSessions);
    const pin: HudCodeSession[] = [];
    const pinIds = new Set<string>();
    const aw: HudCodeSession[] = [];
    const wk: HudCodeSession[] = [];
    const co: HudCodeSession[] = [];
    // Pass 1: bucket every session by its real semantic state and ALSO
    // collect the pinned subset. A session is pinned if EITHER Claude
    // Code pinned it (~/.claude/jobs/pins.json) OR the user pinned it
    // from inside the HUD (localStorage). The header counts reflect the
    // real categories (so a pinned-and-blocked session contributes to
    // "awaiting"); the section render below excludes pinned items from
    // the bucket sections to avoid showing them twice.
    for (const s of all) {
      const b = bucketFor(s, now);
      const pinnedHere = hydrated && pins.has(s.sessionId);
      const pinnedThere = s.pinnedByClaudeCode === true;
      if (pinnedHere || pinnedThere) {
        pin.push(s);
        pinIds.add(s.sessionId);
      }
      if (b === 'awaiting') aw.push(s);
      else if (b === 'working') wk.push(s);
      else co.push(s);
    }
    // Section arrays: bucket lists minus the pinned ones (those render in
    // the Pinned section instead).
    const filterUnpinned = (arr: HudCodeSession[]) =>
      arr.filter((s) => !pinIds.has(s.sessionId));
    const awSection = filterUnpinned(aw);
    const wkSection = filterUnpinned(wk);
    const coSection = filterUnpinned(co);
    pin.sort(sortByUpdated);
    awSection.sort(sortByUpdated);
    wkSection.sort(sortByUpdated);
    coSection.sort(sortByUpdated);
    return {
      pinned: pin,
      awaiting: awSection,
      working: wkSection,
      completed: coSection,
      counts: { awaiting: aw.length, working: wk.length, completed: co.length, total: all.length },
    };
  }, [codeSessions, pins, hydrated, now]);

  const isEmpty = counts.total === 0 && pinned.length === 0;
  const stale =
    codeSessionsUpdatedAt !== null && hydrated && now - codeSessionsUpdatedAt > 30_000;

  return (
    <div className="hud-card p-6">
      <div className="flex items-baseline justify-between gap-4">
        <p className="hud-fg-muted text-xs uppercase tracking-wider">Sessions</p>
        <div className="hud-fg-muted flex items-center gap-2 text-[11px] font-mono">
          {!isEmpty && (
            <span aria-label="counts">
              {counts.awaiting} awaiting · {counts.working} working · {counts.completed} completed
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
        <div className="mt-4 space-y-3">
          {pinned.length > 0 && (
            <section>
              <p className="hud-fg-muted text-[10px] uppercase tracking-wider">
                Pinned · {pinned.length}
              </p>
              <div className="mt-1 flex flex-col">
                <AnimatePresence initial={false}>
                  {pinned.map((s) => (
                    <SessionCardRow
                      key={s.sessionId}
                      session={s}
                      bucket={bucketFor(s, now)}
                      pinned
                      onPinToggle={() => toggle(s.sessionId)}
                      now={now}
                      hydrated={hydrated}
                    />
                  ))}
                </AnimatePresence>
              </div>
            </section>
          )}
          <BucketSection
            bucket="awaiting"
            sessions={awaiting}
            pinnedSet={pins}
            togglePin={toggle}
            now={now}
            hydrated={hydrated}
          />
          <BucketSection
            bucket="working"
            sessions={working}
            pinnedSet={pins}
            togglePin={toggle}
            now={now}
            hydrated={hydrated}
          />
          <BucketSection
            bucket="completed"
            sessions={completed}
            pinnedSet={pins}
            togglePin={toggle}
            now={now}
            hydrated={hydrated}
          />
        </div>
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
