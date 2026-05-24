// Next.js 16 instrumentation entry. Kept deliberately thin: a runtime gate
// plus a dynamic import of the Node-only implementation. By keeping the
// node-only modules (`node:child_process`, `node:fs`, `node:path`) out of
// the top-level imports, Next's Edge bundler does not analyze them when it
// compiles this file under the edge runtime, and the dev-time warnings
// about "Node.js API used in the Edge Runtime" go away.
//
// The actual logic lives in `./instrumentation-node.ts`.

export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  if (process.env.NEXT_PHASE === 'phase-production-build') return;
  await import('./instrumentation-node');
}
