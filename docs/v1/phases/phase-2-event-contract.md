# Phase 2 — Event Contract

| Field | Value |
|---|---|
| Phase ID | `phase-2` |
| Status | ⚪ Not Started |
| Depends on | `phase-1` |
| Blocks | `phase-3`, `phase-4` |
| Target outcome | `@livoclouds/contracts` exports a Zod-validated `HudEventSchema` covering every Claude Code hook the HUD will consume |

---

## Overview

Define the **single source of truth** for every event the HUD ingests, in both
runtime (Zod) and compile-time (inferred TypeScript) form. Until this exists,
ingest, hooks, and UI cannot agree on shape.

## Goals

- Enumerate the Claude Code hooks the HUD will subscribe to.
- Author `HudEventSchema` covering all of them, plus error and meta variants.
- Export discriminated-union TypeScript types via `z.infer`.
- Cover the schema with Vitest unit tests using real-shaped fixtures.

## In Scope

- `packages/contracts/src/event.ts` — the schema and its inferred types.
- `packages/contracts/src/index.ts` — public exports.
- `packages/contracts/tests/event.spec.ts` — Vitest suite.
- `packages/contracts/README.md` — short usage doc with examples.
- Fixtures directory `packages/contracts/tests/fixtures/` with anonymized
  real-shape payloads for each event variant.

## Out of Scope

- The ingest route handler itself — Phase 3.
- The hook script that produces these payloads — Phase 4.
- OTel ingest — deferred to a sub-task within Phase 3 once core SSE works.

## Open Decisions

### D-2.1 — Hook set covered in v1

**Default proposal**:

| Claude Code hook | HUD event `type` | Why we want it |
|---|---|---|
| `SessionStart` | `session.start` | Show "active session" card |
| `SessionEnd` | `session.end` | Close session, freeze totals |
| `UserPromptSubmit` | `prompt.submit` | Trigger mascot `listening` |
| `PostToolUse` | `tool.use` | Trigger mascot `editing` / `running` |
| `Stop` | `turn.stop` | Trigger mascot `succeeded` / `errored` |
| `PreCompact` | `compact.start` | Trigger mascot `compacting` |
| `Notification` | `error` (when blocked) | Trigger mascot `errored` |

Other hooks (e.g. `PreToolUse`, `SubagentStop`) are recorded for awareness but
not subscribed in v1. Document why in the phase change-log.

### D-2.2 — Numeric units

**Default proposal**:

- `tokens.in`, `tokens.out`, `tokens.cached` → integers, raw token counts.
- `costUsd` → number with two-decimal display, full precision in storage.
- `contextPct` → integer 0–100.
- `durationMs` → integer.

## Deliverables

```
packages/contracts/
├── package.json
├── tsconfig.json
├── README.md
├── src/
│   ├── event.ts         # HudEventSchema + types
│   └── index.ts         # public exports
└── tests/
    ├── event.spec.ts
    └── fixtures/
        ├── session-start.json
        ├── prompt-submit.json
        ├── tool-use-edit.json
        ├── tool-use-bash.json
        ├── turn-stop-ok.json
        ├── turn-stop-error.json
        ├── compact-start.json
        ├── compact-end.json
        └── error.json
```

## Acceptance Criteria

- Every fixture parses successfully with `HudEventSchema.parse(...)`.
- A handful of malformed fixtures (extra fields, missing `ts`, wrong `type`)
  are rejected with a precise error path.
- `pnpm --filter @livoclouds/contracts test` passes.
- `apps/hud` can import the type and the schema without bundler errors.

## Tasks

1. List each hook in [CLAUDE.md §7](../../../CLAUDE.md) and confirm the proposed
   mapping in D-2.1.
2. Implement the schema with discriminated union on `type`.
3. Author fixtures from real Claude Code hook payloads (anonymize CWDs, model
   IDs, and any user-identifying strings).
4. Write Vitest cases: positive parse, negative parse, type-inference smoke
   test.
5. Document the schema in `packages/contracts/README.md`.
6. PR titled `feat(contracts): HudEventSchema and tests (Phase 2)`.

## Risks

- **Claude Code hook shape changes** between minor releases. Mitigation: keep
  fixtures small, mark them with the CC version they were captured under.
- **Field-name drift** between hook payload and our internal model. Mitigation:
  normalize in the ingest route (Phase 3), keep `HudEventSchema` HUD-facing only.

## Related

- [`../../CLAUDE.md §8`](../../../CLAUDE.md) — proposed schema sketch.
- [`./phase-3-backend.md`](./phase-3-backend.md) — first consumer of the schema.
- [`./phase-4-hook-script.md`](./phase-4-hook-script.md) — first producer of the schema.
