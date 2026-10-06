---
name: work-on-task
description: Work on a studio task from start to PR. Use when you have been given a task to implement.
---

# Work on task

The task is in your prompt. Do not fetch it again.

1. Before writing code, check your plan against every standard in `standards/` (read them if you have not). Print one row per file in that folder:

   | Standard | Plan respects it? | Adjustment |
   |---|---|---|
   | Tests Run Against Real Services | yes | extend `src/routes/page.svelte.test.ts` |

   Where the answer is no, change the plan now.
2. Make the change the task asks for. Go straight to the files the task names; read a file before changing it.
3. If the change alters behaviour, update or add the nearest existing test. Tests use real services: never mock `fetch` or fake the database.
4. Create the branch you were told to work on, then ship with the `precommit` skill (`.claude/skills/precommit/SKILL.md`).
