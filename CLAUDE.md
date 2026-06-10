# CLAUDE.md

**Read [`FRAMEWORK.md`](FRAMEWORK.md) first** — it explains the opinionated SDLC this repo
demonstrates. This file is the agent-facing rule sheet.

Tarn & Trail is a retail storefront: **SvelteKit 2 + Drizzle ORM + Postgres (Neon)**, tested with
**Vitest** (browser mode via `vitest-browser-svelte`).

## The SDLC

Every task follows the shared step sequence in [`sdlc/core.md`](sdlc/core.md). The human entry
point is the [`/work-on-task`](.claude/skills/work-on-task/SKILL.md) skill; the only way to push is
[`/precommit`](.claude/skills/precommit/SKILL.md).

## Standards (the active gate)

Before writing code you must self-challenge your plan against the seeded
[`standards/`](standards/) — one row per standard. Before pushing, `/precommit` re-lists them and
you must confirm each. The two standards in this repo:

- [Tests run against real services (no mocks)](standards/no-mocks.md)
- [Leave touched files cleaner (boyscout, scoped)](standards/leave-files-cleaner.md)

## Commands

```bash
npm run dev                 # SvelteKit dev server (vite)
npm run test                # Vitest — component + server/db integration tests
npm run check               # svelte-check (types)
npm run build               # Production build
npm run db:push             # Apply Drizzle schema to the database
npm run db:seed             # Seed the product catalogue
tsx scripts/seed-standards.ts   # Seed standards/*.md into the standards table
```

## Testing

**All tests are integration tests by default.** Component tests render real Svelte components in a
real browser (Vitest browser mode) and may fetch from the running dev server; server/db tests run
against a real Postgres. **Never mock `fetch` and never fake the database.** Pure unit tests are
allowed *only* for logic with no I/O (e.g. the search/synonym matcher). See
[`standards/no-mocks.md`](standards/no-mocks.md).

Always pipe test output to a file and read it back — never re-run just to see output again:

```bash
npm run test 2>&1 | tee logs/test-output.log
```

## Rules

1. **TDD** — write the failing test before the implementation.
2. **Never push with failing tests** — no "pre-existing / unrelated / flaky" rationalizing.
3. **Minimal changes** — no over-engineering, no extras beyond what the task asks.
4. **Leave touched files cleaner** — remove dead code / unused imports in files you open; do *not*
   expand into untouched files (that's a backlog candidate).
5. **No mocks** — real services in tests; the only stub is a service with unrecoverable side
   effects (email, SMS, live payments).
6. **`/precommit` is the only way to push** — never `git push` directly.
7. **Agent branch always returns to `origin/main`** between tasks.
8. **Never create follow-on tasks autonomously** — list them in the build report's learnings.
