// Server-only aggregation over the rolling JSONL event log.
//
// Reads `data/events-YYYY-MM-DD.jsonl` (written by lib/log.ts) and folds the
// events into per-session and per-day buckets. Past days are immutable once
// they roll over, so their reduced result is cached at module scope. Today's
// bucket is always recomputed because new events keep arriving.

// Imports node:fs, so any accidental client import would already fail at build
// time. We do not depend on the `server-only` poison package to keep the
// dependency surface minimal.
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { HudEventSchema, type HudEvent } from '@livoclouds/contracts';

export type SessionAggregate = {
  id: string;
  model: string | null;
  cwd: string | null;
  startedAt: number;
  endedAt: number | null;
  tokensIn: number;
  tokensOut: number;
  tokensCached: number;
  costUsd: number;
  contextPct: number;
  toolCount: number;
  errorCount: number;
  day: string;
};

export type DayTotal = {
  day: string;
  costUsd: number;
  tokensIn: number;
  tokensOut: number;
  sessions: number;
};

type DayBundle = {
  sessions: Map<string, SessionAggregate>;
  total: DayTotal;
};

const DATA_DIR = join(process.cwd(), 'data');
const dayCache = new Map<string, DayBundle>();

function utcDayKey(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function todayKey(now: number): string {
  return utcDayKey(now);
}

function daysBack(count: number, now: number): string[] {
  const out: string[] = [];
  for (let i = count - 1; i >= 0; i -= 1) {
    out.push(utcDayKey(now - i * 24 * 60 * 60 * 1000));
  }
  return out;
}

function emptyDay(day: string): DayBundle {
  return {
    sessions: new Map(),
    total: { day, costUsd: 0, tokensIn: 0, tokensOut: 0, sessions: 0 },
  };
}

// Excludes the sessions.snapshot event, which has no `sessionId` — it is a
// global heartbeat from the sidecar poller, not a session-level event.
type SessionScopedEvent = Exclude<HudEvent, { type: 'sessions.snapshot' }>;

function ensureSession(bundle: DayBundle, event: SessionScopedEvent): SessionAggregate {
  let agg = bundle.sessions.get(event.sessionId);
  if (!agg) {
    agg = {
      id: event.sessionId,
      model: 'model' in event && event.model ? event.model : null,
      cwd: 'cwd' in event && event.cwd ? event.cwd : null,
      startedAt: event.ts,
      endedAt: null,
      tokensIn: 0,
      tokensOut: 0,
      tokensCached: 0,
      costUsd: 0,
      contextPct: 0,
      toolCount: 0,
      errorCount: 0,
      day: bundle.total.day,
    };
    bundle.sessions.set(event.sessionId, agg);
    bundle.total.sessions += 1;
  } else if (event.ts < agg.startedAt) {
    agg.startedAt = event.ts;
  }
  if ('model' in event && event.model && !agg.model) agg.model = event.model;
  if ('cwd' in event && event.cwd && !agg.cwd) agg.cwd = event.cwd;
  return agg;
}

function applyEvent(bundle: DayBundle, event: HudEvent): void {
  // Snapshot events are global heartbeats — they do not belong to any one
  // session and are not aggregated into per-session totals.
  if (event.type === 'sessions.snapshot') return;
  const agg = ensureSession(bundle, event);
  switch (event.type) {
    case 'session.start': {
      agg.startedAt = event.ts;
      agg.endedAt = null;
      agg.tokensIn = 0;
      agg.tokensOut = 0;
      agg.tokensCached = 0;
      agg.costUsd = 0;
      agg.contextPct = 0;
      agg.toolCount = 0;
      agg.errorCount = 0;
      return;
    }
    case 'session.end': {
      agg.endedAt = event.ts;
      if (event.tokens) {
        agg.tokensIn = event.tokens.in;
        agg.tokensOut = event.tokens.out;
        agg.tokensCached = event.tokens.cached ?? agg.tokensCached;
      }
      if (typeof event.costUsd === 'number') agg.costUsd = event.costUsd;
      return;
    }
    case 'tool.use': {
      agg.toolCount += 1;
      return;
    }
    case 'turn.stop': {
      // turn.stop from hooks no longer carries authoritative numbers; the
      // transcript poller is the source of truth via turn.metrics. Older
      // events with these fields (e.g., from legacy hook scripts replayed
      // from disk) are intentionally ignored here so a poller-derived row
      // does not get clobbered by stale hook data.
      return;
    }
    case 'turn.metrics': {
      agg.tokensIn = event.tokens.in;
      agg.tokensOut = event.tokens.out;
      agg.tokensCached = event.tokens.cached ?? agg.tokensCached;
      if (typeof event.costUsd === 'number') agg.costUsd = event.costUsd;
      agg.contextPct = event.contextPct;
      return;
    }
    case 'agent.invoke':
    case 'agent.complete': {
      // Subagent lifecycle does not roll into the day's per-session aggregate.
      // (The Agents page reads from the in-memory store, not these bundles.)
      return;
    }
    case 'error': {
      agg.errorCount += 1;
      return;
    }
    case 'prompt.submit':
    case 'compact.start':
    case 'compact.end':
      return;
  }
}

function finalizeTotals(bundle: DayBundle): void {
  bundle.total.costUsd = 0;
  bundle.total.tokensIn = 0;
  bundle.total.tokensOut = 0;
  for (const s of bundle.sessions.values()) {
    bundle.total.costUsd += s.costUsd;
    bundle.total.tokensIn += s.tokensIn;
    bundle.total.tokensOut += s.tokensOut;
  }
}

async function readDay(day: string): Promise<DayBundle> {
  const bundle = emptyDay(day);
  const path = join(DATA_DIR, `events-${day}.jsonl`);
  let raw: string;
  try {
    raw = await readFile(path, 'utf8');
  } catch {
    return bundle;
  }
  for (const line of raw.split('\n')) {
    if (!line) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      continue;
    }
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      !('event' in parsed)
    ) {
      continue;
    }
    const result = HudEventSchema.safeParse((parsed as { event: unknown }).event);
    if (!result.success) continue;
    applyEvent(bundle, result.data);
  }
  finalizeTotals(bundle);
  return bundle;
}

