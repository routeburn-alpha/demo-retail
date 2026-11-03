# Demo Script — Cart → Checkout, the whole StudioAI platform

A presenter's script that walks one real feature through **every StudioAI surface**: idea
lifecycle, hypothesis and technical design, knowledge docs as agent context, a task dependency graph,
an analysis task with an approve/reject decision, managed and supervised agents, the live event stream,
standards at the gate, and PR review → merge → automatic unblocking.

The feature is Platform idea **#2 "Cart → checkout → order confirmation"**. The schema already has
`carts`, `orders` and `inventory`, but the storefront has no way to buy anything. That gap is the story.

**Two versions, one script.** The **short** version (~20 min) is every section's main beats. The
**long** version (~40 min) adds each section's **Long version adds** block, which covers the rest of
what shipped in Studio between September and November 2026. Both share the same pre-bake and reset.
The longest managed run (checkout) doesn't fit on either clock, so part of the demo is pre-baked (see
[Pre-bake](#pre-bake-morning-of-the-demo)).

> **Golden rule: idea #2 is the template. Never run the demo on it.** Every run works on a *copy*
> named `Cart → checkout → order confirmation — demo run <YYYY-MM-DD>`. Once a task ships, it can't be
> un-shipped, so the template must stay untouched. The exact-name suffix is also what makes reset
> safe: reset matches that full name, never a keyword (see the "reset deletes real backlog" incident).

Notation: **🖥️ DO** is what you do on screen, **🎙️ SAY** is what you say, **⏸️ PAUSE** is where you
stop and let it land.

---

## The task graph you are demoing

```
#A  Decide how checkout prevents oversell   analysis     managedOpus  ─┐
#B  Cart port (cookie cart)                 ideaSubtask  managedOpus  ─┼─► #E Transactional checkout (managedOpus)
                                                                       │      ├─► #F Order confirmation + history (managedSonnet)
#B ─► #C Add-to-cart + /cart (managedSonnet) ─► #D Header cart count  │      ├─► #G Confirmation email, stubbed Mailer (supervised)
                                                  (nit)                │      └─► #H demo:reset for orders (techDebt, managedSonnet)
```

In the template these are #1132–#1139. A run copy gets new numbers, so write them on your cue card.

---

## Before you start (once per environment)

Several features are behind toggles or roles. Confirm each one you plan to show during the
rehearsal, not on the day.

| Needed for | Check | Who can set it |
|---|---|---|
| MicroVM agent (§4, long) | Org toggle `microvmAgents` is on (off by default) | Org admin |
| Warm start (§6, long) | Org switch for agent warming is on, and a warm pool exists for this repo | Org admin (switch), platform operator (pool, at `/operator/warms`) |
| Proof receipts (§7, long) | The proof toggle is on | Org admin |
| Definition of Ready prompts (§2, §4, long) | The per-org readiness toggle is on | Org admin |
| Slack notifications (§7) | The org's Slack channel for task posts is set | Org admin |
| Flow v2 (§9, long) | You know the hidden Flow v2 route | — |

---

## Pre-bake (morning of the demo)

The dependency graph has three waves, and each wave is managed run + CI + merge. Bake the first one
ahead of time and leave the second at the exact moment you want to show live.

1. **Copy the template.** Open the chat (**Cmd/Ctrl+Shift+K**) and ask: *"stage a fresh checkout demo
   run from platform idea #2"*. That creates the run idea with the same hypothesis, design, attached
   ADR and 8 tasks with their dependencies, and leaves it in **Backlog**. Keep the exact name format:
   the reset matches on it.
2. Move the run idea to **Building**.
3. On the run idea's page, ask the chat to **run #B Cart port** (or call `execute_task`). Review its PR
   and **merge**. #C becomes ready.
4. Run **#A Oversell analysis**. Let it finish and **leave it in Review**. Don't approve it: approving
   is a live beat.
5. Run **#C Add-to-cart + /cart**. Leave the **PR open** with its Vercel preview up
   (`demo-retail-git-<branch>-praxaai.vercel.app`). Load it once to warm it (stale-first-load gotcha).
6. Record the time you started as `RUN_START`, in ISO form (`date -u +%Y-%m-%dT%H:%M:%SZ`). The DB
   reset needs it.

Open and ready to alt-tab: the Studio idea page, the Studio task list, the #C task page, the #C preview
URL, the #C PR on GitHub, and a terminal in the repo. For the long version, also open Slack and the
Flow v2 route.

---

## Run of show

| # | Section | Short | Long | Studio surface |
|---|---------|-------|------|----------------|
| 1 | The gap | 1:30 | 2:00 | Storefront; Studio home (long) |
| 2 | The idea | 3:00 | 5:00 | Hypothesis, validation funnel, technical design; idea improver and readiness (long) |
| 3 | Context, not prompts | 2:00 | 4:00 | Attached ADR, chat context awareness; uploads and Context Graph (long) |
| 4 | The graph | 2:00 | 4:00 | Dependencies, live status on rows, task types, agent mix; MicroVM (long) |
| 5 | A decision, not a PR | 2:30 | 4:00 | Analysis task, chat comparison table, approve page action |
| 6 | Agents at work | 4:00 | 7:00 | Run from the idea via chat, live event stream, test seen failing; run detail page (long) |
| 7 | The gate | 2:30 | 6:00 | Outcome section, standards tables, preview, merge → shipped, notifications |
| 8 | Human in the loop | 1:30 | 2:00 | Supervised task |
| 9 | Close the loop | 1:00 | 6:00 | Design Partner; follow-ons, Flow v2, Fitness (long) |
|   | **Total** | **~20** | **~40** | |

---

### 1. The gap

🖥️ **DO** — Open the production storefront. Search, filter, then try to buy something. There is no
button.
🎙️ **SAY** — The database already models carts, orders and inventory. Nobody ever built the path.
Studio exists to take a product hypothesis to shipped code without losing the plot along the way.

**Long version adds**
🖥️ **DO** — Start on the **Studio home** instead: Studio Documents (real Knowledge documents,
streaming in), Validate (newest first), and Team under Execution Agents. Then switch to the storefront.
🎙️ **SAY** — This is the studio: what we know, what we're validating, and who (and what) does the work.

### 2. The idea

🖥️ **DO** — Open the run idea. Walk through the hypothesis, then the technical design. Show the
validation funnel: On Deck and Building share one section.
🎙️ **SAY** — The hypothesis is something we expect to prove *with customers*, separate from the
design. The validation stages (Backlog → On Deck → Building → Design Partner → All Customers) track
whether it's true, not just whether it's coded.
⏸️ **PAUSE** — Point at the "Standards this idea deliberately exercises" section. The design already
says where the risk is.

**Long version adds**
🖥️ **DO** — Run the **Definition of Ready** check on the idea. Then open the studio's **validation
funnel editor** and show that stages can be added, renamed, reordered and recoloured, and that removing
a stage that holds ideas is refused. Close it without saving.
🖥️ **DO** — Show the **idea improver**: New Idea → *Start with the agent*. The draft opens with a
progress strip and the agent's first question. Answer one question, then rename the draft
`Cart → checkout → order confirmation — demo run <YYYY-MM-DD> improver` so the reset archives it.
🎙️ **SAY** — Ideas don't have to start as a blank form. The agent interviews you, and readiness is
checked before anyone builds.

### 3. Context, not prompts

🖥️ **DO** — Open the attached **ADR: Checkout must never oversell**. Open the chat on the idea page
and ask what it knows about this idea: it names the ADR.
🎙️ **SAY** — It's attached once, at the idea. Every agent that picks up any of the 8 tasks receives it.
Nobody pastes it into a prompt.

**Long version adds**
🖥️ **DO** — In the chat composer, type **@** and pick a Knowledge doc to show the document picker. Then
**upload a file** to the run idea's Attached context (it's labelled as uploaded from the idea), and
open **Attach from Context Graph** to show the same dialog works for ideas, tasks and product context.
If a SharePoint site is connected as a source, show its documents synced alongside.
🎙️ **SAY** — Context comes from wherever your team already keeps it, and it's scoped to the work.
⏸️ **PAUSE** — Attach only to the **run idea**, never the template. The upload stays in Knowledge after
the reset: delete it by hand (see [Long-version residue](#long-version-residue)).

### 4. The graph

🖥️ **DO** — Open the task list for the idea. Show #B shipped, #A in review, #C in review, and
everything downstream **blocked**, each with its blocker named. Task rows show each active run's live
status.
🎙️ **SAY** — Five task types (analysis, idea subtask, nit, tech debt, bug) and a choice of execution
agent per task: managed Opus, Sonnet or Haiku, self-hosted, MicroVM, or a supervised human. Opus gets
the hard tasks (concurrency, data integrity) and Sonnet gets the routine UI. One task is deliberately
supervised.

**Long version adds**
🖥️ **DO** — Run the **Definition of Ready** check on **#E**. Then switch **#D Header cart count** to a
**MicroVM** agent (`microvmHaiku`). Needs the `microvmAgents` toggle.
🎙️ **SAY** — A one-line UI nit doesn't need a frontier model in a full sandbox. MicroVM runs use a
minimal tool set, about 75% fewer input tokens on the same task, and every run records its estimated
cost.

### 5. A decision, not a PR

🖥️ **DO** — Open #A. Ask the chat to compare the options as a table (conditional decrement vs row lock
vs serializable + retry). Read the recommendation aloud. **Approve** it with the page action. Refresh
the graph: **#E Checkout** flips from blocked to ready.
🎙️ **SAY** — Some work produces a decision, not code. It still gets reviewed, and the approval is
recorded on the task and becomes the input for checkout.
⏸️ **PAUSE** — Mention that rejecting requires a reason, and that the reason is posted as the comment
the re-run works from.

**Long version adds**
🖥️ **DO** — Before approving, open **Send back** to show it collects the reason on the page. Cancel,
then approve.
🎙️ **SAY** — Sending back tells the agent without making anyone write a prompt. **Reprocess** on a task
in review works the same way: it needs a comment first, and the re-run works from that comment.

### 6. Agents at work

🖥️ **DO** — On the idea page, ask the chat to **run #E Checkout** (managedOpus). Open its run and show
the live event stream: it reads the ADR, prints the standards table, writes the race test first, runs
that file alone, and watches it **fail**.
🎙️ **SAY** — This agent knows it must lock stock and must re-apply the hidden-products filter. Both
come from the ADR and the standard, not from someone remembering to say so. And the red test is the
point: a test that passes before the change proves nothing.
⏸️ **PAUSE** — The run takes longer than the slot. Leave it running and come back in section 9.

**Long version adds**
🖥️ **DO** — Open the **run detail page**: the launch manifest, the warm history and collapsible warm
turn (if the run claimed a warm sandbox), and the log download. Point at **Stop**, but don't press it.
🎙️ **SAY** — With warm pools on, the sandbox was already installed and seeded before the task arrived,
so the run starts on the work, not the setup. If the stream drops, it resumes from the last event.

### 7. The gate

🖥️ **DO** — Open the **#C task page**. The **Outcome section** holds the PR, the preview, the build
report and any follow-ons, with a call to action under the title that depends on your role. Show the
build report's **standards table** (the run also printed one before coding) and the reviewers
auto-assigned on the PR. Open the **preview URL**, add a product to the cart and view `/cart`.
**Merge.** Watch #C move to shipped by itself, **#D** unblock, and the status-change notification
arrive in the chat.
🎙️ **SAY** — Nobody clicked "done". The merge webhook moved the task, and the owner was told.
⏸️ **PAUSE** — The hidden-products standard: the cart lookup is a *new* query, and new queries
inherit no filter. Show the test that POSTs an `elsewhere` product id and gets rejected.

**Long version adds**
🖥️ **DO** — Show the **Proof** verification receipt on #C and the studio ledger (needs the proof
toggle). Switch to **Slack**: posts about #C reply in one thread under the first post.
🎙️ **SAY** — Every shipped task leaves a receipt of how it was verified, and the conversation about a
task stays in one place wherever it happens.

