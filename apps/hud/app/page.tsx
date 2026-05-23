import { HudEventSchema, type HudEvent } from '@livoclouds/contracts';

export default function Page() {
  const eventCount = HudEventSchema.options.length;
  const sample: HudEvent = {
    type: 'session.start',
    sessionId: 'placeholder',
    ts: 0,
  };

  return (
    <main className="min-h-screen p-8 font-mono">
      <h1 className="text-2xl">Claude Code HUD</h1>
      <p className="mt-2 text-sm opacity-70">
        Placeholder shell · {eventCount} event variants registered · sample type:{' '}
        <code>{sample.type}</code>
      </p>
    </main>
  );
}
