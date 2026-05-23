# Phase 1 — Scaffold

| Field | Value |
|---|---|
| Phase ID | `phase-1` |
| Status | 🟢 Complete |
| Depends on | `phase-0` |
| Blocks | `phase-2` |
| Target outcome | `pnpm install && pnpm dev` renders an empty Next.js HUD shell at `http://localhost:3000` |

---

## Overview

Stand up the monorepo, the Next.js application, and the contracts package. The
deliverable is **a structurally complete repo with no functionality** — the
foundation that every subsequent phase builds on.

## Goals

- Initialize a pnpm workspace.
- Create `apps/hud` (Next.js 16, App Router, TypeScript strict, Tailwind 4,
  ESLint flat config, Prettier).
- Create `packages/contracts` (empty package, ready for Zod schemas).
- Add the `hooks/claude-hook.sh` placeholder (no logic yet).
- Configure shared base `tsconfig.json` and ESLint config.
- Verify `pnpm dev` starts the app and renders a placeholder page.

## In Scope

- `pnpm-workspace.yaml`, root `package.json`, `tsconfig.base.json`.
- `apps/hud/` with App Router, Tailwind 4 CSS-first config, dark/light scaffold,
  one placeholder route (`/`).
- `packages/contracts/` with its own `package.json` and `tsconfig.json` extending
  the base.
- ESLint flat config + Prettier at the root, applied via workspaces.
- An empty `hooks/claude-hook.sh` with `#!/usr/bin/env bash` and the file header.
- A `README.md` section in the placeholder app explaining `pnpm dev`.

## Out of Scope

- The `HudEventSchema` itself — that is Phase 2.
- Any API routes (`/api/events`, `/api/stream`) — Phase 3.
- Any hook payload handling — Phase 4.
- Real UI — Phase 5.
- The mascot — Phase 6.

## Open Decisions

None at this phase. All four open questions resolved in Phase 0 feed straight
into the scaffold:

- Package manager → `pnpm` (D-0.3).
- Local port → `3000` (D-0.4).

If D-0.4 was overridden, this phase honors that override.

## Deliverables

```
livo-clouds-claude-hud/
├── package.json                # workspace root, scripts: dev, build, lint
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── eslint.config.mjs
├── .prettierrc.json
├── apps/
│   └── hud/
│       ├── package.json
│       ├── next.config.ts
│       ├── tsconfig.json
│       ├── postcss.config.mjs
│       ├── app/
│       │   ├── layout.tsx
│       │   ├── page.tsx          # placeholder
│       │   └── globals.css       # Tailwind 4 @theme
│       └── public/
├── packages/
│   └── contracts/
│       ├── package.json
│       └── tsconfig.json
└── hooks/
    └── claude-hook.sh            # stub
```

## Acceptance Criteria

- `pnpm install` succeeds with no warnings beyond Next.js's defaults.
- `pnpm dev` starts the HUD at `http://localhost:3000`, the placeholder route
  renders, and HMR works on a saved edit to `apps/hud/app/page.tsx`.
- `pnpm lint` succeeds with zero errors.
- `pnpm typecheck` succeeds (`tsc --noEmit`) with zero errors.
- `apps/hud` imports a value from `@livoclouds/contracts` and the build resolves it.

## Tasks

1. `pnpm init` at root; add `private: true` and `packageManager` field.
2. Create `pnpm-workspace.yaml` listing `apps/*` and `packages/*`.
3. Add `tsconfig.base.json` with strict TS settings.
4. Scaffold `apps/hud` (`pnpm create next-app@latest --ts --tailwind --eslint`),
   align it to the workspace.
5. Configure Tailwind 4 via `@theme {}` CSS-first.
6. Scaffold `packages/contracts` with a trivial exported placeholder.
7. Wire `@livoclouds/contracts` into `apps/hud` as a workspace dep.
8. Add root scripts: `dev`, `build`, `lint`, `typecheck`, `format`.
9. Create `hooks/claude-hook.sh` stub with executable bit.
10. Smoke-test all acceptance criteria.
11. PR titled `chore: scaffold monorepo (Phase 1)`.

## Risks

- **Next.js 16 + React 19 release surface**: minor surprises in dependency
  resolution. Mitigation: pin patch versions and document.
- **Tailwind 4 still rolling out**: some plugins lag. Mitigation: stay on the
  core feature set; defer plugin adoption until Phase 7.
- **Workspace ergonomics**: pnpm needs `"workspace:*"` references. Mitigation:
  document in the root README.

## Related

- [`./phase-0-design-decisions.md`](./phase-0-design-decisions.md) — provides D-0.3, D-0.4.
- [`./phase-2-event-contract.md`](./phase-2-event-contract.md) — first consumer of `packages/contracts`.
- [`../architecture.md`](../architecture.md) — overall topology.

## Change Log

- **2026-05-23** — Scaffold landed. `pnpm install`, `pnpm typecheck`, `pnpm -r run lint`, and `pnpm --filter @livoclouds/hud build` all succeed. Next.js was pinned to `^16.0.0` (current major), React `^19.1.0`, Tailwind `^4.0.0`. ESLint uses a flat config with `typescript-eslint` recommended rules (no Next.js plugin pulled in at the root because `next lint` is deprecated in 16; the placeholder page is linted via the same flat config). `packages/contracts` was created with a Vitest skeleton; the Zod schema itself lands in Phase 2.
