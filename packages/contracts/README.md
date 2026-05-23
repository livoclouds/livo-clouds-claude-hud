# @livoclouds/contracts

The Claude Code HUD's **single source of truth** for the shape of every event
that crosses the wire between Claude Code (the source) and the HUD (the
observer).

Everything is one Zod discriminated union, `HudEventSchema`, plus the inferred
TypeScript types. Any ingest route, hook script, or UI component that touches
events must go through this schema — no ad-hoc shapes outside this package.

## Install

This is a workspace-private package, consumed via pnpm workspace protocol:

```jsonc
// apps/hud/package.json
{
  "dependencies": {
    "@livoclouds/contracts": "workspace:*"
  }
}
```

## Usage

```ts
import { HudEventSchema, type HudEvent } from '@livoclouds/contracts';

const result = HudEventSchema.safeParse(payload);
if (!result.success) {
  // result.error.issues carries the precise JSON path of each failure
  throw new Error(`Invalid HUD event: ${result.error.message}`);
}

const event: HudEvent = result.data;

// Narrowing by discriminator
switch (event.type) {
  case 'tool.use':
    console.log(event.tool, event.toolInput);
    break;
  case 'turn.stop':
    console.log(event.tokens?.out, event.contextPct);
    break;
}
```

## Event variants

All variants share `sessionId` (string), `ts` (unix epoch ms, integer), and
optional `cwd` / `model`. Per-variant fields:

| `type`           | Extra fields                                                                  |
| ---------------- | ----------------------------------------------------------------------------- |
| `session.start`  | _(base only)_                                                                 |
| `session.end`    | `tokens?`, `costUsd?`, `durationMs?`                                          |
| `prompt.submit`  | _(base only)_                                                                 |
| `tool.use`       | `tool` (required), `toolInput?`, `durationMs?`                                |
| `turn.stop`      | `tokens?`, `costUsd?`, `contextPct?` (0–100), `durationMs?`                   |
| `compact.start`  | _(base only)_                                                                 |
| `compact.end`    | `durationMs?`                                                                 |
| `error`          | `tool?`, `message?`                                                           |

Numeric units:

- `tokens.in`, `tokens.out`, `tokens.cached` — non-negative integers.
- `costUsd` — non-negative float, full precision.
- `contextPct` — float in `[0, 100]`.
- `durationMs`, `ts` — non-negative integers.

## Strictness

Every variant is `.strict()`. Extra fields fail validation with an
`unrecognized_keys` issue. This is intentional — it forces ingest-side
normalization (Phase 3) to map external payloads into the HUD's vocabulary
rather than leaking unmodeled fields into UI state.

## Testing

```sh
pnpm --filter @livoclouds/contracts test
```

Fixtures live under `tests/fixtures/`, one JSON file per positive case. Negative
cases live inline in `tests/event.spec.ts` and assert the exact Zod error path.

## Versioning

This package follows the lifecycle defined in the HUD's
[Phase 2 — Event Contract](../../docs/v1/phases/phase-2-event-contract.md)
document. Breaking changes to the schema must update that file's Change Log and
the consuming phases (3, 4, 5).
