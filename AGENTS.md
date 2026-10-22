# AGENTS.md

Routeburn, a retail storefront: SvelteKit 2, Drizzle ORM, Postgres, tested with Vitest (browser mode for components). The platform's prompt tells you whether your run started warm (dependencies installed) or cold. On a cold run, run `bash .studio-ai/warm.sh` once, in the foreground, before anything else.

To work on a task, follow the `work-on-task` skill (`.claude/skills/work-on-task/SKILL.md`).

Never run `db:push` or `db:seed` yourself: against a shared database they rewrite state other people depend on.
