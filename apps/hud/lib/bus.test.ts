import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { HudEvent } from '@livoclouds/contracts';
import { EventBus, SUBSCRIBER_WARN_THRESHOLD, ZOMBIE_TIMEOUT_MS } from './bus';

// Minimal HudEvent factory — bus does not validate payloads, validation happens at ingest.
function makeEvent(ts = 1): HudEvent {
  return { type: 'session.start', sessionId: 'test', ts } as unknown as HudEvent;
}

// Publish `n` events and return the resulting envelopes.
function publishN(bus: EventBus, n: number): ReturnType<EventBus['publish']>[] {
  return Array.from({ length: n }, (_, i) => bus.publish(makeEvent(i + 1)));
}

// ---------------------------------------------------------------------------
// idIndex consistency — tested via replaySince observable behaviour (H1)
// ---------------------------------------------------------------------------

describe('EventBus — replaySince / idIndex (H1)', () => {
  it('returns all events when lastId is null (no prior position)', () => {
    const b = new EventBus(5);
    publishN(b, 3);
    const { envelopes, truncated } = b.replaySince(null);
    expect(envelopes).toHaveLength(3);
    expect(truncated).toBe(false);
  });

  it('returns empty array and truncated:false for null lastId on empty bus', () => {
    const b = new EventBus(5);
    const { envelopes, truncated } = b.replaySince(null);
    expect(envelopes).toHaveLength(0);
    expect(truncated).toBe(false);
  });

  it('returns events after the given lastId when id exists in the ring', () => {
    const b = new EventBus(10);
    const events = publishN(b, 5);
    const e3 = events[2]!;
    const e4 = events[3]!;
    const e5 = events[4]!;
    const { envelopes, truncated } = b.replaySince(e3.id);
    expect(truncated).toBe(false);
    expect(envelopes).toHaveLength(2);
    expect(envelopes[0]!.id).toBe(e4.id);
    expect(envelopes[1]!.id).toBe(e5.id);
  });

  it('returns empty envelopes with truncated:false when lastId is the newest event', () => {
    const b = new EventBus(5);
    const events = publishN(b, 3);
    const last = events[2]!;
    const { envelopes, truncated } = b.replaySince(last.id);
    expect(envelopes).toHaveLength(0);
    expect(truncated).toBe(false);
  });

  it('returns all events with truncated:true for an unknown lastId on a non-empty bus', () => {
    const b = new EventBus(5);
    publishN(b, 3);
    const { envelopes, truncated } = b.replaySince('bogus');
    expect(envelopes).toHaveLength(3);
    expect(truncated).toBe(true);
  });

  it('returns empty envelopes with truncated:false for any lastId on an empty bus', () => {
    const b = new EventBus(5);
    const { envelopes, truncated } = b.replaySince('bogus');
    expect(envelopes).toHaveLength(0);
    expect(truncated).toBe(false);
  });

  it('evicts the oldest id when the ring wraps and replaySince returns truncated:true for it', () => {
    const cap = 4;
    const b = new EventBus(cap);
    // Fill ring to capacity.
    const filled = publishN(b, cap);
    const first = filled[0]!;
    const fourth = filled[3]!;
    // Publish one more event — overwrites the slot that held 'first'.
    const fifth = b.publish(makeEvent(5));

    // 'first' is evicted; should return all current events with truncated:true.
    const evicted = b.replaySince(first.id);
    expect(evicted.truncated).toBe(true);
    expect(evicted.envelopes).toHaveLength(cap); // ring is still full

    // 'fourth' is still in the ring; replay should return only 'fifth'.
    const still = b.replaySince(fourth.id);
    expect(still.truncated).toBe(false);
    expect(still.envelopes).toHaveLength(1);
    expect(still.envelopes[0]!.id).toBe(fifth.id);
  });

  it('maintains correct replay after multiple wrap-around cycles', () => {
    const cap = 3;
    const b = new EventBus(cap);
    // Publish 2× capacity to force full wrap-around.
    const events = publishN(b, cap * 2);
    const e4 = events[3]!;
    const e5 = events[4]!;
    const e6 = events[5]!;

    // Only the last `cap` events (e4, e5, e6) remain.
    expect(b.replaySince(null).envelopes).toHaveLength(cap);

    // Replaying from e4 should yield e5 and e6.
    const { envelopes, truncated } = b.replaySince(e4.id);
    expect(truncated).toBe(false);
    expect(envelopes.map((e) => e.id)).toEqual([e5.id, e6.id]);

    // Earlier events are evicted.
    const evicted = b.replaySince(events[0]!.id);
    expect(evicted.truncated).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Subscriber registration and delivery
// ---------------------------------------------------------------------------

describe('EventBus — subscriber lifecycle', () => {
  it('delivers published events to all active subscribers', () => {
    const b = new EventBus(5);
    const calls: string[] = [];
    b.subscribe((env) => calls.push(`a:${env.id}`));
    b.subscribe((env) => calls.push(`b:${env.id}`));
    const env = b.publish(makeEvent());
    expect(calls).toEqual([`a:${env.id}`, `b:${env.id}`]);
  });

  it('stops delivering after unsubscription', () => {
    const b = new EventBus(5);
    const received: string[] = [];
    const unsub = b.subscribe((env) => received.push(env.id));
    b.publish(makeEvent(1));
    unsub();
    b.publish(makeEvent(2));
    expect(received).toHaveLength(1);
  });

  it('fan-out continues to other subscribers when one throws', () => {
    const b = new EventBus(5);
    const good = vi.fn();
    b.subscribe(() => {
      throw new Error('boom');
    });
    b.subscribe(good);
    b.publish(makeEvent());
    expect(good).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// Zombie subscriber cleanup (H3)
// ---------------------------------------------------------------------------

describe('EventBus — zombie subscriber cleanup (H3)', () => {
  const SWEEP_INTERVAL_MS = 60_000;

  beforeEach(() => {
    vi.useFakeTimers({ now: 0 });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('prunes a subscriber that has not received a successful delivery after ZOMBIE_TIMEOUT_MS', () => {
    const b = new EventBus(10);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    // Callback always throws → lastDeliveryTs never updates from subscribe time (0).
    const zombie = vi.fn().mockImplementation(() => {
      throw new Error('dead pipe');
    });
    b.subscribe(zombie);

    // Publish so the bus records lastPublishTs (near t=0).
    vi.advanceTimersByTime(1);
    b.publish(makeEvent(1));
    expect(zombie).toHaveBeenCalledTimes(1);

    // Advance to just past ZOMBIE_TIMEOUT_MS and publish again to keep lastPublishTs fresh.
    vi.advanceTimersByTime(ZOMBIE_TIMEOUT_MS);
    b.publish(makeEvent(2));
    expect(zombie).toHaveBeenCalledTimes(2);

    // Advance past the next sweep → sweepZombies fires and prunes the zombie.
    vi.advanceTimersByTime(SWEEP_INTERVAL_MS);

    // Subsequent publish should no longer reach the pruned subscriber.
    b.publish(makeEvent(3));
    expect(zombie).toHaveBeenCalledTimes(2);

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('pruned'));
    warnSpy.mockRestore();
  });

  it('does not prune a healthy subscriber that receives deliveries', () => {
    const b = new EventBus(10);

    const healthy = vi.fn();
    b.subscribe(healthy);

    // Keep publishing and advancing; healthy subscriber stays alive.
    for (let i = 0; i < 10; i++) {
      vi.advanceTimersByTime(SWEEP_INTERVAL_MS);
      b.publish(makeEvent(i));
    }

    expect(healthy).toHaveBeenCalledTimes(10);
  });

  it('does not prune subscribers when the bus itself has been quiet', () => {
    const b = new EventBus(10);
    const cb = vi.fn();
    b.subscribe(cb);

    // Publish once at t=0, then go quiet for a long time.
    b.publish(makeEvent(1));
    vi.advanceTimersByTime(ZOMBIE_TIMEOUT_MS * 3);
    // The sweep runs but bus is quiet (lastPublishTs is too old) → no prune.

    // Resume publishing — subscriber should still receive.
    b.publish(makeEvent(2));
    expect(cb).toHaveBeenCalledTimes(2);
  });

  it('logs a warning when subscriber count exceeds SUBSCRIBER_WARN_THRESHOLD', () => {
    const b = new EventBus(10);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    // Subscribe SUBSCRIBER_WARN_THRESHOLD callbacks without triggering the warning.
    for (let i = 0; i < SUBSCRIBER_WARN_THRESHOLD; i++) {
      b.subscribe(() => {});
    }
    expect(warnSpy).not.toHaveBeenCalled();

    // The (SUBSCRIBER_WARN_THRESHOLD + 1)th subscription triggers the warning.
    b.subscribe(() => {});
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('exceeds threshold'));

    warnSpy.mockRestore();
  });
});
