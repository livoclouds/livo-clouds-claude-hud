import { EMPTY_STATE } from '@/lib/store';
import { ConnectionBanner } from '../_components/ConnectionBanner';
import { HudProvider } from '../_components/live/HudProvider';
import { MascotDiagnostics } from '../_components/mascot/MascotDiagnostics';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// QA-only route. The mascot still reads from a HudProvider so the same
// component used in the Live View is exercised here unchanged. No SSE
// reconnect happens until the client mounts; no ingest is touched.
export default function MascotDiagnosticsPage() {
  return (
    <HudProvider initial={EMPTY_STATE}>
      <ConnectionBanner />
      <MascotDiagnostics />
    </HudProvider>
  );
}
