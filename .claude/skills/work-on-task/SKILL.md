---
name: work-on-task
description: "Test-first task workflow. Pick up a task, self-challenge against standards, watch a test fail, implement, ship. The default way to start any task."
user_invocable: true
---

# Work on Task

The canonical way to work a task, whoever is doing it: a person driving Claude Code in a local
checkout, or an agent launched into a cloud sandbox. **One path.** Where the environment genuinely
differs, the step says so in a line — it does not fork.

The shared step text lives in [`sdlc/core.md`](../../../sdlc/core.md) (runtime: `sdlc/core.ts`).

## Flow

### 1. Pick up the task
Tasks live in **studio-ai** (over MCP), not in files.

- **You were given a task number** — that is your task. Read it with `get_task`. Do not call any
  tool that picks up or claims a task; you already have one.
- **You were not** — claim the oldest ready task with `work_on_next_task(productCode)`.

Read the spec, acceptance criteria, and the seeded **standards** (`standards/` — these are the
gate). Restate the task name and acceptance criteria in one or two lines before doing anything else.

### 2. Get on a branch, off an up-to-date main
Never work on `main`, and never commit to it.

```bash
git fetch origin main && git reset --hard origin/main   # only if your tree is clean
git checkout -b <branch>
```

Use the branch name you were given if you were given one. Otherwise `claude/<taskNumber>-<slug>`.

If the working tree is dirty or carries commits that aren't on `main`, stop and say so rather than
resetting over someone's work.

### 3. Prepare the environment
The storefront reads its catalogue from Postgres. Without a database the dev server returns 500 and
**20 tests skip themselves** — including the entire `security` project, which then reports green
having verified nothing.

Run the one entry point:
```bash
mkdir -p logs && bash .studio-ai/warm.sh > logs/warm.log 2>&1
```
That is the whole of this step; there is no other setup script and no marker file to check first —
every run starts on a fresh machine, so there is nothing to have already done. If it fails, read
`logs/warm.log` for the reason, then **abort** — without a working database the run is invalid,
however small the change.

### 4. Read the architecture map
Read the relevant part of `ARCHITECTURE.md`. State in one sentence: "This task changes {what} in
{where}. The user-visible outcome is {what}."

### 5. Plan + standards self-challenge — THE GATE
**Do not write production code until this completes.**

**5.0 Size:** `small` or `non-trivial`. If unsure, non-trivial.
**5.0a Plan first (non-trivial only):** produce a plan — files, approach, decisions — with the test
plan in it. If a person is driving, present it and wait for approval; otherwise state it inline and
continue.
**5a Propose the test:** one paragraph — file path, level (component / server-db / pure unit), the
single assertion proving the user-visible outcome, setup/teardown.
**5b Self-challenge against the seeded standards.** Read `standards/*.md` now — once, here. You
will confirm against them again at ship time, from what you read. One row per standard:

| Standard | Plan respects it? | Adjustment if not |
|----------|-------------------|-------------------|
| {title}  | yes / no / N/A    | {how the plan changes, or "—"} |

Pay special attention to **Tests Run Against Real Services** (use real Postgres / real component
render, never a mock) and **Leave Touched Files Cleaner** (note which files you'll open and what
dead code you'll remove). Apply adjustments; restate the plan if it changed materially.
**5c Behavior change?** Docs-only / config-only / pure rename → state "No behavior change —
skipping test." with a reason, skip to step 9.
**5d Impact pass (contract changes):** grep all callsites before writing the test.

### 6. Write the failing test — see it fail
Write the test, add `.only`, run it and pipe to a file:
```bash
npm run test 2>&1 | tee logs/test-output.log
```
Read the log and paste the failure verbatim. A green run = a broken test; redesign.

### 7. Implement
Minimum code to pass the test. Edit any callsites from 5d in the same pass.

### 8. Broaden the test net
Remove `.only`. Don't run the full suite here — `/precommit` runs it, along with `check` and
`build`, as one gate. Running it in both places is the same suite twice, a minute apart, for no new
information.

### 9. Run the change end-to-end
Tests aren't enough for UI. Start the dev server on any free port and drive the golden path:
```bash
npm run dev -- --port 4173 &
curl -s http://127.0.0.1:4173/ | grep <the thing you changed>
```
Open the affected route and check it renders. For scripts, run them with real arguments. Stop the
server when you're done. If you genuinely can't execute the change here (missing keys, paid
service), say so in the build report rather than skipping quietly.

### 10. Ship
Invoke `/precommit`. Don't wait to be asked.

## Rules
- **Step 5 is mandatory** — no production code before the standards self-challenge plus a failing
  test (or an explicit no-behavior-change declaration).
- **Step 6 failure output is mandatory** and pasted verbatim.
- **Never mock** (standard: Tests Run Against Real Services). **Clean the files you touch**
  (standard: Leave Touched Files Cleaner).
- **Never work on `main`, and never merge.** Shipping ends at review.
