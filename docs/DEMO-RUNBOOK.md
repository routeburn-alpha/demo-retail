# Demo Runbook — The Async Task Flow, Repeatably

A strict, follow-along script for the **preview-URL demo**: a *managed* agent claims a typed task,
walks the full SDLC autonomously, and opens a PR with a **public Vercel preview** — no merge to
production, so you can run it again and again from a clean "before."

This is the **autonomous / async** companion to [`DEMO-SCRIPT.md`](DEMO-SCRIPT.md) (the ~6-minute
*live human* `/work-on-task` walk). Same road, same gates, same lineage — but here the agent runs
headless and the payoff is a shareable preview URL rather than a merge. Use this one when you want to
show the **fleet / async** story and be able to re-run it on demand.

> **Two hard constraints this script is built around — read them first.**
> 1. **The low-stock badge does not exist yet.** The demo *is* watching the agent build it through
>    the SDLC. Each candidate below is a different threshold + copy the agent implements.
> 2. **Agent chat can create tasks, not ideas** (known gap). This flow is **task-based** — do not try
>    to drive it from an idea until that gap is closed.

The reset mechanics referenced throughout live in [`DEMO-RESET.md`](DEMO-RESET.md).

---

## The candidates (pick one per run)

Each is a self-contained run. They differ only in the badge's threshold and copy, and each is
guaranteed to render against a product the pre-flight sets low.

| # | Copy | Rule | Renders on (pre-flight stock) |
|---|------|------|-------------------------------|
| **A** | "Only N left" (N = stock) | stock ≤ 5 | `down-001` (=3) |
| **B** | "Selling fast" (no number) | stock ≤ 8 | `fleece-001` (=6) |
| **C** | "Last one!" | stock = 1 | `shell-001` (=1) |

Rotating candidates between runs keeps it from feeling canned and avoids "already exists" collisions.

---

## Step 0 · Pre-flight (once per demo *session*, off the clock)

**🖥️ DO**
```bash
git checkout agent/arcterx && git fetch origin main && git reset --hard origin/main
npm run demo:reset -- --seed        # reseed catalogue + force the low-stock spread
git status --porcelain              # expect: empty
```
Confirm `shell-001 / down-001 / fleece-001` are at **1 / 3 / 6**. Without this the badge renders for
*zero* products and the demo fails silently — this is the single most common way this demo dies.

Have ready to alt-tab: **(a)** a terminal in the repo, **(b)** the studio task list, **(c)** the
production storefront, **(d)** the target product's page.

---

## Step 1 · State the "before" · Slide 4–5

**🖥️ DO** — Open the **production** storefront; scroll to the candidate's target product.

**🎙️ SAY** — "Work here doesn't start as a prompt in a chat box — it starts as a **typed record in
the studio**. And notice the product today: no urgency badge, nothing telling a shopper stock is
running out. That's the gap we're going to close — not by me writing code, but by handing a managed
agent a task and watching it walk the road."

**➡️ TRANSITION** — "Let me file that as work and turn an agent loose on it."

---

## Step 2 · Create the managed task · Slides 6

**🖥️ DO** — Create the task (studio UI, agent chat, or MCP `create_task`) with **one** candidate
spec below, as a **managed** run so it executes autonomously and produces a preview:

```
create_task(
  productCode: "arcterx",
  name: "Add a low-stock urgency badge to product cards",
  specification: <the candidate spec below>,
  executionAgent: "managedOpus",
  repo: { repoOwner: "routeburn-alpha", repoName: "demo-retail" }
)
# startExecution defaults true → the run fires on creation. Note the task number N.
```

> **Candidate A — "Only N left"**
> On each product card, show a badge reading **"Only N left"** when that product's inventory stock is
> **≤ 5** (N is the actual stock). No badge above 5. Read stock from the existing `inventory` table.
> Add an accessible label and a test. Follow the SDLC — failing test first.

> **Candidate B — "Selling fast"**
> Same as A, but the badge reads **"Selling fast"** (no number) when stock is **≤ 8**.

> **Candidate C — "Last one!"**
> Same as A, but the badge reads **"Last one!"** only when stock is **= 1**.

**🎙️ SAY** — "One typed record — spec, acceptance criteria, and the context it needs (architecture,
standards) already attached. I pick a *managed* agent, and creating the task *is* launching the run.
From here I don't touch it."

**➡️ TRANSITION** — "Now watch what the road makes it do before it writes a line of production code."

---

## Step 3 · Watch the run walk the gates · Slides 6–8

**🖥️ DO**
```
list_task_executions(N)          # confirm a run started
get_task_execution_events(N)     # live LLM + tool-call stream to narrate
```

