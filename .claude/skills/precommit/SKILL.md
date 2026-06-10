---
name: precommit
description: Safe pre-commit workflow. Runs the full pipeline (check, build, tests), confirms standards, presents the review gate, then pushes on approval. Use this instead of git push directly.
---

# Precommit Skill

The ONLY way to push code. Enforces the SDLC: active task, standards confirmed, green build, green
tests. This is the push + review-gate + merge tail of the human SDLC; the shared core lives in
[`sdlc/core.md`](../../../sdlc/core.md).

## Flow

### 1. Verify active task + branch precondition
Find the studio-ai task this agent moved to `inProgress` (`get_tasks` with `status: inProgress` /
`owner: me`).
- **None found:** warn that pushing without a task bypasses the SDLC; ask to continue or pick a
  task. If continuing, skip the standards confirmation in Step 4.
- **Branch:** `git rev-parse --abbrev-ref HEAD` must be the agent branch (`agent/$AGENT_NAME`). If
  HEAD is already a `{id}-…` PR branch, **abort** — ask whether the prior PR should merge/close
  first. Step 3 branches off the agent branch, not off another PR branch.

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

### 4. Push & open PR
```bash
TASK_ID=<id from Step 1>
SLUG=<short kebab-case slug>
PR_BRANCH="${TASK_ID}-${SLUG}"
AGENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
git checkout -b "$PR_BRANCH" && git push -u origin "$PR_BRANCH"
gh pr create --base main --head "$PR_BRANCH" --title "$TASK_ID <description>" --body "Task: <product> #<taskNumber>"
```
Record the PR URL, then link it to the studio task with `submit_for_review` (moves the task to
`review` and assigns reviewers on the PR).

### 5. Review gate — the ONLY human interaction
Present together, as a status report (not a question at the keyboard user):
1. **PR link** — for the diff review.
2. **Diff stat** — files changed + one-line description, with the task id.
3. **Local URLs (required for UI changes)** — e.g. `http://localhost:$AGENT_PORT/...` for each
   state that matters.

Say "Awaiting review on the PR." Wait for explicit approval before merging. On feedback: make
changes, `git commit --amend --no-edit`, re-run Step 2, `git push --force-with-lease`, re-present.

### 6. Merge & reset
On approval. **Checkout the agent branch before merging and avoid `gh --delete-branch`:** `main` is
checked out in a sibling worktree, so `gh`'s post-merge `git checkout main` would be refused
(`fatal: 'main' is already used by worktree ...`). Get off the PR branch first and delete branches
explicitly so `gh` never touches local git state:
```bash
git checkout "$AGENT_BRANCH"                                  # leave the PR branch BEFORE merging
gh pr merge "$PR_BRANCH" --squash                             # remote squash-merge only — no local git ops
git push origin --delete "$PR_BRANCH" 2>/dev/null || true    # delete the remote PR branch explicitly
git fetch origin main && git reset --hard origin/main         # agent branch now mirrors main exactly
git branch -D "$PR_BRANCH" 2>/dev/null || true                # delete the local PR branch
```
Mark the studio task done: `update_task` with `status: done` and the merged PR (the backend
requires a merged PR for the `done` transition).

### 7. Build report
Post a build report as a comment on the studio task (`create_comment`) — three sections from the
core's `renderBuildReport`: **How we implemented it**, **Decisions off-spec**, **Learnings**. Omit
empty sections. **Never auto-create follow-on tasks** — list candidates as bullets in the
learnings; ask the user whether to create any.

## Rules
- **Never skip the task check** — SDLC traceability.
- **Never skip the standards confirmation** (Step 3).
- **Never push with failing tests.**
- **Always start from the agent branch.** PR branches are short-lived, created off the agent branch.
- **After Step 6 the agent branch is back at `origin/main` exactly** — that's the invariant.
