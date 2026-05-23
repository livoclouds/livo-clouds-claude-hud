# Security Policy

The Claude Code HUD is a real-time observer for Claude Code sessions. It
ingests, persists, and renders data about an AI coding session — none of which
is intended to leave the operator's LAN. This document describes the threat
model, the operational guarantees, and the responsible-disclosure process.

For the security _charter_ (the design rules every contribution must follow),
see [`CLAUDE.md`](./CLAUDE.md) §12.

---

## Supported versions

The HUD follows a single-mainline release model. Only the latest commit on
`main` receives security fixes. There is no LTS branch in v1.

| Version                 | Supported        |
| ----------------------- | ---------------- |
| v1 (latest `main`)      | ✅               |
| Older commits on `main` | ❌ — fix forward |

---

## Reporting a vulnerability

**Do not open a public GitHub issue for security reports.**

Email the maintainers at **security@livoclouds.com** with:

- A description of the issue and its impact.
- Steps to reproduce, or a minimal proof of concept.
- The commit SHA you tested against (`git rev-parse HEAD`).
- Your preferred attribution (or "please keep me anonymous").

We will acknowledge receipt within **3 business days**, share a remediation
timeline within **10 business days**, and credit you in the fix commit and
release notes unless you ask otherwise.

If you do not receive a response within 3 business days, please re-send the
report — email filters occasionally swallow security disclosures.

---

## Threat model

The HUD is **LAN-first by default**. Its threat model assumes:

| Assumption                                                     | Implication                                                                                                 |
| -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| The HUD listens on a trusted LAN, or behind Tailscale.         | No public ingress endpoint is exposed without explicit operator action.                                     |
| The operator controls the source machine (developer's laptop). | Hook payloads are trusted to _originate_ from Claude Code on the operator's box, gated by the bearer token. |
| Sinks (iPad, Pi, browser) are operator-controlled.             | Sinks only render the public HUD URL. They never receive the ingest token.                                  |
| A single operator uses the HUD at a time.                      | Multi-tenancy is out of scope. Clients do not authenticate.                                                 |

**Out of scope** for the v1 threat model:

- Adversaries on the same LAN. The HUD assumes the LAN is trusted. If you
  share your LAN with untrusted devices, use a per-host Tailscale ACL rather
  than the open `0.0.0.0:3000` bind.
- Public-internet ingress. The HUD must not be exposed to the public internet
  in v1. If you need remote access, use Tailscale.
- Source-machine compromise. If Claude Code is running on a compromised
  machine, the HUD is the least of the operator's problems.

---

## Operational guarantees

### Token handling

- The ingest endpoint requires `Authorization: Bearer <HUD_INGEST_TOKEN>`.
- Tokens are generated locally via `pnpm hud:token`, which writes
  `apps/hud/.env.local` (gitignored).
- Tokens **never** leave the source machine. The iPad PWA and the Pi kiosk only
  load the public HUD URL — they never receive the token.
- Rotate the token by re-running `pnpm hud:token`, then re-source the hook env
  on the developer machine.
- If a token leaks, rotate immediately and audit `data/events-*.jsonl` for
  unexpected activity.

### Input validation

- Every inbound event is validated against `HudEventSchema` (Zod) **before**
  reaching React state. Schema source: [`packages/contracts/src/event.ts`](./packages/contracts/src/event.ts).
- Malformed payloads return `400` with a precise error path. They never touch
  the bus or the JSONL log.
- The HUD **never executes** code from event payloads. Event strings are
  treated as untrusted display data — escaped by React's default rendering
  pipeline.

### Network posture

- The HUD binds to `0.0.0.0:3000` on the developer machine. This is a
  deliberate choice for LAN access; rebind to `127.0.0.1` if you only need
  local access.
- Outbound network from the hook script is restricted to the configured HUD
  origin (no telemetry, no analytics, no third-party calls).
- The hook script is **non-blocking on failure**. If the HUD is unreachable,
  Claude Code is never delayed (per
  [`docs/v1/phases/phase-4-hook-script.md`](./docs/v1/phases/phase-4-hook-script.md)).

### Persistence

- Events live in an in-memory ring buffer (1000-event cap) and a rolling JSONL
  log at `data/events-YYYY-MM-DD.jsonl`.
- The JSONL log is **plain text on disk**. Treat the `data/` directory as
  sensitive — it may contain tool inputs (file paths, command lines) from your
  Claude Code sessions.
- The JSONL log is gitignored. Do not check it into source control.
- There is no automated retention policy in v1. Operators are expected to
  rotate `data/` as needed.

---

## What to report

We're particularly interested in reports about:

- Token leakage to clients (iPad, Pi, browser).
- Schema-validation bypasses that let unexpected payloads reach React state.
- XSS through event-derived strings.
- Path traversal or arbitrary write in the JSONL log writer.
- Hook script injection — payloads on `~/.claude/settings.json` interfering
  with the bash hook.
- Service-worker cache poisoning of `/api/*` responses (the SW is configured
  to never cache them, per
  [`docs/v1/phases/phase-8-pwa-ipad.md`](./docs/v1/phases/phase-8-pwa-ipad.md)).
- Rate-limit or DoS vectors on the SSE stream.

---

## What is intentionally _not_ hardened in v1

These are documented trade-offs, not bugs. Please don't file them as
vulnerabilities — but feel free to discuss design alternatives in a regular
issue or PR.

- **No client authentication.** The SSE stream is open to anyone on the LAN
  who can reach `:3000`. Multi-user is out of scope.
- **No CSRF protection on `/api/events`.** The bearer token doubles as CSRF
  protection — there's no cookie-based session.
- **No request signing.** Replays of a captured `POST /api/events` will
  succeed. Tokens are scoped to a single trusted source; if you need anti-replay,
  rotate the token frequently.
- **No PWA secret storage.** The PWA does not hold secrets; it only consumes
  the public read-side of the API.
- **No automated dependency scanning.** Operators are expected to keep
  dependencies up to date.

---

## Hardening recommendations for operators

- Bind to `127.0.0.1:3000` if you only need browser access on the dev machine.
- Use Tailscale instead of opening port 3000 to your LAN if you don't trust
  every device on the network.
- Rotate `HUD_INGEST_TOKEN` if you suspect leakage (`pnpm hud:token`).
- Rotate `data/events-*.jsonl` weekly if your sessions are sensitive.
- For the Raspberry Pi kiosk, run the kiosk service as a normal user (not
  root) — `setup.sh` refuses to install as root.

---

## License

This Security Policy is provided under the same [MIT License](./LICENSE) as
the rest of the project.
