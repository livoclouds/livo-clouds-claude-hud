import { bus, type BusEnvelope } from '@/lib/bus';
import { HEARTBEAT_INTERVAL_MS, buildSseResponse, formatComment, formatFrame } from '@/lib/sse';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function frameFor(envelope: BusEnvelope): string {
  return formatFrame({ id: envelope.id, data: envelope.event });
}

export function GET(req: Request): Response {
  const lastEventId = req.headers.get('last-event-id');
  let heartbeat: ReturnType<typeof setInterval> | null = null;
  let unsubscribe: (() => void) | null = null;

  return buildSseResponse(req, {
    onStart: (write) => {
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

      unsubscribe = bus.subscribe((env) => {
        write(frameFor(env));
      });

      heartbeat = setInterval(() => {
        write(formatComment('ping'));
      }, HEARTBEAT_INTERVAL_MS);
    },
    onClose: () => {
      if (heartbeat) clearInterval(heartbeat);
      if (unsubscribe) unsubscribe();
      heartbeat = null;
      unsubscribe = null;
    },
  });
}
