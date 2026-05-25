import { bus, type BusEnvelope } from '@/lib/bus';
import { lifecycleEmitter } from '@/lib/lifecycle';
import {
  HEARTBEAT_INTERVAL_MS,
  buildSseResponse,
  formatComment,
  formatFrame,
  type SseBackpressureConfig,
} from '@/lib/sse';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DEFAULT_BP_BYTES = 1_048_576; // 1 MB
const DEFAULT_BP_GRACE_S = 30;

function readBpBytes(): number {
  const raw = process.env.HUD_SSE_BACKPRESSURE_BYTES;
  if (!raw) return DEFAULT_BP_BYTES;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_BP_BYTES;
}

function readBpGraceS(): number {
  const raw = process.env.HUD_SSE_BACKPRESSURE_GRACE_S;
  if (!raw) return DEFAULT_BP_GRACE_S;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_BP_GRACE_S;
}

const BP_CONFIG: SseBackpressureConfig = {
  maxBytes: readBpBytes(),
  graceSecs: readBpGraceS(),
};

function frameFor(envelope: BusEnvelope): string {
  return formatFrame({ id: envelope.id, data: envelope.event });
}

export function GET(req: Request): Response {
  const lastEventId = req.headers.get('last-event-id');
  let heartbeat: ReturnType<typeof setInterval> | null = null;
  let unsubscribe: (() => void) | null = null;
  let onShutdown: (() => void) | null = null;

  return buildSseResponse(req, {
    backpressure: BP_CONFIG,
    onStart: (write, close) => {
      write(formatComment('connected'));

      const replay = bus.replaySince(lastEventId);
      if (replay.truncated) {
        write(
          formatFrame({
            event: 'stream-replay-truncated',
            data: { busCapacity: bus.capacity() },
          }),
        );
      }
      for (const env of replay.envelopes) {
        write(frameFor(env));
      }

      try {
        unsubscribe = bus.subscribe(
          (env) => {
            write(frameFor(env));
          },
          { onForced: close },
        );
        heartbeat = setInterval(() => {
          write(formatComment('ping'));
        }, HEARTBEAT_INTERVAL_MS);

        // Notify this client before the server closes the connection.
        onShutdown = () => {
          write(formatFrame({ event: 'shutdown', data: { reason: 'server-restart' } }));
          close();
        };
        lifecycleEmitter.once('shutdown', onShutdown);
      } catch (err) {
        // Guard against unexpected errors after subscribe() succeeds but before
        // we return — ensure the subscriber is not leaked (I2).
        if (unsubscribe) { unsubscribe(); unsubscribe = null; }
        if (onShutdown) { lifecycleEmitter.removeListener('shutdown', onShutdown); onShutdown = null; }
        throw err;
      }
    },
    onClose: () => {
      if (heartbeat) clearInterval(heartbeat);
      if (unsubscribe) unsubscribe();
      if (onShutdown) lifecycleEmitter.removeListener('shutdown', onShutdown);
      heartbeat = null;
      unsubscribe = null;
      onShutdown = null;
    },
  });
}
