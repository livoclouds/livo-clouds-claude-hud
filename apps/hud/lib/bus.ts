import type { HudEvent } from '@livoclouds/contracts';

export type BusEnvelope = {
  id: string;
  event: HudEvent;
};

export type Subscriber = (envelope: BusEnvelope) => void;

type SubscriberMeta = { lastDeliveryTs: number; onForced?: () => void };

const DEFAULT_CAPACITY = 1000;
const SWEEP_INTERVAL_MS = 60_000;

export const ZOMBIE_TIMEOUT_MS = 5 * 60_000;
export const SUBSCRIBER_WARN_THRESHOLD = 50;

function readCapacity(): number {
  const raw = process.env.HUD_BUS_SIZE;
  if (!raw) return DEFAULT_CAPACITY;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 1) return DEFAULT_CAPACITY;
  return parsed;
}

export class EventBus {
  private readonly _capacity: number;
  private readonly ring: Array<BusEnvelope | undefined>;
  private head = 0;
  private count = 0;
  private nextId = 1;
  /** Maps event id → ring slot for O(1) replaySince lookup. Evicted when slot is overwritten. */
  private readonly idIndex = new Map<string, number>();
  private readonly subscribers = new Map<Subscriber, SubscriberMeta>();
  private lastPublishTs = 0;
  private sweepTimer: ReturnType<typeof setInterval> | null = null;

  constructor(capacity: number) {
    this._capacity = capacity;
    this.ring = new Array<BusEnvelope | undefined>(capacity);
  }

  capacity(): number {
    return this._capacity;
  }

  publish(event: HudEvent): BusEnvelope {
    const envelope: BusEnvelope = {
      id: (this.nextId++).toString(36),
      event,
    };

    // Evict the ID that currently occupies this slot before overwriting.
    const slot = this.head;
    const old = this.ring[slot];
    if (old) this.idIndex.delete(old.id);

    this.ring[slot] = envelope;
    this.idIndex.set(envelope.id, slot);
    this.head = (slot + 1) % this._capacity;
    if (this.count < this._capacity) this.count += 1;

    this.lastPublishTs = Date.now();

    for (const [sub, meta] of [...this.subscribers]) {
      try {
        sub(envelope);
        meta.lastDeliveryTs = Date.now();
      } catch {
        // One bad subscriber must not break fan-out. Payload is intentionally
        // omitted from logs to avoid leaking event content.
        console.error('bus: subscriber threw during fan-out');
      }
    }
    return envelope;
  }

  subscribe(cb: Subscriber, opts?: { onForced?: () => void }): () => void {
    this.subscribers.set(cb, { lastDeliveryTs: Date.now(), onForced: opts?.onForced });
    this.startSweep();
    if (this.subscribers.size > SUBSCRIBER_WARN_THRESHOLD) {
      console.warn(
        `bus: subscriber count ${this.subscribers.size} exceeds threshold of ${SUBSCRIBER_WARN_THRESHOLD}`,
      );
    }
    return () => {
      this.subscribers.delete(cb);
    };
  }

  snapshot(limit?: number): BusEnvelope[] {
    if (this.count === 0) return [];
    const out: BusEnvelope[] = [];
    const start = this.count < this._capacity ? 0 : this.head;
    for (let i = 0; i < this.count; i += 1) {
      const slot = this.ring[(start + i) % this._capacity];
      if (slot) out.push(slot);
    }
    return limit !== undefined ? out.slice(-limit) : out;
  }

  replaySince(lastId: string | null): { envelopes: BusEnvelope[]; truncated: boolean } {
    if (!lastId) return { envelopes: this.snapshot(), truncated: false };

    const slot = this.idIndex.get(lastId);
    if (slot === undefined) {
      // ID is unknown or was evicted by ring wrap-around.
      const all = this.snapshot();
      return { envelopes: all, truncated: all.length > 0 };
    }

    // O(1) slot found. Collect the events that follow it in chronological order.
    const oldestSlot = this.count < this._capacity ? 0 : this.head;
    const slotPos = (slot - oldestSlot + this._capacity) % this._capacity;
    const numAfter = this.count - slotPos - 1;

    const envelopes: BusEnvelope[] = [];
    for (let i = 0; i < numAfter; i++) {
      const s = (slot + 1 + i) % this._capacity;
      const env = this.ring[s];
      if (env) envelopes.push(env);
    }
    return { envelopes, truncated: false };
  }

  private startSweep(): void {
    if (this.sweepTimer) return;
    this.sweepTimer = setInterval(() => this.sweepZombies(), SWEEP_INTERVAL_MS);
    // Do not hold the Node.js process open solely for cleanup sweeps.
    if (typeof this.sweepTimer === 'object' && this.sweepTimer !== null && 'unref' in this.sweepTimer) {
      (this.sweepTimer as NodeJS.Timeout).unref();
    }
  }

  private sweepZombies(): void {
    if (this.subscribers.size === 0) {
      // All subscribers unsubscribed between sweeps — disarm the timer so it
      // doesn't fire unnecessarily. startSweep() re-arms it on the next subscribe().
      clearInterval(this.sweepTimer!);
      this.sweepTimer = null;
      return;
    }
    const now = Date.now();
    // Only prune when the bus is actively publishing; a quiet bus with old
    // lastDeliveryTs values is normal, not a sign of zombies.
    if (!this.lastPublishTs || now - this.lastPublishTs > ZOMBIE_TIMEOUT_MS) return;

    const threshold = now - ZOMBIE_TIMEOUT_MS;
    let pruned = 0;
    for (const [sub, meta] of this.subscribers) {
      if (meta.lastDeliveryTs < threshold) {
        this.subscribers.delete(sub);
        meta.onForced?.();
        pruned++;
      }
    }
    if (pruned > 0) {
      console.warn(`bus: pruned ${pruned} zombie subscriber(s)`);
    }
    if (this.subscribers.size === 0) {
      // All subscribers were pruned — disarm until the next subscribe().
      clearInterval(this.sweepTimer!);
      this.sweepTimer = null;
    } else if (this.subscribers.size > SUBSCRIBER_WARN_THRESHOLD) {
      console.warn(
        `bus: ${this.subscribers.size} active subscribers exceed threshold of ${SUBSCRIBER_WARN_THRESHOLD}`,
      );
    }
  }
}

declare global {
  var __hudEventBus: EventBus | undefined;
}

export const bus: EventBus = globalThis.__hudEventBus ?? new EventBus(readCapacity());
if (!globalThis.__hudEventBus) {
  globalThis.__hudEventBus = bus;
}
