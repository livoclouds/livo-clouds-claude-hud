import { bus } from '@/lib/bus';
import { diskUsageMb } from '@/lib/log';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  const now = Date.now();
  const lastPublish = bus.lastPublishMs();

  const body = {
    status: 'ok',
    uptime: Math.floor(process.uptime()),
    rss: process.memoryUsage().rss,
    subscribers: bus.subscriberCount(),
    eventsTotal: bus.publishCount(),
    lastEventAgo: lastPublish === 0 ? null : now - lastPublish,
    diskMb: await diskUsageMb(),
  };

  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}