async function loadBundles(days: string[], now: number): Promise<DayBundle[]> {
  const today = todayKey(now);
  const out: DayBundle[] = [];
  for (const day of days) {
    if (day === today) {
      // Today's file may still be growing — always re-read.
      out.push(await readDay(day));
      continue;
    }
    const cached = dayCache.get(day);
    if (cached) {
      out.push(cached);
      continue;
    }
    const bundle = await readDay(day);
    dayCache.set(day, bundle);
    out.push(bundle);
  }
  return out;
}

export async function getSessionsLast14Days(
  now: number = Date.now(),
): Promise<SessionAggregate[]> {
  const days = daysBack(14, now);
  const bundles = await loadBundles(days, now);
  const out: SessionAggregate[] = [];
  for (const bundle of bundles) {
    for (const s of bundle.sessions.values()) out.push(s);
  }
  return out;
}

export async function getDailyTotals(
  days = 14,
  now: number = Date.now(),
): Promise<DayTotal[]> {
  const keys = daysBack(days, now);
  const bundles = await loadBundles(keys, now);
  return bundles.map((b) => b.total);
}

export type SessionSort = 'cost' | 'recent';

export function sortSessions(
  list: ReadonlyArray<SessionAggregate>,
  by: SessionSort,
): SessionAggregate[] {
  const copy = list.slice();
  if (by === 'cost') {
    copy.sort((a, b) => b.costUsd - a.costUsd || b.startedAt - a.startedAt);
  } else {
    copy.sort((a, b) => b.startedAt - a.startedAt);
  }
  return copy;
}

// Test/dev hook — clears the cached past-day bundles. Not exported to clients.
export function __resetAggregationCacheForTests(): void {
  dayCache.clear();
}
