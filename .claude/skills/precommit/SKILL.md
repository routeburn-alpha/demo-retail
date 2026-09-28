---
name: precommit
description: Safe pre-commit workflow. Runs the full pipeline (check, build, tests), confirms standards, pushes the branch and submits the task for review. Use this instead of git push directly.
---

# Precommit Skill

The ONLY way to push code. Enforces the SDLC: active task, standards confirmed, green build, green
tests. This is the push-and-submit tail of the SDLC; the shared core lives in
[`sdlc/core.md`](../../../sdlc/core.md).

**One path**, whoever is working the task. The run ends at review — you never merge.

## Flow

### 1. Verify active task + branch
- **Task:** read the task you are working with `get_task`. If you don't have one, say that pushing
  without a task bypasses the SDLC, and ask whether to continue. If you continue, skip the
  standards confirmation in Step 3.
- **Branch:** `git rev-parse --abbrev-ref HEAD` must not be `main`. If it is, create the branch now
  (`claude/<taskNumber>-<slug>`, or the name you were given) and carry your work onto it.

### 2. Run the pipeline
Rebase on main, then run the full gate — all three must be green:
```bash
git fetch origin main && git rebase origin/main
npm run check && npm run build && npm run test 2>&1 | tee logs/precommit.log
```
If a phase fails, **diagnose and fix** — that's where judgement matters — then re-run. Never push
with a red pipeline. No rationalizing ("pre-existing", "unrelated", "flaky").

### 3. Confirm standards — the `confirmStandards` gate
**Before opening the PR**, re-list EVERY seeded standard (`standards/`) and confirm the changeset
meets it. Print a confirmation line per standard:

| Standard | Met? | Evidence |
|----------|------|----------|
| Tests Run Against Real Services | yes | `src/.../foo.test.ts` hits real Postgres; no mocks |
| Leave Touched Files Cleaner | yes | removed dead import in `bar.ts`; no untouched files changed |

If any standard is not met, **stop and fix it** — do not proceed to push. This is the second touch
of the standards gate (the first was the self-challenge in `/work-on-task`).

A standard you could not verify is not met. If the suite skipped the tests that prove it — which is
what happens with no `DATABASE_URL`, and the `security` project reports green either way — say so
here instead of claiming the standard holds.

### 4. Push and submit
```bash
git push -u origin "$(git rev-parse --abbrev-ref HEAD)"
```
Then call `finalize_task` with the branch name, the repo, the `productCode` and a `buildReport`. It
opens the PR through the GitHub App and moves the task to `review` in one call — you do not need
`gh pr create`, and you do not need a separate `submit_for_review`.

The `buildReport` is the handover, so write it properly:
- **summary** — one short paragraph: the actual shape of the change. Becomes the PR body.
- **testingSteps** — how to exercise it.
- **verificationPath** — the route where it's visible.
- **decisions** — judgement calls the spec didn't cover.
- **learnings** — what the next task needs to know.

Omit any field with nothing real in it. **Never create follow-on tasks autonomously** — list
candidates in `learnings`.

### 5. Stop
The run is over. Say what you shipped, with the PR link.

**You do not merge, and there is nothing to wait for.** Review and merge belong to a person,
whether or not one is watching now. `main` requires four CI checks (`check`, `build`, `test`,
`security`) which run on the PR — a reviewer merges once they pass.

Do not set the task status by hand afterwards. The PR-merge webhook moves `review → releasing`, and
`deployment_status` takes it to `shipped`.

## Rules
- **Never skip the task check** — SDLC traceability.
- **Never skip the standards confirmation** (Step 3), and never confirm a standard you could not
  verify.
- **Never push with failing tests.**
- **Never work on `main`, and never merge.**
