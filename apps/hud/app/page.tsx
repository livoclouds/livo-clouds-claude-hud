import { LiveView } from './_components/live/LiveView';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export default function Page() {
  return <LiveView />;
}
