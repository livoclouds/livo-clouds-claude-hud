# Phase 5 — Hardening & Documentation

| | |
|---|---|
| **Severity** | Low |
| **Status** | ⏳ Pending |
| **PR** | — |
| **Estimated effort** | ~3 hours |
| **Risk of regression** | Low — documentation and build tooling only; contract change (O11, O12) is additive |

---

## Scope

Five findings about build hygiene, contract robustness, and missing
operational documentation.

| Finding | Summary |
|---|---|
| [O5](../findings/operational.md#o5--no-bundle-size-tracking-or-ci-gate) | CI bundle-size check; `@next/bundle-analyzer` |
| [O11](../findings/operational.md#o11--agentcolor-field-accepts-any-non-empty-string) | Tighten `agentColor` validation in contracts |
| [O12](../findings/operational.md#o12--ts-field-not-documented-as-milliseconds-no-minimum-epoch-bound) | Document `ts` as ms; add minimum epoch bound |
| [O13](../findings/operational.md#o13--no-troubleshooting-guide) | Create `TROUBLESHOOTING.md` |
| [O14](../findings/operational.md#o14--envexample-missing-several-documented-env-vars) | Complete `.env.example` with all env vars |

---

## Contract changes (O11, O12)

These are additive Zod refinements — they tighten validation but do not
change the TypeScript type for valid payloads.

**`packages/contracts/src/event.ts`:**

```ts
// Before
agentColor: z.string().min(1).optional(),
ts: z.number().int().nonnegative(),

// After
agentColor: z
  .string()
  .regex(/^(#[0-9a-fA-F]{3,8}|[a-z][a-z-]*)$/, 'agentColor must be a CSS named colour or hex code')
  .optional(),
ts: z
  .number()
  .int()
  // unix epoch milliseconds (Date.now()); minimum is 2021-01-01T00:00:00Z
  .min(1_609_459_200_000, 'ts must be unix epoch milliseconds, not seconds'),
```

These changes will cause `HudEventSchema.safeParse()` to return an error
for any hook that emits a CSS-invalid `agentColor` or a second-precision
`ts`. Hooks must be verified against the updated schema.

---

## Bundle size gate (O5)

Add `@next/bundle-analyzer` as a dev dependency in `apps/hud/package.json`.

Add a CI step in `.github/workflows/ci.yml` (or equivalent):

```yaml
- name: Check bundle size
  run: |
    pnpm --filter hud build
    node scripts/check-bundle-size.js
```

`scripts/check-bundle-size.js`:

```js
const { execSync } = require('child_process');
const { gzipSync } = require('zlib');
const { readdirSync, readFileSync } = require('fs');
const path = require('path');

const chunksDir = 'apps/hud/.next/static/chunks';
const MAX_CHUNK_KB = 150;
const MAX_TOTAL_KB = 250;

let totalBytes = 0;
let failed = false;

for (const file of readdirSync(chunksDir).filter(f => f.endsWith('.js'))) {
  const raw = readFileSync(path.join(chunksDir, file));
  const gz = gzipSync(raw).length;
  totalBytes += gz;
  if (gz > MAX_CHUNK_KB * 1024) {
    console.error(`FAIL: ${file} = ${(gz/1024).toFixed(1)} KB (limit ${MAX_CHUNK_KB} KB)`);
    failed = true;
  }
}

console.log(`Total client JS: ${(totalBytes/1024).toFixed(1)} KB gzipped`);
if (totalBytes > MAX_TOTAL_KB * 1024) {
  console.error(`FAIL: Total ${(totalBytes/1024).toFixed(1)} KB exceeds limit of ${MAX_TOTAL_KB} KB`);
  failed = true;
}

if (failed) process.exit(1);
```

---

## TROUBLESHOOTING.md content outline (O13)

Create `TROUBLESHOOTING.md` at the repo root with the following sections:

1. **Pollers not starting**
   - Check: `HUD_DISABLE_POLLER`, `HUD_DISABLE_TRANSCRIPT_POLLER` not set to `1`
   - Check: `~/.claude/sessions/` directory exists and is readable
   - Look for: `instrumentation: poller sessions failed` in server logs

2. **SSE client in rapid reconnect loop**
   - Check: bearer token in `Authorization` header matches `HUD_INGEST_TOKEN`
   - Check: HUD server is running on the expected port
   - Look for: `bp-disconnect` events in DevTools EventStream (backpressure ejection)
   - Look for: `401` or `403` responses in DevTools Network tab

3. **Sessions list empty despite active Claude Code session**
   - Check: `HUD_SESSIONS_DIR` (if set) points to the correct directory
   - Check: poller log file `logs/poller-sessions.log` for parse errors
   - Check: Claude Code is actually running hooks (verify `~/.claude/settings.json`)

4. **HUD stops updating events**
   - Check: SSE stream in DevTools → Network → EventStream is still open
   - Check: `POST /api/events` is returning 2xx (not 503 if server is draining)
   - Restart HUD if the bus appears stale

5. **Disk space alert**
   - JSONL logs are in `data/events-*.jsonl`
   - Adjust `HUD_LOG_MAX_SIZE_MB` and `HUD_LOG_RETENTION_DAYS`
   - Manual cleanup: `rm data/events-*.jsonl.{1,2,3}`

6. **High memory usage**
   - Check `/api/health` for `rss` (RSS in bytes) and `subscribers` count
   - A subscriber count > 50 with `rss` growing monotonically indicates a
     zombie subscriber leak — check for clients that are connected but not
     reading (e.g., locked iPad)

---

## Files changed

_(To be filled in after implementation.)_

Key files expected to change:
- `packages/contracts/src/event.ts` — O11, O12
- `apps/hud/package.json` — add `@next/bundle-analyzer`
- `scripts/check-bundle-size.js` (new)
- `.github/workflows/ci.yml` (or equivalent) — bundle size step
- `TROUBLESHOOTING.md` (new, repo root)
- `apps/hud/.env.example` — O14
- `CLAUDE.md §11` — document bundle size target

---

## Test plan

```
pnpm -w typecheck
pnpm -w lint
pnpm -w build
pnpm -w test
```

**Contract changes (O11, O12):**
```bash
# Confirm valid payloads still pass
node -e "
const { HudEventSchema } = require('./packages/contracts/dist');
const r = HudEventSchema.safeParse({
  type: 'session.start', sessionId: 'x', ts: Date.now(),
  agentColor: '#cc785c'
});
console.assert(r.success, 'valid payload should pass');
"

# Confirm invalid agentColor is rejected
node -e "
const { HudEventSchema } = require('./packages/contracts/dist');
const r = HudEventSchema.safeParse({
  type: 'session.start', sessionId: 'x', ts: Date.now(),
  agentColor: 'not-a-color-123'
});
console.assert(!r.success, 'invalid agentColor should fail');
"

# Confirm second-precision ts is rejected
node -e "
const { HudEventSchema } = require('./packages/contracts/dist');
const r = HudEventSchema.safeParse({
  type: 'session.start', sessionId: 'x', ts: 1716508800
});
console.assert(!r.success, 'second-precision ts should fail');
"
```

**Bundle size:**
```bash
pnpm --filter hud build && node scripts/check-bundle-size.js
# Expected: no FAIL lines; total < 250 KB
```

---

## Before / after metrics

| Metric | Before | After | Target |
|---|---|---|---|
| Invalid `agentColor` values caught at ingest | 0% | 100% | 100% |
| Second-precision `ts` caught at ingest | 0% | 100% | 100% |
| Bundle size tracked in CI | No | Yes | Yes |
| `.env.example` completeness | ~60% | 100% | 100% |
| Troubleshooting guide exists | No | Yes | Yes |

---

## Status updates

- **2026-05-24** — Phase scoped, awaiting implementation.

## What was deferred

_(To be filled in after implementation.)_
