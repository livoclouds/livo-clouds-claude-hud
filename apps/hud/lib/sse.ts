export const HEARTBEAT_INTERVAL_MS = 15_000;

let _bpEjections = 0;

/** Total number of SSE connections closed due to sustained backpressure since process start. */
export function bpEjectionCount(): number {
  return _bpEjections;
}

export type SseFrame = {
  id?: string;
  event?: string;
  data: unknown;
};

export function formatFrame({ id, event, data }: SseFrame): string {
  let out = '';
  if (id !== undefined) out += `id: ${id}\n`;
  if (event !== undefined) out += `event: ${event}\n`;
  out += `data: ${typeof data === 'string' ? data : JSON.stringify(data)}\n\n`;
  return out;
}

export function formatComment(text: string): string {
  return `: ${text}\n\n`;
}

export const SSE_HEADERS = {
  'Content-Type': 'text/event-stream; charset=utf-8',
  'Cache-Control': 'no-cache, no-transform',
  Connection: 'keep-alive',
  'X-Accel-Buffering': 'no',
} as const;

type Writer = (chunk: string) => void;

/** Backpressure thresholds for an SSE writer. */
export type SseBackpressureConfig = {
  /** Maximum bytes the queue may accumulate before the grace timer starts. Default: 1 MB. */
  maxBytes: number;
  /** Seconds of sustained backpressure before the connection is closed. Default: 30. */
  graceSecs: number;
};

export type SseHandlers = {
  /**
   * Called once when the stream is ready. Receives `write` to send frames and
   * `close` to force-close the stream from outside (e.g., when the bus
   * zombie-prunes this subscriber).
   */
  onStart: (writer: Writer, close: () => void) => void | Promise<void>;
  onClose?: () => void;
  backpressure?: SseBackpressureConfig;
};

export function buildSseResponse(req: Request, handlers: SseHandlers): Response {
  const encoder = new TextEncoder();
  let closed = false;

  // Hoisted so cancel() can delegate to it (I9). Starts as a minimal
  // implementation; reassigned inside start() once the controller is
  // available to also close the readable stream.
  let cleanup: () => void = () => {
    if (closed) return;
    closed = true;
    try {
      handlers.onClose?.();
    } catch {
      // ignore
    }
  };

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const bp = handlers.backpressure;
      let bpSince: number | null = null;
      let bytesAccum = 0; // fallback byte counter when desiredSize is null

      // Override with the full implementation that also closes the controller.
      cleanup = () => {
        if (closed) return;
        closed = true;
        try {
          handlers.onClose?.();
        } catch {
          // ignore
        }
        try {
          controller.close();
        } catch {
          // ignore
        }
      };

      const bpDisconnect = () => {
        _bpEjections += 1;
        console.warn('sse: bp-disconnect — slow consumer exceeded grace window, closing connection');
        try {
          controller.enqueue(
            encoder.encode(
              formatFrame({ event: 'bp-disconnect', data: { reason: 'slow-consumer' } }),
            ),
          );
        } catch {
          // best-effort: if the queue is saturated the frame may not reach the client
        }
        cleanup();
      };

      const write: Writer = (chunk) => {
        if (closed) return;
        try {
          const encoded = encoder.encode(chunk);
          controller.enqueue(encoded);

          if (bp) {
            const desired = controller.desiredSize;
            const isPressured =
              desired !== null ? desired <= 0 : bytesAccum > bp.maxBytes;

            if (desired === null) {
              bytesAccum += encoded.byteLength;
            } else {
              // desiredSize is available — reset the fallback byte counter
              // regardless of pressure state so it starts fresh if desiredSize
              // later becomes null again (I8).
              bytesAccum = 0;
            }

            if (isPressured) {
              if (bpSince === null) {
                bpSince = Date.now();
              } else if (Date.now() - bpSince > bp.graceSecs * 1000) {
                bpDisconnect();
              }
            } else {
              bpSince = null;
            }
          }
        } catch {
          // controller.enqueue threw — stream closed externally. Run full cleanup
          // so the heartbeat interval and bus subscription are also cleared.
          cleanup();
        }
      };

      req.signal.addEventListener('abort', cleanup, { once: true });

      try {
        await handlers.onStart(write, cleanup);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'unknown';
        console.error(`sse: onStart threw (${message})`);
        cleanup();
      }
    },
    cancel() {
      // Delegate to the shared cleanup so any future additions to it are
      // automatically applied here too (I9). controller.close() throws during
      // cancel but is caught inside cleanup().
      cleanup();
    },
  });

  return new Response(stream, { status: 200, headers: SSE_HEADERS });
}
