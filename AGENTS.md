# AGENTS.md

Routeburn, a retail storefront: SvelteKit 2, Drizzle ORM, Postgres, tested with Vitest (browser mode for components). The task you were given is in your prompt; the environment is already set up.

1. Make the change the task asks for. Go straight to the files the task names; read a file before changing it.
2. If the change alters behaviour, update or add the nearest existing test. Tests use real services: never mock `fetch` or fake the database.
3. Create the branch you were told to work on, then ship with `bash scripts/precommit.sh "<one-line message>"`. It commits, rebases, checks, builds, tests and pushes; exit 0 means pushed. If it fails, fix what it reports and run it again.
4. Call `finalize_task` with that branch. That opens the PR. Then stop.

Never run `db:push` or `db:seed` yourself: against a shared database they rewrite state other people depend on.
