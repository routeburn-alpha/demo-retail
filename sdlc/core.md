# SDLC Core

Canonical specification of the SDLC step sequence. **One sequence**, for whoever is working the
task: a person driving Claude Code in a local checkout, or an agent launched into a cloud sandbox.

The runtime text lives in [`core.ts`](core.ts), which exports one `render*()` function per step.
[`/work-on-task`](../.claude/skills/work-on-task/SKILL.md) and
[`/precommit`](../.claude/skills/precommit/SKILL.md) follow the same sequence. Edit a step here and
in `core.ts` together.

## Why one sequence

This used to describe two: a "human variant" and a "managed variant", with a table of deltas
between them. That split was the problem.

The managed variant existed only in prose. There was no `MANAGED_STEPS`, nothing imported
`core.ts`, and no code assembled a managed prompt. So an agent launched into a sandbox read the
human skill — the only thing there was to read — and was told to claim a task it had already been
given, to abort unless `HEAD` was an `agent/<name>` branch, to resolve its identity from a worktree
settings file that doesn't exist in a sandbox, and to wait for a human approval that was never
coming. Runs succeeded by quietly disobeying those steps, which is one less-capable model away from
aborting at step 2 and being *correct* to.

The real differences are not human-vs-agent. They are facts about the environment — do you already
have a task, is the environment already prepared, is anyone watching — and each is one line inside
the step it affects.

## Step sequence

Each step maps to a `render*()` function in `core.ts`.

1. **Pick up the task** — `renderPickUpTask()`. Given a task number, that is your task (`get_task`);
   otherwise claim the oldest ready one (`work_on_next_task`). Read the spec, acceptance criteria
   and the seeded **standards**, and restate the task in a line or two.
2. **Get on a branch** — never work on `main`. Use the branch name you were given, else
   `claude/<taskNumber>-<slug>`, cut from an up-to-date `main`.
3. **Prepare the environment** — `renderPrepareEnvironment()`. If `.studio-warm.md` exists the
   environment is already prepared: read it, and do not reinstall, rebuild or re-seed. Otherwise
   run `bash .studio-ai/warm.sh` — the one entry point, which installs, starts and seeds Postgres,
   generates types, builds, and runs the suite once. On failure, **abort**: without a working
   database the run is invalid.
4. **Read the architecture map** — `renderReadArchitecture()`. Emit a one-sentence summary of what
   changes and the user-visible outcome.
5. **Size the task** — `renderSizeTheTask()`. `small` or `non-trivial`. Non-trivial gets a fuller
   plan, presented for approval if a person is driving and stated inline otherwise.
6. **Plan + standards self-challenge** — `renderPlanAndSelfChallenge()`. A one-paragraph test plan
   and a self-challenge table against the seeded standards, one row each.
7. **Behavior-change branch** — `renderBehaviorChangeBranch()`. Docs-only / config-only / pure
   rename: declare "no behavior change — skipping test" with a reason and skip to check + build.
8. **Impact pass for contract changes** — `renderImpactPass()`. Grep callsites *before* writing the
   test.
9. **Write the failing test, see it fail** — `renderWriteFailingTest()`. Add `.only`, run, pipe to
   `logs/`, paste the failure verbatim. A green run here = a broken test.
10. **Implement** — `renderImplement()`. Minimum code to pass the test, plus the callsites from
    step 8.
11. **Broaden the test net** — `renderBroadenTests()`. Remove `.only`. The suite itself runs once,
    in the gate below.
12. **Run it end-to-end** — start the dev server on any free port and drive the golden path. Tests
    are not enough for UI.
13. **Ship** — `renderPrecommitPipeline()`. One command: `bash scripts/precommit.sh "<message>"` —
    commit, rebase, `check`, `build`, `test`, push, failing closed. The mirror of `warm.sh`: a
    fixed sequence with no judgement in it does not belong in an agent's turn loop.
14. **Confirm standards and submit** — `renderSubmit()`. Re-list every standard with evidence (the
    `confirmStandards` gate — the second touch), using the standards returned with the task rather
    than re-reading them off disk. Then call `finalize_task`, which opens the PR and moves the task
    to review.
15. **Build report** — `renderBuildReport()`. Carried on `finalize_task`: summary, testing steps,
    verification path, decisions, learnings. **Never create follow-on tasks autonomously** — list
    candidates in the learnings.
16. **Ambiguity escape hatch** — `renderAmbiguity()`. If the spec is genuinely ambiguous, stop and
    ask: post the question as a comment on the task, and say it in the session too.

## Where the environment shows through

Three places, and only these:

| Step | The fact | What it changes |
|---|---|---|
| 1 | Were you given a task? | Read it, or claim one. Never claim one you already have. |
| 3 | Is `.studio-warm.md` present? | Trust it, or run `warm.sh`. |
| 5 | Is a person driving? | Present the plan for approval, or state it and continue. |

Nothing else forks. In particular, **the run always ends at review** — nobody merges their own
work, so "is a human watching" never decides whether to wait.

## What is a script, and what is a step

Two things are scripts rather than steps, for the same reason: they are fixed sequences with no
judgement in them, and a model executing them one turn at a time is pure overhead.

| Script | Replaces | Measured before |
|---|---|---|
| `.studio-ai/warm.sh` | install, database, types, build, first test run | 14 tool calls, 63s per run |
| `scripts/precommit.sh` | commit, rebase, check, build, test, push | 11 of 24 tool calls |

What stays with whoever is working the task: whether the change is right, whether the standards
hold, what the commit message says, and what goes in the build report.

## What is NOT in the core

- The SDLC *policy* (test-first, minimum-code, no autonomous follow-on tasks) — those are the
  core's purpose, not parameters.
- Async checkpoint/resume orchestration — a separate concern.
