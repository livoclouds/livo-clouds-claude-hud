# Commit Message Guidelines

This file defines the required commit message format for Step 2.

---

## Format

```
<concise title summarizing all changes>

<body: one paragraph or bullet list covering every file changed,
what changed in each, and why the change was made>
```

---

## Title Rules

- Imperative mood: "Add", "Fix", "Update", "Refactor" — not "Added", "Fixed"
- **Conventional commit prefixes are allowed and encouraged** in this repo. Recent `main` history uses them consistently (`feat(contracts):`, `docs(pages):`, `docs(tracker):`, `docs(v1):`). Pick the prefix that matches the change:
  - `feat(<scope>):` — new feature
  - `fix(<scope>):` — bug fix
  - `docs(<scope>):` — documentation only
  - `chore(<scope>):` — tooling, deps, CI
  - `refactor(<scope>):` — no behavior change
  - `test(<scope>):` — tests only
- The `<scope>` should match the affected area: `contracts`, `hud`, `hooks`, `mascot`, `pages`, `tracker`, `phase-N`, etc.
- General enough to convey the full scope — not limited to one file
- 72 characters maximum

**Good:**
```
feat(contracts): add compact.start/end event types and tests
docs(phase-3): document SSE backpressure decision
fix(hud): clamp contextPct to [0, 100] before render
```

**Bad:**
```
fix docs
changes to contracts
feat: stuff
```

---

## Body Rules

- List each file modified (or group by package if many files in the same area)
- State what changed in it (functions added, logic altered, sections rewritten, schema fields added)
- State why (what problem it solves or what requirement it fulfills)
- Use bullet points or short paragraphs — no walls of text
- Do not reference issue numbers, PR numbers, or task IDs unless the user asks
- Reference CLAUDE.md sections when the change is driven by a documented constraint (e.g., "per CLAUDE.md §8")

**Good body:**
```
- packages/contracts/src/event.ts: added `compact.start` and `compact.end`
  to the HudEventSchema type union. Required so the mascot can render the
  `compacting` state defined in CLAUDE.md §7.
- packages/contracts/test/event.test.ts: added round-trip cases for both
  new event types to lock the contract.
```

---

## What Never Goes in a Commit

- Co-authored-by lines referencing AI, Claude, or any automated tool
- Attribution to automated tools
- TODO comments or future work notes
- Environment file contents
- The `HUD_INGEST_TOKEN` value or any other secret
- Secrets, tokens, or credentials in any form
