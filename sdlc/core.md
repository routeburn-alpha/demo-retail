# SDLC Core

Canonical specification of the SDLC step sequence. Both the human-facing
[`/work-on-task`](../.claude/skills/work-on-task/SKILL.md) skill and a managed (headless) prompt
render the same core — only the environment-specific deltas differ.

The runtime text lives in [`core.ts`](core.ts), which exports one `render*()` function per step.
**Edit a step here and in `core.ts`, and it ripples to both consumers.**

## Why a core

There are two consumers of the SDLC:

- **Human variant** — `.claude/skills/work-on-task/SKILL.md` (+ `precommit/SKILL.md`), read by
  Claude when the user types `/work-on-task`. Adds plan-mode, the graduated-test workflow,
  browser end-to-end verification, and the review gate.
- **Managed variant** — a prompt assembled at request time for autonomous runs. Adds workspace
  setup (clone, install, env, DB sync), composes the same core, and finishes with submit +
  build-report comment + a `DONE` sentinel.

Before a shared core, each path kept its own copy of the process and drift was the default. Now
they share text and diverge only where the environment truly forces them apart.

## Step sequence

Steps are listed by name; numbering is per-consumer. Each maps to a `render*()` function in
`core.ts`.

1. **Pick up the task** *(consumer-specific)* — both read the spec, acceptance criteria, and the
   seeded **standards**. Human picks the next backlog task; managed is handed a task id.
2. **Sync environment** *(consumer-specific)* — human verifies branch + clean tree, then
   `git reset --hard origin/main`. Managed runs its setup prelude (clone, `npm ci`, env pull).
3. **Sync the database** — `renderSyncDb()`. Apply the current Drizzle schema (`npm run db:push`)
   and seed, so the dev server and tests match `main`. **Managed runs this unconditionally;**
   **human decides** (run it when `git fetch` pulled schema-touching commits). On failure, **both
   abort** — without a working DB the run is invalid.
4. **Read the architecture map** — `renderReadArchitecture()`. Read the relevant part of
   `ARCHITECTURE.md` for the feature. Emit a one-sentence summary of what changes and the
   user-visible outcome.
5. **Size the task** — `renderSizeTheTask()`. `small` or `non-trivial`. Non-trivial triggers a
   fuller plan (human enters plan mode; managed inlines the plan).
6. **Plan + standards self-challenge** — `renderPlanAndSelfChallenge()`. Produce a one-paragraph
   test plan and a self-challenge table against the **seeded standards** — one row per standard.
   **Single source of standards** — query them once at pickup, no separate fetch.
7. **Behavior-change branch** — `renderBehaviorChangeBranch()`. Docs-only / config-only / pure
   rename: declare "no behavior change — skipping test" with a reason and skip to check + build.
8. **Impact pass for contract changes** — `renderImpactPass()`. Grep callsites *before* writing the
   test for required-field changes, signature changes, renames, and removes. Second pass for
   naming-convention shifts and service-layer wrappers.
9. **Write the failing test, see it fail** — `renderWriteFailingTest()`. Add `.only`, run, pipe to
   `logs/`, paste the failure verbatim. A green run here = a broken test.
10. **Implement** — `renderImplement()`. Minimum code to pass the test. Edit any callsites found in
    step 8 in the same pass.
11. **Broaden the test net** — `renderBroadenTests()`. Remove `.only`, run the full file, then the
    whole suite (`npm run test`).
12. **Pre-commit pipeline** — `renderPrecommitPipeline()`. `npm run check` + `npm run build` +
    `npm run test`, all green, on a freshly-rebased base.
13. **Push + open PR** — both variants push and open a PR. Human creates a short-lived
    `{taskId}-{slug}` branch off the agent branch first; managed uses the branch passed in.
14. **Review gate** *(human-only)* — human pauses inside `/precommit` for explicit approval. Managed
    has no synchronous reviewer; the GitHub PR review itself is the gate.
15. **Submit for review** — `renderSubmit()`. Confirm standards (`confirmStandards`) and attach the
    PR. **This is the second touch of the standards gate.**
16. **Build report** — `renderBuildReport()`. Three sections: *How we implemented it*,
    *Decisions off-spec*, *Learnings*. **Never create follow-on tasks autonomously** — list
    candidates as bullets in the learnings.
17. **Ambiguity escape hatch** — `renderAmbiguity()`. If the spec is genuinely ambiguous, stop and
    ask (human asks the user; managed posts a comment and waits).

## Consumer deltas

### Human variant (`/work-on-task` + `/precommit`)
- **Plan depth (step 6)** — non-trivial tasks use plan-mode for synchronous approval.
- **Graduated test workflow** — `.only` → full file → full suite, piping every run to `logs/`.
- **End-to-end (step 10)** — UI changes get opened in a browser; scripts get run.
- **Sync DB (step 3)** — human decides; skip when the worktree is already in sync.
- **Review gate (step 14)** — wait for explicit approval. PR link + diff stat + local URLs.

### Managed variant (headless prompt)
- **Setup prelude** (before step 1): clone, `npm ci`, `vercel env pull` / `.env.local`, DB sync.
- **Sync DB (step 3)** — unconditional.
- **Plan depth (step 6)** — inline the plan as an agent message (no plan-mode).
- **No review gate (step 14)** — push, open PR, submit, comment, terminate.
- **End** — print the PR URL on its own line, then `DONE`.

## What is NOT in the core

- The SDLC *policy* (test-first, minimum-code, no autonomous follow-on tasks) — those are the
  core's purpose, not parameters.
- Async checkpoint/resume orchestration for managed runs — a separate concern.
