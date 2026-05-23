import type { HudEvent } from '@livoclouds/contracts';

export type BusEnvelope = {
  id: string;
  event: HudEvent;
};

export type Subscriber = (envelope: BusEnvelope) => void;

const DEFAULT_CAPACITY = 1000;

function readCapacity(): number {
  const raw = process.env.HUD_BUS_SIZE;
  if (!raw) return DEFAULT_CAPACITY;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 1) return DEFAULT_CAPACITY;
  return parsed;
}

class EventBus {
  private readonly _capacity: number;
  private readonly ring: Array<BusEnvelope | undefined>;
  private head = 0;
  private count = 0;
  private nextId = 1;
  private readonly subscribers = new Set<Subscriber>();

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
    this.ring[this.head] = envelope;
    this.head = (this.head + 1) % this._capacity;
    if (this.count < this._capacity) this.count += 1;

    for (const sub of [...this.subscribers]) {
      try {
        sub(envelope);
      } catch {
        // One bad subscriber must not break fan-out. Payload is intentionally
        // omitted from logs to avoid leaking event content.
        console.error('bus: subscriber threw during fan-out');
      }
    }
    return envelope;
  }

  subscribe(cb: Subscriber): () => void {
    this.subscribers.add(cb);
    return () => {
      this.subscribers.delete(cb);
    };
  }

  snapshot(): BusEnvelope[] {
    if (this.count === 0) return [];
    const out: BusEnvelope[] = [];
    const start = this.count < this._capacity ? 0 : this.head;
    for (let i = 0; i < this.count; i += 1) {
      const slot = this.ring[(start + i) % this._capacity];
      if (slot) out.push(slot);
    }
    return out;
  }

  replaySince(lastId: string | null): { envelopes: BusEnvelope[]; truncated: boolean } {
    const all = this.snapshot();
    if (!lastId) return { envelopes: all, truncated: false };
    const idx = all.findIndex((e) => e.id === lastId);
    if (idx === -1) {
      return { envelopes: all, truncated: all.length > 0 };
    }
    return { envelopes: all.slice(idx + 1), truncated: false };
  }
}

declare global {
  var __hudEventBus: EventBus | undefined;
}

export const bus: EventBus = globalThis.__hudEventBus ?? new EventBus(readCapacity());
if (!globalThis.__hudEventBus) {
  globalThis.__hudEventBus = bus;
}