### 8. Human in the loop

🖥️ **DO** — Show **#G Confirmation email** (supervised, still blocked on #E). Explain that a developer
gives the task to Claude Code in the repo, which follows the same `work-on-task` and `precommit` skills
and the same standards gate as the managed runs.
🎙️ **SAY** — Email is the one stub the no-mocks standard allows, because it's an unrecoverable side
effect. That's a judgement call, so a human owns it.

**Long version adds**
🖥️ **DO** — Ask the chat *"what happened to my tasks while I was away?"*. It answers from your
notifications.

### 9. Close the loop

🖥️ **DO** — Return to the #E run (or the rehearsal recording if it hasn't finished). Move the idea
to **Design Partner**.
🎙️ **SAY** — Shipped isn't the finish line. The idea is now in front of a design-partner cohort,
measuring cart → order conversion against the hypothesis.

**Long version adds**
🖥️ **DO** — In a finished run's Outcome section, create a task from its **proposed follow-on work**
(on the run idea, so the reset archives it). Open **Flow v2**: the shipped chart, cycle time by stage,
and the per-task scatterplot. Finish on the **Fitness** tab: each check with the open tasks it found
(the security-advisory tasks in Search came from it), with one-click Execute.
🎙️ **SAY** — The agents propose the next work, the flow metrics show how fast it moves, and Fitness
keeps finding the work nobody filed.