**⏸️ PAUSE HERE — the standards gate (touch 1).** Stop when the stream reaches the plan / standards
self-challenge.

**🎙️ SAY** — "Before a single line of production code, it fills out one row per standard — how the
plan respects each. These aren't a `CONTRIBUTING.md` nobody reads; they're **data seeded into the
studio**, injected here and re-checked at push. This repo has two: tests run against real services,
no mocks; and leave every file you touch cleaner. The gate is at *plan time* on purpose — the
cheapest defect is the one the plan never commits to."

**⏸️ PAUSE HERE — test-first, seen failing.** Stop on the red test in the stream.

**🎙️ SAY** — "The first thing it writes isn't the feature — it's the test, run to watch it **fail**.
That red is the point: a test that passes the moment you write it has proven nothing. *Now* it writes
the minimum code to go green, then runs the precommit gate — **check, build, test**, all green — and
opens a PR. A server-side CI pipeline runs that exact same gate again before anything can deploy."

**➡️ TRANSITION** — "The PR's open and green. Here's the part that's actually shareable."

---

## Step 4 · Grab the preview URL (don't guess it) · Slide 9

A managed run lands on `claude/managed-<N>-<timestamp>`; Vercel auto-previews it. The timestamp
isn't guessable, so read the exact URL off the PR:

**🖥️ DO**
```bash
PR=<pr-number>
gh pr view $PR --json comments --jq '.comments[].body' \
  | grep -io 'https://demo-retail-git-[a-z0-9-]*routeburn\.vercel\.app' | head -1
```

---

## Step 5 · Verify on the preview, THEN present ⚠️ · Slide 9

**🖥️ DO** — Poll until the badge is actually in the *served* build (dodges the stale-first-load
trap: the URL can return 200 while still serving the previous build for a few seconds):
```bash
URL=<the vercel url from Step 4>
for i in $(seq 1 20); do
  curl -s "$URL" | grep -qi 'Only .* left\|Selling fast\|Last one' \
    && { echo "badge live ✅"; break; } || { echo "attempt $i: not yet"; sleep 5; }
done
```

**⏸️ PAUSE HERE — the payoff.** Open the URL, scroll to the target product, land on the badge.

**🎙️ SAY** — "This is a real, public, shareable preview of the change — built end to end by an
autonomous agent that walked the same gates a human would — and `main`, production, is **untouched**.
Reviewers were assigned on the PR automatically; a human reads the diff, clicks *this* preview, and is
the single deliberate human touchpoint before anything merges. Idea → task → PR → preview → build
report: an unbroken chain. Any line traces back to the hypothesis it served."

**➡️ TRANSITION** — "And because nothing merged, I can reset and run it again — a different urgency
rule, same road."

---

## Step 6 · Reset (between runs) · Slide 10

**🖥️ DO**
```bash
npm run demo:reset "claude/managed-${N}-<timestamp>"   # drops the branch + its Vercel preview
```
Then in the studio, **soft-delete task N** (and its idea, if one exists). The reset script prints
this reminder. Re-run from **Step 1** with a different candidate; repeat **Step 0** only if the DB got
reseeded.

**🎙️ SAY** — "Every agent branch resets to `origin/main` between tasks — that's the invariant that
lets this scale to a whole fleet: N agents, supervised and fully autonomous, each in its own
worktree, all pulling from one backlog, every one walking the identical road. **That** — the machinery
holding for one builder or a hundred — is the product. The storefront is just what it's pointed at."

---

## Rules that keep it repeatable

- **Never merge to `main`.** The preview *is* the payoff; merging is exactly what breaks
  repeatability. (Contrast with `DEMO-SCRIPT.md`, where the merge is the climax — different demo.)
- **Always verify on the preview (Step 5) before pointing the audience at it.** Don't trust the first
  load.
- **Rotate candidates** (A → B → C) across back-to-back runs so it never looks scripted.
- **If the gate goes red mid-run, that *is* the demo** — "the road doesn't care that I'm on stage."
  Don't apologize; you've just proven the thesis live.

## Recovery

- **Preview 404s or won't update:** give Vercel 30–60s; re-run the Step 5 poll. Confirm the branch
  actually pushed (`gh pr view $PR --json headRefName`).
- **Badge never appears though the run merged green:** you skipped Step 0 — no product is low-stock.
  Run `npm run db:seed:lowstock` and reload.
- **"Already exists" on task creation:** you didn't reset a prior run — soft-delete the old task and
  delete its branch (Step 6), or just switch candidates.
