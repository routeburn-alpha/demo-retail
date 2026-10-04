---
name: precommit
description: Check a change against the standards and ship it as a PR. Use when a change is ready.
---

# Precommit

1. Check the change against every standard in `standards/`. A standard it does not meet, or that you could not verify (a test that proves it was skipped), is a fix to make now, not a note.
2. Run `bash scripts/ship.sh "<one-line message>"`. It commits, rebases, checks, builds, tests and pushes; exit 0 means pushed. If it fails, fix what it reports and run it again.
3. Call `finalize_task` with the branch and a `buildReport` whose summary lists each standard with one line of evidence. That opens the PR. Then stop.
