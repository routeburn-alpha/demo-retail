# Demo Script — The Builder's Journey, Live

A presenter's script for walking a live audience through the opinionated SDLC end to end, in about
**six minutes**. It's the spoken/clickable companion to the narrative in
[`BUILDERS-JOURNEY.md`](BUILDERS-JOURNEY.md) and the terse outline in
[`FRAMEWORK.md`](../FRAMEWORK.md#suggested-demo-narrative-6-minutes): the journey doc is the *story*,
this is the *script for telling it on stage with a real terminal*.

The whole point of the demo is to make the **invisible machinery visible** — the gates, the standards,
the studio task store, the lineage, the fleet. A feature demo shows a feature; this shows the *road*
every change is forced to walk. Keep landing on that.

---

## How to use this script

Each section below has four parts:

- **🖥️ DO** — exactly what to run or click on screen.
- **🎙️ SAY** — the talking points (paraphrase, don't read aloud verbatim).
- **⏸️ PAUSE HERE** — an enforcement moment to stop on and let land. These are the demo; everything
  else is connective tissue.
- **➡️ TRANSITION** — the one-liner that carries you into the next section.

The **Slide** column ties each section to the deck (slide numbers are the
[deck mapping](BUILDERS-JOURNEY.md#deck-mapping) in the journey doc).

---

## Pre-flight (before the clock starts)

Set this up *before* you present — none of it counts against the six minutes:

```bash
# 1. Dev server running, so the storefront is live to point at.
npm run dev                                  # note the URL it prints

# 2. A clean agent branch (the invariant — start where every task starts).
git rev-parse --abbrev-ref HEAD              # expect: agent/<name>
git status --porcelain                       # expect: empty

# 3. Pick a real, small backlog task to claim live. Have its number ready.
#    (In Claude Code: this is what /work-on-task will claim.)
```

Have open and ready to alt-tab: **(a)** a terminal in the repo, **(b)** the studio task list (the
studio-ai UI or MCP), **(c)** `sdlc/core.md` and `sdlc/core.ts` side by side in the editor.

> **Presenter note — pick the example task.** A *small code* change demos better than a docs change:
> the audience gets to see a real failing test go green. Any tiny storefront tweak works (a copy
> change with a component assertion, a new synonym, a small query filter). Keep it to one file + one
> test so the whole loop fits the clock.

---

## The run of show (~6 min)

| # | Section | Time | Slide |
|---|---------|------|-------|
| 1 | One spec, two runtimes | 0:45 | 2 |
| 2 | Work is a record | 0:30 | 4–5 |
| 3 | Claim → plan → the standards gate → the failing test | 2:00 | 6–7 |
| 4 | Implement → the precommit gate → the PR | 1:30 | 8 |
| 5 | Review sign-off → build report → lineage | 0:45 | 9–10 |
| 6 | The kicker: one road, a whole fleet | 0:45 | 10 |
| — | **Total** | **~6:15** | |

---

### 1 · One spec, two runtimes · 0:45 · Slide 2

**🖥️ DO** — Show `sdlc/core.md` and `sdlc/core.ts` side by side in the editor.

**🎙️ SAY** — "Most agent tools give you a chat box and a sandbox. This is a *paved road* — one
software-development lifecycle every builder walks identically, every time. The enemy is **drift**:
between people, between the interactive and the headless path, between what we say our process is and
what actually happened. Here there's exactly *one* description of the steps — this file — and both
the human `/work-on-task` skill and the autonomous, headless agent render the *same* text from it.
Edit the core once, both paths update."

**➡️ TRANSITION** — "So that's the road. Let's watch a change walk it — starting with the work
itself."

---

### 2 · Work is a record, not a prompt · 0:30 · Slides 4–5

**🖥️ DO** — Switch to the studio. Open the backlog task you're about to claim; point at its spec
and acceptance criteria.

**🎙️ SAY** — "Work doesn't start as a prompt I type into a chat box. It starts as a **typed record
in the studio** — the single source of truth. An *idea* carries the hypothesis; a *task* is one
shippable slice of it, linked back to that idea. Notice the acceptance criteria are right here on the
record, and so is the context this task needs — the architecture, the standards — already attached.
When I claim it, all of that gets injected into my working context automatically. I don't go hunting
for it."

**➡️ TRANSITION** — "Let me claim it — and watch what the framework makes me do *before* it lets me
write any code."

---

### 3 · Claim → plan → the standards gate → the failing test · 2:00 · Slides 6–7

> **This is the heart of the demo.** Don't rush it. The two pauses below are the moments the whole
> talk exists to deliver.

**🖥️ DO** — In Claude Code:

```
/work-on-task platform <taskNumber>
```

Let it claim the task (it flips to `inProgress` and is assigned), sync the branch, and reach the
**plan + standards self-challenge**.

**⏸️ PAUSE HERE — the standards gate (touch 1).** Stop on the self-challenge table.

**🎙️ SAY** — "Before a single line of production code, it has to fill *this* out — one row per
standard, declaring how the plan respects each. These aren't a `CONTRIBUTING.md` nobody reads;
they're **data, seeded into the studio**, injected here, and they'll be re-checked at the push. This
repo has two: tests run against real services — no mocks — and leave every file you touch cleaner
than you found it. The gate is at *plan time*, on purpose: the cheapest defect is the one the plan
never commits to."

**🖥️ DO** — Continue to the test step. Let it write the test and run it **red**:

```bash
npm run test 2>&1 | tee logs/demo.log
```

**⏸️ PAUSE HERE — test-first, and *see it fail*.** Stop on the red output.

**🎙️ SAY** — "The first thing written isn't the feature — it's the test, and we run it to watch it
**fail**. That red is the point. A test that passes the moment you write it has proven nothing; seeing
it fail for the *right reason* is what makes the green that comes next trustworthy. *Now* — and only
now — it writes the minimum code to pass."

**➡️ TRANSITION** — "Test's written, it's failing for the right reason. Let's make it pass and try to
ship."

---

### 4 · Implement → the precommit gate → the PR · 1:30 · Slide 8

**🖥️ DO** — Let it implement the minimum and turn the test green. Then push through the only door:

```
/precommit
```

Let the gate run **check → build → test**, in that order, on screen.

**⏸️ PAUSE HERE — the precommit gate (touch 2).** Stop on the gate output + the standards re-list.

**🎙️ SAY** — "There's exactly one way to push, and it isn't `git push` — it's this. The gate runs
**check, then build, then test**, all green, no exceptions — no 'that test was already failing.' And
right here the standards come back a **second time**: precommit re-lists every one and refuses to
push until the change is confirmed against each. Gated going in at plan time, gated coming out at push
time — same records both times. Then it opens the PR — and a server-side CI pipeline runs this *exact
same gate* again before anything can deploy. Belt and suspenders."

**➡️ TRANSITION** — "The PR's open and green. Now the one moment in this whole loop that's
deliberately human."

---

### 5 · Review sign-off → build report → lineage · 0:45 · Slides 9–10

**🖥️ DO** — Show the open PR (with its Vercel preview link), then the merged PR and the **build
report** comment on the studio task.

**🎙️ SAY** — "Everything so far was a machine checking a machine. This is the **single human
touchpoint** — reviewers were assigned on the PR automatically; a person reads the diff, clicks the
live preview, and explicitly approves before it squash-merges. And after merge, the builder posts a
**build report** — how it was implemented, where it went off-spec, what we learned. Those learnings
become *candidate* follow-ups a human chooses to create — never spawned automatically. Now look:
idea → task → PR → build report, an **unbroken chain**. Any line on `main` traces back to the
hypothesis it served."

**➡️ TRANSITION** — "One change, one builder, end to end. Here's why that matters at scale."

---

### 6 · The kicker: one road, a whole fleet · 0:45 · Slide 10

**🖥️ DO** — Show a second worktree agent spinning up (or describe it if not live):

```bash
scripts/worktree-init.sh bravo               # a second agent: own identity, own dev-server port
# scripts/agent-loop.sh                      # outside-the-session poll loop: claim one task, run, idle
```

**🎙️ SAY** — "Because work is a *claimable record* and every agent branch resets to `origin/main`
between tasks, this same SDLC scales out. N agents — supervised humans-in-the-loop *and* fully
autonomous Opus/Sonnet runs — each in its own isolated worktree, all pulling from the one backlog, no
collisions, no central scheduler. Every one of them walks the identical road you just watched: same
gates, same standards, same lineage. **That** — the invisible machinery, holding for one builder or a
hundred — is the differentiator."

**⏸️ CLOSE** — "The storefront is the visible feature. The *road underneath it* is the product."

---

## Presenter notes & recovery

- **If a test genuinely flakes or the gate goes red mid-demo — that *is* the demo.** Don't apologize.
  "See? It won't let me push. That's the entire point — the gate doesn't care that I'm on stage."
  Fix it (or roll back) and continue; you've just proven the thesis live.
- **Running short on time?** The cut-down path is sections **3 → 4** only (the two gates + the failing
  test). That's the irreducible core: "principles it can't skip, a test before code, one door out."
- **Have ten minutes instead of six?** Expand section 1 (open `core.ts` and show a `render*()`
  function feeding both the skill and the headless prompt), and section 5 (open a managed-agent
  **execution event stream** to show the LLM-and-tool calls of an autonomous run, narrating itself).
- **Don't read the SAY blocks verbatim** — they're beats, not a teleprompter. The energy is in
  landing the two ⏸️ pauses; everything else just gets you there and back out.
- **Keep pointing at the road, not the feature.** Every time the audience's eyes drift to the
  storefront, bring them back to what just got enforced.
