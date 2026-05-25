// Bundle size gate for CI.
//
// Walks apps/hud/.next/static/chunks/, gzips every .js file in memory, and
// fails if any single chunk exceeds MAX_CHUNK_KB or the total exceeds
// MAX_TOTAL_KB. Run after `pnpm --filter hud build`.
//
// Usage:
//   node scripts/check-bundle-size.js
//
// Exit 0 = within budget. Exit 1 = over budget (details printed to stderr).

import { gzipSync } from 'node:zlib';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const CHUNKS_DIR = 'apps/hud/.next/static/chunks';
const MAX_CHUNK_KB = 150;
// Current measured baseline is ~396 KB (post Phases 1-4; Framer Motion, recharts,
// @tanstack/react-virtual). The ideal target is 250 KB — tracked as a deferred
// finding in docs/audits/v2/phases/phase-5-hardening.md. This gate prevents
// further regressions while the optimisation work is scheduled.
const MAX_TOTAL_KB = 500;

let files;
try {
  files = readdirSync(CHUNKS_DIR).filter((f) => f.endsWith('.js'));
} catch (err) {
  console.error(`check-bundle-size: cannot read ${CHUNKS_DIR}: ${err.message}`);
  console.error('Run `pnpm --filter hud build` before this script.');
  process.exit(1);
}

const chunks = files
  .map((file) => {
    const raw = readFileSync(join(CHUNKS_DIR, file));
    const gzBytes = gzipSync(raw).length;
    return { file, gzBytes };
  })
  .sort((a, b) => b.gzBytes - a.gzBytes);

let failed = false;
const totalBytes = chunks.reduce((sum, c) => sum + c.gzBytes, 0);

// Print top chunks (largest first, up to 10 rows).
const top = chunks.slice(0, 10);
const maxNameLen = Math.max(...top.map((c) => c.file.length), 'chunk'.length);
console.log(`\nBundle size report — ${files.length} chunks`);
console.log(`${'chunk'.padEnd(maxNameLen)}  gzipped`);
console.log(`${'-'.repeat(maxNameLen)}  --------`);
for (const { file, gzBytes } of top) {
  const kb = (gzBytes / 1024).toFixed(1);
  const over = gzBytes > MAX_CHUNK_KB * 1024 ? ' ← EXCEEDS LIMIT' : '';
  console.log(`${file.padEnd(maxNameLen)}  ${kb} KB${over}`);
}
if (chunks.length > 10) {
  console.log(`  … and ${chunks.length - 10} more`);
}

console.log(`\nTotal: ${(totalBytes / 1024).toFixed(1)} KB gzipped (limit ${MAX_TOTAL_KB} KB)`);

// Enforce per-chunk limit.
for (const { file, gzBytes } of chunks) {
  if (gzBytes > MAX_CHUNK_KB * 1024) {
    console.error(
      `FAIL: ${file} is ${(gzBytes / 1024).toFixed(1)} KB gzipped (limit ${MAX_CHUNK_KB} KB)`,
    );
    failed = true;
  }
}

// Enforce total limit.
if (totalBytes > MAX_TOTAL_KB * 1024) {
  console.error(
    `FAIL: total client JS is ${(totalBytes / 1024).toFixed(1)} KB gzipped (limit ${MAX_TOTAL_KB} KB)`,
  );
  failed = true;
}

if (failed) {
  console.error(
    '\nBundle budget exceeded. See CLAUDE.md §11 for targets and TROUBLESHOOTING.md for guidance.',
  );
  process.exit(1);
}

console.log('Bundle budget OK.');
