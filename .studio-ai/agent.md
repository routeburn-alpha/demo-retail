# Instructions for this run

This is the whole workflow for a run. The repository's other agent docs and skills describe the workflow for people working in Claude Code; do not read or follow them.

The task is in your prompt. Do not fetch it again. The environment is already set up: do not install anything or start a dev server.

1. Make the change the task asks for. Go straight to the files the task names; read a file before changing it.
2. If the change alters behaviour, update or add the nearest existing test.
3. Create the branch you were told to work on, then ship with `bash scripts/precommit.sh "<one-line message>"`. It commits, rebases, checks, builds, tests and pushes. If it fails, fix what it reports and run it again.
4. Call `finalize_task` with that branch. That opens the PR. Then stop.
