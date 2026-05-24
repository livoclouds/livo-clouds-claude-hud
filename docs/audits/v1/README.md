# Stability & Performance Audit — v1

**Audit date:** 2026-05-24
**Auditor:** Internal review (Claude assistant)
**Scope:** Full repository — client, server, shared contracts, shell pollers
**Reference budgets:** [`CLAUDE.md` §11](../../../CLAUDE.md)

This audit is a point-in-time review of the HUD codebase, conducted after
PR #35 brought the application to production-readiness for single-user use
on a LAN. It identifies areas that could compromise stability, RAM
consumption, or perceived performance as the project grows in users,
sessions, or runtime duration.

> **Important:** this audit lists findings and proposes fixes, but does not
> implement them. Each phase below tracks the actual implementation as
> work proceeds. The interactive [progress dashboard](./index.html) shows
> live status.

---

## Versioning

Audits are versioned independently from product documentation. This is
**v1** — the first comprehensive audit. When a follow-up audit is required
(for example, after a major architectural change, after adopting multi-
worker deployment, or annually as a hygiene exercise), the next audit lives
under `docs/audits/v2/` and references this one for comparison.

Each audit version is **immutable** once a phase is marked completed. If
follow-up work invalidates an earlier finding, the next audit records the
correction; the original audit is preserved verbatim as the historical
record of what was true at the time.

---

## Index

| Section | Purpose |
|---|---|
| [`README.md`](./README.md) | This document — overview, scope, navigation |
| [`index.html`](./index.html) | Interactive progress dashboard (open in browser) |
| [`methodology.md`](./methodology.md) | How to measure each budget before and after |
| [`findings/critical.md`](./findings/critical.md) | Six critical findings (C1–C6) |
| [`findings/high.md`](./findings/high.md) | Ten high-severity findings (H1–H10) |
| [`findings/medium-low.md`](./findings/medium-low.md) | Eleven medium and low findings (M1–M7, L1–L4) |
| [`phases/phase-1-security-and-disk.md`](./phases/phase-1-security-and-disk.md) | Hardening the ingest endpoint and log retention |
| [`phases/phase-2-client-performance.md`](./phases/phase-2-client-performance.md) | Virtualization, ticker consolidation, visibility-aware animations |
| [`phases/phase-3-server-and-bus.md`](./phases/phase-3-server-and-bus.md) | O(1) replay, zombie subscriber cleanup, smaller hydration payload |
| [`phases/phase-4-pollers.md`](./phases/phase-4-pollers.md) | Incremental JSONL parsing, cached filesystem maps, state-dir verification |
| [`phases/phase-5-sse-backpressure.md`](./phases/phase-5-sse-backpressure.md) | Detect and shed slow consumers without leaking RAM |

---

## Severity scale

| Severity | Definition |
|---|---|
| **Critical** | Breaks a budget today or exposes the service to abuse. Must be fixed before any non-trivial deployment. |
| **High** | Degrades behaviour under realistic load (5+ clients, 24 h sessions, or 100+ sessions tracked). Should be fixed before scaling. |
| **Medium** | Quality improvement; not a budget breaker, but worth doing in the same area as a critical/high fix. |
| **Low** | Operational hygiene; documented for visibility but no fix required in v1. |

A total of **27 findings** were recorded: 6 critical, 10 high, 7 medium, 4 low.

---

## Phase status overview

Authoritative status lives in [`index.html`](./index.html). The summary
below is updated by hand at the end of each PR.

| Phase | Severity | Status | PR |
|---|---|---|---|
| Phase 1 — Security & Disk | Critical | ✅ Completed | Local changes pending PR |
| Phase 2 — Client performance | Critical | ⏳ Pending | — |
| Phase 3 — Server & bus | High | ⏳ Pending | — |
| Phase 4 — Pollers | Critical / High | ⏳ Pending | — |
| Phase 5 — SSE backpressure | High | ⏳ Pending | — |

Phases are independent and can be merged in any order. The recommended
order — `1 → 2 → 4 → 3 → 5` — minimises risk by starting with the
non-render-path changes.

---

## How to update this audit

After a phase merges to `main`:

1. Edit the corresponding `phases/phase-N-*.md`:
   - Update the **Status** to `Completed`, `Partially completed`, or
     `Blocked`.
   - Fill in **What was done**, **What was deferred**, and **Before /
     after metrics**.
   - Link the merged PR number.
2. Update the **Phase status overview** table above.
3. Update [`index.html`](./index.html) — adjust the `data-progress` and
   `data-status` attributes on the matching phase card so the dashboard
   reflects the new state.
4. Commit with a message of the form
   `docs(audits/v1): update Phase N status after #PR`.

Do not edit findings (`findings/*.md`) once the audit is published —
they are the frozen record of what was observed on 2026-05-24.
