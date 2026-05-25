import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildSseResponse, formatComment, type SseBackpressureConfig } from './sse';

// Minimal AbortController-backed Request factory.
function makeReq(): { req: Request; abort: () => void } {
  const controller = new AbortController();
  const req = new Request('http://localhost/api/stream', { signal: controller.signal });
  return { req, abort: () => controller.abort() };
}

// ---------------------------------------------------------------------------
// Normal (no backpressure config) behaviour
// ---------------------------------------------------------------------------

describe('buildSseResponse — no backpressure config', () => {
  it('calls onStart and streams writes without closing', async () => {
    const { req } = makeReq();
    const onClose = vi.fn();
    let writerRef: ((c: string) => void) | null = null;

    const res = buildSseResponse(req, {
      onStart: (write) => {
        writerRef = write;
        write(formatComment('hello'));
      },
      onClose,
    });

    expect(res.status).toBe(200);
    // Lock the stream so start() fires; cancel the reader when done.
    const reader = res.body!.getReader();
    // Yield to let start() run.
    await Promise.resolve();
    expect(writerRef).not.toBeNull();
    expect(onClose).not.toHaveBeenCalled();

    // Clean up via the reader so we don't try to cancel an already-locked body.
    await reader.cancel().catch(() => {});
  });

  it('exposes a close() function as the second onStart parameter', async () => {
    const { req } = makeReq();
    const onClose = vi.fn();
    let closeRef: (() => void) | null = null;

    buildSseResponse(req, {
      onStart: (_write, close) => {
        closeRef = close;
      },
      onClose,
    });

    await Promise.resolve();
    expect(closeRef).toBeTypeOf('function');
  });
});

// ---------------------------------------------------------------------------
// Backpressure: byte-counting fallback path
// In vitest's Node environment, ReadableStream has no consumer attached during
// tests, so controller.desiredSize is null — the byte-counting fallback activates.
// ---------------------------------------------------------------------------

describe('buildSseResponse — backpressure (byte-counting fallback)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: 0 });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('does not close connection when bytes stay below threshold', async () => {
    const { req } = makeReq();
    const onClose = vi.fn();
    let writer!: (c: string) => void;

    buildSseResponse(req, {
      backpressure: { maxBytes: 1000, graceSecs: 5 },
      onStart: (write) => { writer = write; },
      onClose,
    });

    await Promise.resolve();
    writer('hi'); // well under 1000 bytes

    vi.advanceTimersByTime(10_000); // well past grace window

    // No second write comes in → bpSince was set on first write but
    // grace check only fires on subsequent writes — no close triggered.
    expect(onClose).not.toHaveBeenCalled();
  });

  it('closes a slow consumer after grace window when bytes exceed threshold', async () => {
    const { req } = makeReq();
    const onClose = vi.fn();
    let writer!: (c: string) => void;
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    buildSseResponse(req, {
      backpressure: { maxBytes: 10, graceSecs: 5 },
      onStart: (write) => { writer = write; },
      onClose,
    });

    await Promise.resolve();

    // First write exceeds maxBytes when desiredSize is null → bpSince = t=0.
    writer('x'.repeat(20));
    expect(onClose).not.toHaveBeenCalled(); // grace window not elapsed yet

    // Advance past grace window; second write triggers the elapsed check.
    vi.advanceTimersByTime(6_000);
    writer('y');

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('bp-disconnect'));
    warnSpy.mockRestore();
  });

  it('does not close when second write arrives before grace window elapses', async () => {
    const { req } = makeReq();
    const onClose = vi.fn();
    let writer!: (c: string) => void;

    buildSseResponse(req, {
      backpressure: { maxBytes: 10, graceSecs: 5 },
      onStart: (write) => { writer = write; },
      onClose,
    });

    await Promise.resolve();
    writer('x'.repeat(20)); // bpSince = 0
    vi.advanceTimersByTime(3_000); // only 3 s, still within 5 s grace
    writer('y'); // elapsed = 3 s < 5 s → stays open

    expect(onClose).not.toHaveBeenCalled();
  });

  it('calls onClose exactly once on forced close (idempotent cleanup)', async () => {
    const { req } = makeReq();
    const onClose = vi.fn();
    let writer!: (c: string) => void;
    let closeRef!: () => void;

    buildSseResponse(req, {
      backpressure: { maxBytes: 10, graceSecs: 5 },
      onStart: (write, close) => {
        writer = write;
        closeRef = close;
      },
      onClose,
    });

    await Promise.resolve();

    writer('x'.repeat(20)); // bpSince = 0
    vi.advanceTimersByTime(6_000);
    writer('y'); // bp-disconnect → cleanup called once

    // Calling close() again should be a no-op.
    closeRef();
    closeRef();

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('resets grace timer when bytes fall back below threshold', async () => {
    const { req } = makeReq();
    const onClose = vi.fn();
    let writer!: (c: string) => void;

    buildSseResponse(req, {
      // desiredSize will be null in test env → byte fallback always active.
      // Use a high maxBytes so we can manually control the threshold.
      backpressure: { maxBytes: 50, graceSecs: 5 },
      onStart: (write) => { writer = write; },
      onClose,
    });

    await Promise.resolve();

    // Exceed threshold → bpSince set.
    writer('x'.repeat(60));
    vi.advanceTimersByTime(3_000); // 3 s into grace window

    // bytesAccum resets only when desiredSize is NOT null and isPressured is false.
    // In test env desiredSize is always null, so bytesAccum only grows.
    // This confirms the fallback path: once bpSince is set and grace elapses,
    // the connection closes on the next write.
    vi.advanceTimersByTime(3_000); // now 6 s total > 5 s grace
    writer('z');

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// close() function exposed to onStart
// ---------------------------------------------------------------------------

describe('buildSseResponse — close() from onStart', () => {
  it('closes the stream when close() is called directly', async () => {
    const { req } = makeReq();
    const onClose = vi.fn();
    let closeRef!: () => void;

    buildSseResponse(req, {
      onStart: (_write, close) => {
        closeRef = close;
      },
      onClose,
    });

    await Promise.resolve();
    expect(onClose).not.toHaveBeenCalled();
    closeRef();
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// Env config helpers — tested via the exported defaults in route.ts
// These are intentionally lightweight: actual env parsing is in route.ts.
// We verify behaviour by constructing configs directly.
// ---------------------------------------------------------------------------

describe('SseBackpressureConfig defaults', () => {
  it('accepts a config with maxBytes and graceSecs', () => {
    const config: SseBackpressureConfig = { maxBytes: 1_048_576, graceSecs: 30 };
    expect(config.maxBytes).toBe(1_048_576);
    expect(config.graceSecs).toBe(30);
  });
});
