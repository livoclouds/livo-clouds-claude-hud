# Quality Gates Reference

This file documents the three quality gates run in Step 1.5. Each gate must pass before the next runs. A failure in any gate blocks the commit.

---

## Gate 1 — Typecheck

**Command:**
```bash
pnpm -w typecheck
```

**What it checks:** TypeScript strict-mode compilation across all packages in the pnpm workspace. The `-w` flag runs from the workspace root and propagates to all packages.

**Critical path:** `packages/contracts/src/event.ts` — the shared Zod event schema (CLAUDE.md §8). A type error here means the hook, API, and UI are out of sync.

**On failure:**
- Report the failing package name (from the pnpm output header)
- Print the first TypeScript error block verbatim
- Stop — do not run lint or build

**Fallback:** If `pnpm -w typecheck` is not available: `pnpm -r exec tsc --noEmit`

---

## Gate 2 — Lint

**Command:**
```bash
pnpm -w lint
```

**What it checks:** ESLint rules across all packages. Catches:
- Unused variables and imports
- React hook violations (`react-hooks/rules-of-hooks`, `react-hooks/exhaustive-deps`)
- Import order violations
- Common logic errors (no-fallthrough, no-undef)

**On failure:**
- Report the file(s) and rule(s) that failed
- Print the first lint error block verbatim
- Stop — do not run build

**Fallback:** If `pnpm -w lint` is not available: `pnpm -r exec eslint .`

---

## Gate 3 — Build

**Command:**
```bash
pnpm -w build
```

**What it checks:** Full Next.js production build for `apps/hud`. Catches:
- Dynamic import resolution failures
- Missing environment variables referenced in code
- Route configuration errors
- Static generation failures

**On failure:**
- Report the build error type (compile error, route error, or env error)
- Print the first error block verbatim
- Stop

**Fallback:** If `pnpm -w build` is not available: `pnpm --filter hud build`

---

## Reporting Passed Gates

When all three gates pass, report:

```
✅ Quality gate — typecheck passed
✅ Quality gate — lint passed
✅ Quality gate — build passed
```

Then proceed to Step 2.
