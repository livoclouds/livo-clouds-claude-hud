import { timingSafeEqual } from 'node:crypto';
import { bus } from '@/lib/bus';
import { getAllPollerStatuses, isDraining, isReady, getReadyAt } from '@/lib/lifecycle';
import { diskUsageMb } from '@/lib/log';
import { bpEjectionCount } from '@/lib/sse';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

function checkBearer(req: Request): boolean {
  const expected = process.env.HUD_INGEST_TOKEN;
  if (!expected) return false;
  const header = req.headers.get('authorization');
  if (!header || !header.startsWith('Bearer ')) return false;
  const presented = header.slice('Bearer '.length).trim();
  if (presented.length === 0 || presented.length !== expected.length) return false;
  const a = Buffer.from(presented, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  try {
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export async function GET(req: Request): Promise<Response> {
  if (!checkBearer(req)) {
    return jsonResponse(401, { error: 'unauthorized' });
  }

  const now = Date.now();
  const lastPublish = bus.lastPublishMs();
  const mem = process.memoryUsage();

  const body = {
    status: 'ok',
    uptime: Math.floor(process.uptime()),
    rss: mem.rss,
    heapUsed: mem.heapUsed,
    heapTotal: mem.heapTotal,
    external: mem.external,
    subscribers: bus.subscriberCount(),
    eventsTotal: bus.publishCount(),
    lastEventAgo: lastPublish === 0 ? null : now - lastPublish,
    diskMb: await diskUsageMb(),
    bus: {
      capacity: bus.capacity(),
      fillRatio: bus.fillRatio(),
    },
    sse: {
      bpEjections: bpEjectionCount(),
    },
    lifecycle: {
      draining: isDraining(),
      ready: isReady(),
      readyAt: getReadyAt(),
    },
    pollers: getAllPollerStatuses(),
  };

  return jsonResponse(200, body);
}
