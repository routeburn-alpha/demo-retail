# CLAUDE.md

**Read [`FRAMEWORK.md`](FRAMEWORK.md) first** — it explains the opinionated SDLC this repo
demonstrates. This file is the agent-facing rule sheet.

Routeburn is a retail storefront: **SvelteKit 2 + Drizzle ORM + Postgres (Neon)**, tested with
**Vitest** (browser mode via `vitest-browser-svelte`).

## The SDLC

Every task follows the shared step sequence in [`sdlc/core.md`](sdlc/core.md). The human entry
point is the [`/work-on-task`](.claude/skills/work-on-task/SKILL.md) skill; the only way to push is
[`/precommit`](.claude/skills/precommit/SKILL.md).

## Standards (the active gate)

Before writing code you must self-challenge your plan against the seeded
[`standards/`](standards/) — one row per standard. Before pushing, `/precommit` re-lists them and
you must confirm each. The three standards in this repo:

- [Tests run against real services (no mocks)](standards/no-mocks.md)
- [Leave touched files cleaner (campground rule, scoped)](standards/leave-files-cleaner.md)
- [Hidden products never reach the storefront](standards/no-hidden-products-in-search.md)

## Commands

```bash
bash .studio-ai/warm.sh         # Prepare the environment — install, database, types, build, test once
bash .studio-ai/ship.sh "msg"   # Commit, rebase, check, build, test, push — the whole gate
npm run dev                     # SvelteKit dev server (vite)
npm run test                    # Vitest — component + server/db integration tests
npm run check                   # svelte-check (app) + tsc on sdlc/ and scripts/
npm run build                   # Production build
```

**Two scripts bracket the work: `warm.sh` prepares, `ship.sh` ships.** Both exist because a fixed
sequence with no judgement in it should not be executed one turn at a time. Don't hand-run the gate
before `ship.sh` — it runs `check`, `build` and `test` itself, and running the suite twice a minute
apart tells you nothing new.

**Setting up is one command: `.studio-ai/warm.sh`.** It installs, starts and seeds a local Postgres,
generates SvelteKit's types, builds, and runs the suite once. Do not assemble that by hand, and do
not go looking for another setup script — this is the one. If `.studio-warm.md` is present the work
is already done; read it and skip the step.

⚠️ **Do not run `db:push` or `db:seed` directly.** They are the warm script's to call. Against a
shared (Neon) `DATABASE_URL` they rewrite state other people and other agents depend on —
[`INITIAL-SETUP.md`](INITIAL-SETUP.md) spells this out, and it is a file an agent has no reason to
open. `warm.sh` will not touch a non-local database for exactly this reason.

**A run with no database is not a passing run.** `DATABASE_URL` absent means 20 tests skip
themselves, including the entire `security` project, which then reports green having verified
nothing. `drizzle.config.ts` sets `tablesFilter: ['!standards']` so push ignores the `standards`
table — managed outside Drizzle by `seed-standards.ts`, and otherwise seen as a data-loss drop that
blocks on an interactive prompt. Keep any other out-of-Drizzle tables out of push the same way.

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
