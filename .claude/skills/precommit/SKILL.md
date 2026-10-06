---
name: precommit
description: Check a change against the standards and ship it as a PR. Use when a change is ready.
---

# Precommit

1. Check the change against every standard in `standards/` (read them if you have not). Print one row per file in that folder:

   | Standard | Met? | Evidence |
   |---|---|---|
   | Tests Run Against Real Services | yes | `src/routes/page.svelte.test.ts` renders the real component, no mocks |

   A standard it does not meet, or that you could not verify (a test that proves it was skipped), is not met. Fix it now, before shipping: it is not a note.
2. Run `bash scripts/ship.sh "<one-line message>"`. It commits, rebases, checks, builds, tests and pushes; exit 0 means pushed. If it fails, fix what it reports and run it again.
3. Call `finalize_task` with the branch and a `buildReport` whose `summary` is that table, one row per standard with its evidence (the rows themselves, not a prose paraphrase). That opens the PR. Then stop.
