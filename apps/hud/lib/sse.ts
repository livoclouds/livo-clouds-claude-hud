export const HEARTBEAT_INTERVAL_MS = 15_000;

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

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const bp = handlers.backpressure;
      let bpSince: number | null = null;
      let bytesAccum = 0; // fallback byte counter when desiredSize is null

      const cleanup = () => {
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
            } else if (!isPressured) {
              // Consumer is draining — reset the byte fallback counter.
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
      if (closed) return;
      closed = true;
      try {
        handlers.onClose?.();
      } catch {
        // ignore
      }
    },
  });

  return new Response(stream, { status: 200, headers: SSE_HEADERS });
}
