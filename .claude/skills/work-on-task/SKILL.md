---
name: work-on-task
description: "Test-first task workflow. Pick up a task, self-challenge against standards, watch a test fail, implement, ship. The default way to start any task."
user_invocable: true
---

# Work on Task

The canonical way to start a task. Test-first, with a standards self-challenge before the test is
written. One human touchpoint: the review gate in `/precommit`.

The shared SDLC text lives in [`sdlc/core.md`](../../../sdlc/core.md) (runtime: `sdlc/core.ts`).
This skill is the **human variant** — it follows the core end-to-end and adds the human deltas:
plan-mode for non-trivial tasks, the graduated test workflow, browser end-to-end verification, and
the hand-off to `/precommit`.

## When to use

Default for every task. `/work-on-task <productCode> <taskNumber>` to pick a specific studio task,
or `/work-on-task` to take the next one.

## Flow

### 1. Pick up the task
Tasks live in **studio-ai** (over MCP), not in files. Claim with `work_on_next_task`:
- Id passed: `work_on_next_task(productCode, taskNumber)` for that specific task.
- No argument: `work_on_next_task(productCode)` — claims the oldest `backlog` task.

This marks the task `inProgress` and assigns it to the registered agent (register once with
`register_agent` if `list_agents` is empty). Read the spec, acceptance criteria, and the seeded
**standards** (`standards/` — these are the gate). Show task title and acceptance criteria.

### 2. Sync environment
Work only ever happens on the agent branch (`agent/$AGENT_NAME`), where `$AGENT_NAME` is resolved
from the worktree by `npx tsx scripts/studio-poll.ts whoami` — never read out of the environment,
which may carry another worktree's (equally valid, equally registered) agent name.
1. `git rev-parse --abbrev-ref HEAD` must equal `agent/$AGENT_NAME`. If it's a `{id}-…` PR branch
   or anything else, **abort** — a leftover branch means a previous session didn't finish cleanly.
2. No unfinished submitted work from **this agent**: call `get_tasks(status: "review")` (studio-wide)
   and check whether any returned task is **assigned to this agent** — shown as `[$AGENT_NAME]` in the
   listing. If one is, that PR must merge or close first, so **abort**; otherwise continue. Scope this
   by **agent**, not by GitHub account: in the fleet all agents push as one git identity, so
   `gh pr list --author "@me"` returns *other* agents' open PRs and trips this gate falsely. NB the
   `get_tasks` **`agent` parameter is a no-op** (it does not filter server-side — verified), so you
   must read the `[$AGENT_NAME]` assignment from the listing yourself, not rely on an `agent:` filter.
3. Clean tree + no unpushed commits: `git fetch origin main`, `git status --porcelain`,
   `git log --oneline origin/main..HEAD`. Non-empty either → abort.
4. Only after 1–3 pass: `git reset --hard origin/main`.

### 3. Sync the database (your call)
If step 2's fetch pulled schema-touching commits, run `npm run db:push && npm run db:seed`. Skip if
nothing relevant changed. **If it fails, abort** — without a working DB the run is invalid.

### 4. Read the architecture map
Read the relevant part of `ARCHITECTURE.md`. State in one sentence: "This task changes {what} in
{where}. The user-visible outcome is {what}."

### 5. Plan + standards self-challenge — THE GATE
**Do not write production code until this completes.**

**5.0 Size:** `small` or `non-trivial`. If unsure, non-trivial.
**5.0a Plan mode (non-trivial only):** call EnterPlanMode, produce a plan (files, approach,
decisions); the test plan slots in. Present via ExitPlanMode and wait for approval.
**5a Propose the test:** one paragraph — file path, level (component / server-db / pure unit), the
single assertion proving the user-visible outcome, setup/teardown.
**5b Self-challenge against the seeded standards** (`standards/`). One row per standard:

| Standard | Plan respects it? | Adjustment if not |
|----------|-------------------|-------------------|
| {title}  | yes / no / N/A    | {how the plan changes, or "—"} |

Pay special attention to **Tests Run Against Real Services** (use real Postgres / real component
render, never a mock) and **Leave Touched Files Cleaner** (note which files you'll open and what
dead code you'll remove). Apply adjustments; restate the plan if it changed materially.
**5c Behavior change?** Docs-only / config-only / pure rename → state "No behavior change —
skipping test." with a reason, skip to step 7.
**5d Impact pass (contract changes):** grep all callsites before writing the test.

### 6. Write the failing test — see it fail
Write the test, add `.only`, run and pipe to a file:
```bash
npm run test 2>&1 | tee logs/test-output.log
```
Read the log and paste the failure verbatim. A green run = a broken test; redesign.

### 7. Implement
Minimum code to pass the test. Edit any callsites from 5d in the same pass.

### 8. Broaden the test net
Remove `.only`. Run the full suite:
```bash
npm run test 2>&1 | tee logs/test-full.log
```
Fix anything that broke.

### 9. Run the change end-to-end
Tests aren't enough for UI. Resolve the dev-server port from the **worktree**, never from the shell —
`$AGENT_PORT` leaks between worktrees exactly as `$AGENT_NAME` did, and a leaked one lets you verify
a change against another agent's dev server:
```bash
PORT="$(npx tsx scripts/studio-poll.ts port)"   # fails loudly if another worktree claims it
npm run dev -- --port "$PORT"
```
Open the affected route at `http://localhost:$PORT` and drive the golden path. For scripts, run them
with real arguments. If you can't execute the change here (missing keys, paid service), say so at
the review gate.

### 10. Ship
Invoke `/precommit`. The review gate inside it is the one human stop. Don't wait for the user before
invoking it.

## Rules
- **Step 5 is mandatory** — no production code before the standards self-challenge plus a failing
  test (or an explicit no-behavior-change declaration).
- **Step 6 failure output is mandatory** and pasted verbatim.
- **Never mock** (standard: Tests Run Against Real Services). **Clean the files you touch**
  (standard: Leave Touched Files Cleaner).
