# The Builder's Journey

> A narrative walkthrough of what it's actually like to ship one change here — and what the
> framework quietly enforces at every step. If [`FRAMEWORK.md`](../FRAMEWORK.md) is the *what*
> (the 7 opinions) and [`sdlc/core.md`](../sdlc/core.md) is the *spec*, this is the *story*.

## For builders

"Builder" used to mean an engineer. Product people wrote the *why*, engineers wrote the *how*, and
work got thrown over the wall between them. That wall is gone here. A builder is anyone — or
anything — that moves a hypothesis toward shipped, reviewed, traceable software: the person shaping
an idea, the person implementing it, **and the AI agents that walk this same road autonomously.**
Same lifecycle, same gates, same lineage, whoever's hands are on it.

So this walkthrough asks everyone to care about the whole loop, not just their slice:

- the part that makes the work **trustworthy** — tests first, a gate that can't be skipped, one
  human sign-off — matters as much to whoever pitched the idea as to whoever wrote the code;
- the part that makes the work **matter** — the hypothesis, its validation status, the learnings in
  the build report — matters as much to the engineer as to the PM.

You'll hear two voices in the stages ahead — one pulled toward *why we're building this*, one toward
*how the rail holds*. They're the same journey, not two tracks; by the end the distinction stops
being useful. There are just builders, and a road they all walk.