---

## Reset (after every run)

One command, run from a clean checkout of `main` once the run's PRs are closed or reverted:

```bash
npm run demo:reset -- --checkout --db-since <RUN_START> [<run-branch>]
```

| State | What the run changes | What the reset does |
|-------|----------------------|---------------------|
| **Studio** | Run idea + 8 tasks, shipped/review statuses, run history | Archives (and blanks) every idea named exactly `Cart → checkout → order confirmation — demo run <YYYY-MM-DD>[ label]` in `platform`, plus the tasks linked to it. The template, idea #2, cannot match. |
| **Code on `main`** | Merged PRs (#B, #C, …) are **live on production** | Restores all of `src/` to the `demo-baseline/checkout` tag in the working tree (added files removed, edited files restored) and **warns** if `main` itself still carries checkout code. Production only changes when you revert on `main` (Gotcha 1). |
| **Branches + previews** | Unmerged run branches and their Vercel previews | Deletes `<run-branch>` locally and on origin, which drops its preview. Repeat per branch. |
| **Database** | Stock decremented; carts and orders created | `--db-since` gives back the stock the run's orders consumed, then deletes orders (and order items) and carts (and cart items) created since `RUN_START`, in one transaction. Safe on the shared Neon database. |

**Check before the next run:** `npm run demo:reset -- --checkout --check` changes nothing. It fails
on residue anywhere in the working tree, on any `src/` file that differs from the tag, on a baseline
tag that moved on origin, and on a failing or skipped security suite. It only says Ready when all
of those pass.

**Studio dry run first.** The reset runs the Studio step with `--apply`. To see what it would archive
before running it, use `npm run demo:reset:studio -- --checkout`. Each piece also runs on its own:
`npm run demo:reset:db -- --since <RUN_START>` for the database alone.

### Long-version residue

The reset only knows about the run idea and its tasks. The long version can leave these behind, so
clear them by hand:

- **Uploaded files** (§3) stay in Knowledge. Delete them.
- **The idea-improver draft** (§2) is archived only if you renamed it to the run name with a label.
  Check the dry run lists it.
- **Follow-on tasks** (§9) are archived only if they were created on the run idea.
- **Validation stage edits** (§2) are studio-wide. If you saved one, undo it.
- **Slack posts and notifications** can't be undone. They're harmless, but expect them.

### Pre-flight: keep the baseline tag current

The code reset diffs **all of `src/`** against `demo-baseline/checkout`, so real work merged to
`main` after the tag looks like checkout residue and gets reverted. When genuine (non-demo) work
lands, re-point the tag at a `main` commit that has no cart/checkout/orders code:

```bash
git tag --force demo-baseline/checkout <commit> && git push --force origin demo-baseline/checkout
```

Other clones pick it up automatically: the reset fetches baseline tags with `--force`, and `--check`
flags a stale local tag.

### Database: never reseed

⚠️ `DATABASE_URL` is a **shared Neon** database. **Do not run `db:seed` or `db:push`** to "reset":
they rewrite state that other people and agents depend on. `demo:reset --seed` refuses unless
`DATABASE_URL` points at `localhost`. Use `--db-since` instead.

### Gotchas

1. **Merged code is on production** until the revert lands. The checkout uses stubbed payment, so
   anyone on the live site can place fake orders in that window. Revert the same day.
2. **Residue collapses the next run.** If any checkout code survives the revert, the next run's
   agents find it half-built and only wire it up (the #1149 failure). `demo:reset -- --checkout --check`
   must say Ready before you start.
3. **Task #H (demo:reset for orders) is inside the demo**, so its code is reverted with everything
   else. It is not the reset tool. The permanent tooling above (task #1140) lives on `main`, outside
   the demo.
4. **Don't edit the ADR live.** It's shared by the template and every run copy.
