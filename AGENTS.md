# AGENTS.md

Routeburn, a retail storefront: SvelteKit 2, Drizzle ORM, Postgres, tested with Vitest (browser mode for components). The environment is already set up.

To work on a task, follow the `work-on-task` skill (`.claude/skills/work-on-task/SKILL.md`).

Never run `db:push` or `db:seed` yourself: against a shared database they rewrite state other people depend on.
