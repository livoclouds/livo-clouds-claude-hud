import { timingSafeEqual } from 'node:crypto';
import { HudEventSchema } from '@livoclouds/contracts';
import { bus } from '@/lib/bus';
import { appendEvent } from '@/lib/log';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

let warnedMissingToken = false;

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

function checkBearer(req: Request): boolean {
  const expected = process.env.HUD_INGEST_TOKEN;
  if (!expected) {
    if (!warnedMissingToken) {
      warnedMissingToken = true;
      console.warn(
        'events: HUD_INGEST_TOKEN is not set — all ingest requests will be rejected with 401. Run `pnpm hud:token`.',
      );
    }
    return false;
  }
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

export async function POST(req: Request): Promise<Response> {
  if (!checkBearer(req)) {
    return jsonResponse(401, { error: 'unauthorized' });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonResponse(400, { error: 'invalid_json' });
  }

  const result = HudEventSchema.safeParse(body);
  if (!result.success) {
    return jsonResponse(400, {
      error: 'invalid_event',
      issues: result.error.issues.map((i) => ({
        path: i.path,
        message: i.message,
        code: i.code,
      })),
    });
  }

  const envelope = bus.publish(result.data);
  await appendEvent(envelope);

  return new Response(null, { status: 204 });
}