This doc is also the **source for the demo deck** — each section maps to a slide (see
[Deck mapping](#deck-mapping)), so the story you read here is the story we tell on stage.

## Why the framework is opinionated

Most agent tools hand you a chat box and a sandbox. This repo demonstrates a **paved road**: one
software-development lifecycle that every builder — a human in an editor or a fully autonomous
agent — walks *identically*, every time. The central bet is that **drift is the enemy**: drift
between people, between the interactive and headless paths, and between "what we said our process
is" and "what actually happened." Every opinion exists to remove a source of drift — and crucially,
the important ones are **gates the builder cannot skip**, not documentation they might read. The
journey below is what walking that road feels like, one step at a time.

## The journey at a glance

```mermaid
flowchart TD
    CTX[(🗂️ 0 · Context layer<br/>product/domain/org docs · architecture · ADRs)]
    CTX -. grounds the hypothesis .-> I
    CTX -. auto-injected at pickup .-> C
    I([💡 Idea<br/>a product hypothesis]) --> C[1 · Claim ONE task<br/>studio marks it inProgress]
    C --> P[2 · Plan + standards gate<br/>self-challenge before any code]
    P --> T[3 · Write the failing test<br/>see it fail, then implement minimally]
    T --> G{4 · /precommit gate<br/>check → build → test<br/>+ re-confirm standards}
    G -- red --> T
    G -- green --> PR[Open PR]
    PR --> CI{Server-side CI/CD<br/>same gate, before deploy}
    CI -- red --> T
    CI -- green --> R[5 · Review + human sign-off]
    R -- changes requested --> T
    R -- approved --> M[Squash-merge to main<br/>branch returns to origin/main]
    M --> D[Vercel deploy<br/>preview per PR · prod on main]
    M --> B[6 · Build report on the task<br/>How / Decisions / Learnings]
    B -. learnings become candidate follow-ups<br/>never auto-created .-> I
    B --> N([Next task])

    classDef gate fill:#dcfce7,stroke:#166534,color:#14532d;
    class G,CI gate;
```

The rest of this doc walks each numbered stage, end to end — from a grounded idea to a reviewed
merge and the build report that feeds the next one.

---

## Stage 0 — The context layer: grounded ideas & grounded execution

Before a single task is claimed, the work already knows where it stands. Ideas and tasks here aren't
free-floating text — they're grounded in a **context layer**: the product's strategy and the
domain's hard-won knowledge, attached to the work and carried with it. This is the floor the whole
journey rests on. Skip it and you get confident-sounding work pointed at the wrong thing; build on
it and every later gate is checking something that was worth building in the first place.

**Grounding the _why_.** An idea doesn't start as a guess typed into a box. The product's strategy,
vision, and PRD are loaded first (`load_product_context`), and a spec-writer drafts the hypothesis
_against_ that context — so the bet is anchored to where the product is actually going, not to
whoever argued hardest. Domain knowledge — the catalogue's quirks, prior research, org conventions —
is attached to the idea (`attach_context`) so it travels with the hypothesis. And because context
attached to an idea is **inherited by every task spun out of it**, that grounding flows downstream
automatically: decompose an idea into tasks and each one starts from the same footing.

**Grounding the _how_.** Execution needs a different kind of context, and it attaches at the task:
the architecture rulebook, design docs, ADRs — the decisions a builder must not silently
re-litigate. These are curated onto the task (`attach_context`, drawing on knowledge-base docs,
indexed documents, or files synced straight from the GitHub repo), and the studio standards ride
along as context too (they are stored as context documents). The constraints arrive _with_ the work,
not in a wiki someone might think to open.

**Injected, not hunted for.** None of this depends on remembering to go read it. When a task is
claimed (`work_on_next_task` — Stage 1), its context — its own, plus whatever it inherited from its
idea — is injected directly into the builder's working context. This very section is the proof: the
task that wrote it was picked up with five repo documents already attached and in front of the
builder — `README.md`, `ARCHITECTURE.md`, `FRAMEWORK.md`, `INITIAL-SETUP.md`, `CLAUDE.md`. A builder can
pull more in on demand (`search_context`) or curate the set (`attach_context` / `remove_context`).

And "the builder" is deliberately literal here: a human reads the injected context in their editor;
an autonomous agent receives the identical payload at pickup. Same grounding, same constraints,
whoever — or whatever — picks up the work. That shared footing is what makes the next stage,
claiming a task, the start of a journey rather than a leap in the dark.

## Stage 1 — Pick up work

A builder doesn't start by typing a prompt — they start by **claiming a unit of work that already
exists**. All of it lives in one place: the studio. Product direction and the work that serves it
are records there, queried over the studio's MCP — not scattered across a `backlog/` folder or a
`ROADMAP.md` that drifts out of date the day after it's written. There is one source of truth, and
everyone — every person, every agent — reads from it.

Work is shaped in two layers. An **idea** is a hypothesis — *what we believe and want to prove* —
carrying its own technical design and moving through validation stages (`backlog → firstLevel →
secondLevel → scaling`, or `failed`, or `bau`) as evidence comes in. A **task** is a concrete slice
of that idea, decomposed into something shippable in one pass. Tasks link back to their idea, so
nothing gets built that can't answer "which bet is this serving?" — the first link in a lineage the
build report later closes (Stage 6).

Then the defining move: a builder claims **exactly one** task (`/work-on-task`, or `work_on_next_task`
to take the oldest in the backlog). Claiming flips it to `inProgress` and stamps it with the
builder's name — and you hold one at a time, no more. That isn't bureaucracy; it's what keeps the
work honest. One task means one focus, one branch, one PR, one clean trace from hypothesis to merge.
It pairs with the branch-hygiene invariant (Stage 5): a builder's branch returns to `origin/main`
between tasks, so there's never a half-finished second thing to collide with. And the context from
Stage 0 lands at exactly this moment — claiming the task is when its attached docs are injected.

Because work is a claimable record rather than a conversation, the same move scales out. A **fleet**
of builders can pull from the one backlog at once: some **supervised** (a human in the loop,
approving at the gate), some **managed** (an autonomous Opus or Sonnet run walking the identical
SDLC headless). Each works in its own git worktree with its own identity and dev-server port, so
many can be mid-task at the same time without stepping on each other — as, while this very section
was being written, a separate agent was independently claiming a `browse` task on its own branch.
One source of truth, one task each, no collisions.

With a task claimed and its context in hand, the builder still hasn't earned the right to write
code. First comes the plan — and the gate that checks it.

## Stage 2 — Plan & the standards gate (touch 1)

The task is claimed; the context is in front of you. The temptation now is to start typing code. The
framework doesn't let you — and that pause is the point. Before a single line of production code, a
builder reads the task's spec and acceptance criteria, reads the seeded **standards** that came in
with the context, sizes the work (*small* or *non-trivial* — a non-trivial task earns a fuller,
synchronously-approved plan), and writes the plan down: one paragraph naming the test that will
prove the change, then a self-challenge of that plan against every standard in the repo.

That self-challenge is the **gate** — the first of two times the standards are enforced on this
change (the second is at the push, Stage 4). It isn't a checklist you skim. It's a literal table,
**one row per standard**, where you state whether the plan honours it and, if not, how the plan
changes before any code is written:

| Standard | Plan respects it? | Adjustment if not |
|----------|-------------------|-------------------|
| Tests run against real services (no mocks) | yes / no / N/A | …how the plan changes, or "—" |
| Leave touched files cleaner (campground, scoped) | yes / no / N/A | …how the plan changes, or "—" |

Filling that table out *honestly* is the work. The two standards in this repo each carry an intent
worth internalising. **Tests run against real services** says every test exercises the real thing —
a real Postgres, a real Svelte component rendered in a real browser, real HTTP to the dev server —
never a mocked `fetch` or a faked database; the only sanctioned stub is a service with
unrecoverable side effects (email, SMS, live payments). It exists because a green suite full of
mocks proves only that your mocks agree with themselves. **Leave touched files cleaner** is the
campground rule, deliberately *scoped*: clean the dead code and unused imports out of the files you
already had to open — and *only* those files. It resolves the tension with minimal-change by
drawing the boundary at "the campsite you're standing in," not the whole forest; anything bigger is
a backlog candidate for the build report, not a detour now.

What makes this more than a process diagram is that **the standards are data, not vibes.** They live
as records seeded into the studio — `standards/*.md` files promoted into the system as context
documents — so they're injected at pickup, challenged here at plan time, and re-listed verbatim at
the push gate. There's no "team principles" wiki that quietly rots while the code drifts away from
it; the rules the builder answers to are the same rules the gate re-checks, because they're the same
records. Add a standard and every builder after you self-challenges against it automatically.

And the timing is the quiet bet of the whole stage: **gate at plan time, not at review time.** A
standard caught while the plan is still a paragraph costs a sentence to fix. The same gap caught in
review — after the code is written, the test is wired to a mock, the PR is open — costs a rewrite
and a round-trip. Moving the gate to *before* the code changes what actually gets built, not just
what gets flagged; the cheapest defect is the one a plan never commits to. A human does this self-
challenge in plan mode; an autonomous agent emits the identical table inline before it writes a
line — same gate, same rows, same moment, whoever holds the task. Only once the plan survives its
own standards does the builder earn the next step: writing the test.

## Stage 3 — Build test-first

Now the code — except the first thing a builder writes still isn't production code. It's the test
that will prove the change, and it's written to **fail**. You add the test, run it, and *watch it go
red* before a line of the feature exists. That sequence isn't ceremony; it's the only way to know
the test can actually catch the thing it claims to. A test written *after* the code, or one that
passes the moment you write it, has told you nothing — it might assert against the wrong value, hit
the wrong path, or quietly test nothing at all. Seeing it fail for the *right reason* first is what
makes the green that comes later trustworthy. Only then do you write the **minimum** code to turn it
green — not the feature you imagine, the one the test demands — and broaden from there.

That discipline is only as good as what the test runs against, which is where the **no-mocks**
standard from Stage 2 stops being a row in a table and becomes the shape of the work. Tests here hit
**real services**: a component test renders a real Svelte component in real headless Chromium
(Playwright); a server-or-database test runs against a **real Postgres**, inserting and cleaning up
its own rows. You never mock `fetch` and never fake the database — because a suite full of mocks
only ever proves your mocks agree with each other, which is exactly the confidence you don't want.
The two runtimes live in one Vitest workspace (a browser project for `*.svelte.test.ts`, a node
project for everything else). The sole sanctioned escape is a service with unrecoverable side
effects — email, SMS, live payments — and a pure unit test is allowed *only* for logic with no I/O
at all, like the search matcher or a pure row-to-domain mapper.

Real-service tests sound expensive until you see that the **architecture is built to make them
cheap.** A builder works inside a rulebook, and its load-bearing rule is a ports-and-adapters data
layer with a fixed five-file shape: `schema.ts` (the Drizzle tables — the one place table shape
lives), `select.ts` (query builders that **take the database connection as a parameter**),
`map.ts` (a pure, one-directional row-to-domain mapper where unit conversions like cents-to-dollars
happen and nowhere else), `queries.ts` (the port the rest of the app calls — it returns domain
types, never raw rows), and `index.ts` (the lazy connection root). That parameter on `select.ts` is
the whole trick: it's the seam that lets the *same* query builder run against the app's pooled
connection in production and against a fresh, throwaway connection in a test — no `$env`, no
singleton, no mock required. Good boundaries and testability turn out to be the same property. The
rest of the rulebook holds the line around that core: domain types live in a neutral home, not
inside whichever feature happened to define them first; new domains are bounded contexts inside one
SvelteKit package, because this is a **modular monolith, not a monorepo** — one deploy target, one
team, no per-package build tax until something genuinely needs its own release cadence.

As you open files to make the test pass, the **campground rule** applies: leave each file you
touched cleaner than you found it — drop the dead code, the commented-out block, the unused import
you had to read past. But *scoped* — only the files this task already made you open. The tempting
refactor two directories over isn't this task's job; it's a line in the build report's learnings, a
candidate someone can choose to pick up, not a detour that quietly balloons the diff. Clean the
campsite you're standing in, not the whole forest.

None of this changes when the builder is an agent: a managed run writes the same failing test,
watches the same red, and earns the same green against the same real Postgres — the rail doesn't
soften because no human is typing. What the builder now holds is a passing test backed by real
services and a minimal implementation underneath it. That's precisely the artifact the next stage
demands, because nothing reaches `main` until the gate runs it all again.

## Stage 4 — Ship through the gate & the CI/CD pipeline

There is exactly one way to push, and it isn't `git push`. A builder ships by running **`/precommit`**
— the single door every change walks through to reach the world. That's a deliberate constraint, not
a convenience: if there are many ways to land code, only one of them gets the checks, and the others
become the holes drift pours through. So the door is narrow on purpose, and behind it runs the
**gate**: `check → build → test`, in that order, every phase green, on a freshly-rebased base. The
order is fail-fast — `check` (svelte-check on the app plus `tsc` on the framework's own code) catches
a type error in a second before `build` spends longer, and `build` proves the bundle compiles before
the slowest, most valuable phase, `test`, runs the real-service suite from Stage 3. A red phase stops
the push. There is no "that test was already failing," no "it's flaky, unrelated" — the rule is the
whole point of having a rule, and a builder fixes the red rather than narrating around it.

Just before the PR opens, the standards come back one more time. `/precommit` **re-lists every seeded
standard** and the builder confirms, with evidence, that this specific changeset meets each — naming
the test that hits the real service, naming the dead import removed from a touched file. This is the
**second of the standards gate's two touches**: the plan was challenged against the standards *before*
any code (Stage 2), and now the finished diff is checked against the same records *before* it can
leave. Gated going in, gated coming out — and both times against the identical seeded standards, so
what was promised at plan time is exactly what's verified at ship time.

Passing the local gate opens the PR — and the gate immediately runs *again*, this time on a server
nobody can lean on. A GitHub Actions workflow (`.github/workflows/ci.yml`) re-runs the **same full
`npm run precommit`** — check → build → test, same order — on every PR into `main` and on pushes to
feature branches. It runs the **same real services**, too: real Chromium for the browser-mode
component tests, a real Neon Postgres reached through a `DATABASE_URL` secret with the schema applied
by `db:push` first — so the no-mocks standard holds in CI exactly as it does locally. If that DB
secret is ever missing the job fails red rather than silently skipping the integration test; the
safety net refuses to pretend. And a safety net is precisely what it is: it does not *replace*
`/precommit`, it backs it up, so that even a change that somehow bypassed the local door still cannot
reach `main` with a red build or test. Defense in depth — the same gate, enforced twice, once where
the builder stands and once where they can't reach.

From there the path to production is short and mechanical. The open PR gets a **Vercel preview
deployment** of its own — a live URL a reviewer can click before approving (which is exactly what the
next stage turns on). Once it earns its single human sign-off and is **squash-merged to `main`**,
Vercel deploys that commit to **production** — preview-per-PR, production-on-`main` — with **Neon
Postgres (via the Vercel Marketplace)** backing both environments. None of this bends for an
autonomous builder: a managed agent runs the identical `/precommit`, opens a PR, and faces the same
red-or-green CI, because the server-side gate neither knows nor cares whether a human or an agent
typed the code. What it does care about is the one thing the gate can't supply on its own — a human
who looks at the change and says yes. That sign-off is the next stage.

## Stage 5 — Review, sign-off & merge

Everything up to here has been a machine checking a machine: the gate runs, CI re-runs it, red is
red no matter whose hands are on the keyboard. Stage 5 is where that deliberately stops. The change
has earned its way to a pull request, and now exactly one thing remains that no rail can do for
you — a human looks at it and decides. This is the **single human touchpoint in the whole
lifecycle**, and it sits here, at the end, *by design*: because every mechanical check has already
passed before the PR opens, the reviewer spends their attention on the only question left that needs
judgment — *is this the right change?* — instead of re-litigating whether the tests are green.

When the builder submits (`submit_for_review`), the studio links the PR to the task, moves the task
into **review**, and **assigns the reviewers** on the GitHub PR automatically — the request for eyes
isn't a chat message that might get missed, it's part of the record. From there it's an ordinary,
rigorous PR review: the reviewer reads the diff, clicks the PR's Vercel preview to see the change
actually running, and either approves or requests changes. **Changes requested** isn't a detour off
the road; it's the same road looping. The builder amends the change, re-runs the *entire* gate
(check → build → test — a change made under review is still a change, and gets re-proven, not waved
through), force-pushes, and re-presents. Nothing merges on a maybe: **explicit approval is required**
before the change can land.

On approval the PR is **squash-merged to `main`** — one commit per task, so the history reads as
cleanly as the lineage does. Then the quiet, load-bearing move: the builder's branch is reset to
mirror **`origin/main`** exactly before the next task begins. No leftover state, no half-finished
second thing, no slow drift between what's on the branch and what's shipped — each task starts from
the same clean line every other task started from. It's the same invariant Stage 1 leaned on when it
promised you only ever hold one task at a time; this is the moment that keeps the promise.

For an autonomous builder the shape is identical, with one substitution: there's no human at the
keyboard to pause for, so **the GitHub PR review itself is the gate**. A managed agent pushes, opens
the PR, and stops — the same approval a human reviewer would give, now given asynchronously on the
PR before anything merges. Same checkpoint, same authority, same "nothing lands without a yes." The
human sign-off doesn't disappear when the builder is an agent; it just moves to where it always
belonged — the review.

## Stage 6 — Visibility & the learning loop

The moment a task merges, the builder writes a **build report** — posted as a comment on the studio
task, always the same three sections: **How we implemented it**, **Decisions off-spec** (where
reality diverged from the plan, and why), and **Learnings**. This isn't paperwork filed and
forgotten; it's how the work explains itself after the fact. The next builder — or the same one in
three weeks, or a reviewer reconstructing a decision a year later — gets the *why*, not just the
diff. The change arrives with its own reasoning attached.

The **Learnings** section is where the next ideas are born — a rough edge noticed in passing, a
refactor worth doing, a standard worth adding. But here the framework is deliberately restrained: a
learning is a **candidate, never a task**. The builder does not spin up follow-on work on its own
authority — that's a hard rule, and it's especially load-bearing when the builder is an agent that
could otherwise breed a backlog by itself. It surfaces the candidate; a human decides whether it
becomes real work. So the loop closes back to ideas (Stage 1) *through a person*, on purpose — the
backlog stays something people chose, not something that multiplied while no one was looking. And
with the report posted, the **lineage** is complete: idea → task → PR → build report, an unbroken
chain. Any commit on `main` walks backward to the hypothesis it served and the review that approved
it; any idea walks forward to the code that tested it. Nothing is orphaned.

Because every step along the way *was* a record — a claimed task, a self-challenge, a gated PR, a
report — the whole journey is **visible without anyone writing a status update**. The studio shows
who's building what, what's sitting in review, what merged and why, across the entire fleet. For a
managed agent there's more still: its run emits **execution events** — the live LLM-and-tool-call
stream — so you can watch *how* it walked the road, call by call, not just read where it ended up.
The work narrates itself, in public, as it happens.

And that is the part to put on stage. The visible feature is the storefront; the **differentiator is
everything underneath it** — that a hypothesis becomes grounded context, becomes one claimed task,
becomes a failing test before any code, becomes a gated and reviewed merge, becomes a build report
that feeds the next hypothesis — and that the *same rails hold* whether a person or an agent walks
them, one at a time or a fleet at once. That background machinery, usually invisible, is the story
worth telling. The journey you just read is the journey we demo: one change, end to end, and the
rails that make it trustworthy no matter who — or what — is building.

---

## Deck mapping

Each section maps to a slide, so this doc is the deck's script. (Aligned with the ~6-minute demo
narrative in [`FRAMEWORK.md`](../FRAMEWORK.md#suggested-demo-narrative-6-minutes); the full
presenter script — commands, talking points, timing — is [`docs/DEMO-SCRIPT.md`](DEMO-SCRIPT.md).)

| Slide | Doc section | The one-line message |
|-------|-------------|----------------------|
| 1 — Hook | For builders | "Engineers, product, agents — all builders on one road. The wall between them is gone." |
| 2 — Why a paved road | Why the framework is opinionated | "Drift is the enemy; the rails that matter are gates you can't skip." |
| 3 — Grounded in context | Stage 0 — The context layer | "Ideas and execution are grounded in real domain/org context — not guesses; injected automatically." |
| 4 — The loop | The journey at a glance (diagram) | "Every change walks this exact path." |
| 5 — Work is a record | Stage 1 — Pick up work | "Work is a typed task you claim — one at a time — not a prompt." |
| 6 — Standards can't be skipped | Stage 2 — Plan & standards gate | "Principles are a gate the builder answers to, before any code." |
| 7 — Test-first, for real | Stage 3 — Build test-first | "The failing test comes first; tests hit real services, never mocks." |
| 8 — One door | Stage 4 — Ship through the gate & CI/CD | "`/precommit` is the only way in; CI re-runs the gate before deploy." |
| 9 — One human touchpoint | Stage 5 — Review, sign-off & merge | "A human signs off once; the branch resets clean every time." |
| 10 — The kicker | Stage 6 — Visibility & the learning loop | "Build reports + lineage make the invisible work visible — and it scales to a fleet." |

---

## Source documents

This narrative synthesizes (and must stay accurate to) the authoritative docs:

- [`FRAMEWORK.md`](../FRAMEWORK.md) — the 7 opinions and the demo narrative.
- [`sdlc/core.md`](../sdlc/core.md) — the one SDLC step sequence both runtimes render.
- [`ARCHITECTURE.md`](../ARCHITECTURE.md) — how code is shaped (ports & adapters, real-services testing, the gate).
- [`standards/`](../standards/) — the active gate (no-mocks; campground rule).
- [`docs/lineage.md`](lineage.md) — Idea → Task → PR → Build Report.
- The studio task model — ideas, tasks, executions, build reports over the studio-ai MCP.
