import { MascotDiagnostics } from '../_components/mascot/MascotDiagnostics';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// QA surface for the mascot state machine. The root layout owns the
// HudProvider, so this page just renders the diagnostics shell — the mascot
// itself reads from the shared store and reacts to live events when present.
export default function MascotDiagnosticsPage() {
  return <MascotDiagnostics />;
}
