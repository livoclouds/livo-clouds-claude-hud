import { bus } from '@/lib/bus';
import { reduceAll } from '@/lib/store';
import { ConnectionBanner } from './_components/ConnectionBanner';
import { HudProvider } from './_components/live/HudProvider';
import { LiveView } from './_components/live/LiveView';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export default function Page() {
  const initial = reduceAll(bus.snapshot());

  return (
    <HudProvider initial={initial}>
      <ConnectionBanner />
      <LiveView />
    </HudProvider>
  );
}
