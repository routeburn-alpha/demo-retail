---
name: precommit
description: Safe pre-commit workflow. Confirms standards, runs the gate and pushes via .studio-ai/ship.sh, then submits the task for review. Use this instead of git push directly.
---

# Precommit Skill

The ONLY way to push code. Enforces the SDLC: active task, standards confirmed, green gate.

**One path**, whoever is working the task. The run ends at review — you never merge.

Two things happen here, and only one of them is yours:

- **Judgement — yours.** Do the standards hold? What does the commit message say? What goes in the
  build report?
- **The ritual — `.studio-ai/ship.sh`.** Commit, rebase, check, build, test, push. Fixed sequence,
  no decisions in it, so it is one command and not eight turns of you driving it by hand.

## Flow

### 1. Verify active task + branch
- **Task:** read the task you are working with `get_task`. If you don't have one, say that pushing
  without a task bypasses the SDLC, and ask whether to continue. If you continue, skip Step 2.
- **Branch:** `git rev-parse --abbrev-ref HEAD` must not be `main`. If it is, create the branch now
  (`claude/<taskNumber>-<slug>`, or the name you were given) and carry your work onto it.

### 2. Confirm standards — the `confirmStandards` gate
Re-list EVERY seeded standard and confirm the changeset meets it. **Use the standards `get_task`
returned with the task — do not re-read `standards/*.md` off disk, you already have them.** Print a
confirmation line per standard:

| Standard | Met? | Evidence |
|----------|------|----------|
| Tests Run Against Real Services | yes | `src/.../foo.test.ts` hits real Postgres; no mocks |
| Leave Touched Files Cleaner | yes | removed dead import in `bar.ts`; no untouched files changed |

If any standard is not met, **stop and fix it** — do not ship. This is the second touch of the
standards gate (the first was the self-challenge in `/work-on-task`).

A standard you could not verify is not met. If the suite skipped the tests that prove it — which is
what happens with no `DATABASE_URL`, and the `security` project reports green either way — say so
here instead of claiming the standard holds.

### 3. Ship
```bash
bash .studio-ai/ship.sh "<commit message>"
```
Commit, rebase on `main`, `check`, `build`, `test`, push — in that order, failing closed. It prints
one line per phase and nothing else; full output goes to `logs/ship-<phase>.log`.

- **Exit 0** — the branch is pushed. Go to Step 4.
- **Exit 1** — the failing phase is named with the tail of its log. **Diagnose and fix** — that's
  where judgement matters — then run it again. Re-running amends, so the branch keeps one commit
  however many rounds it takes. Never rationalize a failure ("pre-existing", "unrelated", "flaky").

Don't hand-run `npm run check` / `build` / `test` first. `ship.sh` runs all three, and running the
suite twice forty seconds apart is two turns and about a minute for no new information.

### 4. Submit
Call `finalize_task` with the branch name, the repo, the `productCode` and a `buildReport`. It
opens the PR through the GitHub App and moves the task to `review` in one call — no `gh pr create`,
no separate `submit_for_review`.

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
- **Never skip the standards confirmation** (Step 2), and never confirm a standard you could not
  verify.
- **`ship.sh` is the only way to push.** Never `git push` by hand, and never push past a red phase.
- **Never work on `main`, and never merge.**
