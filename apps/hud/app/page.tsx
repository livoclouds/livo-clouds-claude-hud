import { CONTRACTS_PACKAGE } from '@livoclouds/contracts';

export default function Page() {
  return (
    <main className="min-h-screen p-8 font-mono">
      <h1 className="text-2xl">Claude Code HUD</h1>
      <p className="mt-2 text-sm opacity-70">
        Placeholder shell · workspace dep: <code>{CONTRACTS_PACKAGE}</code>
      </p>
    </main>
  );
}
