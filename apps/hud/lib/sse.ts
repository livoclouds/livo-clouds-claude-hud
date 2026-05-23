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

export type SseHandlers = {
  onStart: (writer: Writer) => void | Promise<void>;
  onClose?: () => void;
};

export function buildSseResponse(req: Request, handlers: SseHandlers): Response {
  const encoder = new TextEncoder();
  let closed = false;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const write: Writer = (chunk) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          closed = true;
        }
      };

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

      req.signal.addEventListener('abort', cleanup, { once: true });

      try {
        await handlers.onStart(write);
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
