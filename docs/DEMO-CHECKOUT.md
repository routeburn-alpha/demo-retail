# Demo Script — Cart → Checkout, the whole StudioAI platform

A presenter's script that walks one real feature through **every StudioAI surface**: idea
lifecycle, hypothesis and technical design, knowledge docs as agent context, a task dependency graph,
an analysis task with an approve/reject decision, managed and supervised agents, the live event stream,
standards at the gate, and PR review → merge → automatic unblocking.

The feature is Platform idea **#2 "Cart → checkout → order confirmation"**. The schema already has
`carts`, `orders` and `inventory`, but the storefront has no way to buy anything. That gap is the story.

Live time: about **20 minutes**. The longest managed run (checkout) does not fit on the clock, so
part of the demo is pre-baked (see [Pre-bake](#pre-bake-morning-of-the-demo)).

> **Golden rule: idea #2 is the template. Never run the demo on it.** Every run works on a *copy*
> named `Cart → checkout → order confirmation — demo run <YYYY-MM-DD>`. Once a task ships, it can't be
> un-shipped, so the template must stay untouched. The exact-name suffix is also what makes reset
> safe: reset matches that full name, never a keyword (see the "reset deletes real backlog" incident).

Use the same notation as `DEMO-SCRIPT.md` (retired): **🖥️ DO**, **🎙️ SAY**, **⏸️ PAUSE**.

---

## The task graph you are demoing

```
#A  Decide how checkout prevents oversell   analysis     managedOpus  ─┐
#B  Cart port (cookie cart)                 ideaSubtask  managedOpus  ─┼─► #E Transactional checkout (managedOpus)
                                                                       │      ├─► #F Order confirmation + history (managedSonnet)
#B ─► #C Add-to-cart + /cart (managedSonnet) ─► #D Header cart count  │      ├─► #G Confirmation email, stubbed Mailer (supervised)
                                                  (nit)                │      └─► #H demo:reset for orders (techDebt)
```

In the template these are #1132–#1139. A run copy gets new numbers, so write them on your cue card.

---

## Pre-bake (morning of the demo)

The dependency graph has three waves, and each wave is managed run + CI + merge. Bake the first one
ahead of time and leave the second at the exact moment you want to show live.

1. **Copy the template.** Ask Claude: *"stage a fresh checkout demo run from platform idea #2"*.
   That creates the run idea with the same hypothesis, design, attached ADR and 8 tasks with their
   dependencies, and leaves it in **Backlog**. This is a Claude request, not a script. Keep the
   exact name format: the reset matches on it.
2. Move the run idea to **Building**.
3. `execute_task` **#B Cart port**. Review its PR and **merge**. #C becomes ready.
4. `execute_task` **#A Oversell analysis**. Let it finish and **leave it in Review**. Don't approve it:
   approving is a live beat.
5. `execute_task` **#C Add-to-cart + /cart**. Leave the **PR open** with its Vercel preview up
   (`demo-retail-git-<branch>-praxaai.vercel.app`). Load it once to warm it (stale-first-load gotcha).
6. Record the time you started as `RUN_START`, in ISO form (`date -u +%Y-%m-%dT%H:%M:%SZ`). The DB
   reset needs it.

Open and ready to alt-tab: the Studio idea page, the Studio task list, the #C preview URL, the #C PR
on GitHub, and a terminal in the repo.

---

## Run of show (~20 min)

| # | Section | Time | Studio surface |
|---|---------|------|----------------|
| 1 | The gap | 1:30 | — |
| 2 | The idea | 3:00 | Hypothesis, validation stages, technical design, source |
| 3 | Context, not prompts | 2:00 | Knowledge doc attached to the idea |
| 4 | The graph | 2:00 | Dependencies, ready vs blocked, task types, agent mix |
| 5 | A decision, not a PR | 2:30 | Analysis task → approve → dependents unblock |
| 6 | Agents at work | 4:00 | `execute_task`, run list, live event stream |
| 7 | The gate | 2:30 | Standards, PR review, preview URL, merge → webhook ships the task |
| 8 | Human in the loop | 1:30 | Supervised task |
| 9 | Close the loop | 1:00 | Move the idea to Design Partner |

---

### 1. The gap

🖥️ **DO** — Open the production storefront. Search, filter, then try to buy something. There is no
button.
🎙️ **SAY** — The database already models carts, orders and inventory. Nobody ever built the path.
Studio exists to take a product hypothesis to shipped code without losing the plot along the way.

### 2. The idea

🖥️ **DO** — Open the run idea. Walk through the hypothesis, then the technical design.
🎙️ **SAY** — The hypothesis is something we expect to prove *with customers*, separate from the
design. The validation stages (Backlog → On Deck → Building → Design Partner → All Customers) track
whether it's true, not just whether it's coded.
⏸️ **PAUSE** — Point at the "Standards this idea deliberately exercises" section. The design already
says where the risk is.

### 3. Context, not prompts

🖥️ **DO** — Open the attached **ADR: Checkout must never oversell**.
🎙️ **SAY** — It's attached once, at the idea. Every agent that picks up any of the 8 tasks receives it.
Nobody pastes it into a prompt.

### 4. The graph

🖥️ **DO** — Open the task list for the idea. Show #B shipped, #A in review, #C in review, and
everything downstream **blocked**, each with its blocker named.
🎙️ **SAY** — Four task types (analysis, idea subtask, nit, tech debt) and three execution modes. Opus
gets the hard tasks (concurrency, data integrity) and Sonnet gets the routine UI. One task is
deliberately supervised.

### 5. A decision, not a PR

🖥️ **DO** — Open #A. Read the recommendation aloud (conditional decrement vs row lock). **Approve**
it. Refresh the graph: **#E Checkout** flips from blocked to ready.
🎙️ **SAY** — Some work produces a decision, not code. It still gets reviewed, and the approval is
recorded on the task and becomes the input for checkout.
⏸️ **PAUSE** — Mention that rejecting requires a reason, and that the reason is posted as the comment
the re-run works from.

### 6. Agents at work

🖥️ **DO** — `execute_task` **#E Checkout** (managedOpus). Open its run and show the live event
stream: it reads the ADR, writes the race test first, and watches it fail.
🎙️ **SAY** — This agent knows it must lock stock and must re-apply the hidden-products filter. Both
come from the ADR and the standard, not from someone remembering to say so.
⏸️ **PAUSE** — The run takes longer than the slot. Leave it running and come back in section 9.

### 7. The gate

🖥️ **DO** — Switch to the **#C PR**. Show the standards confirmations in the build report and the
reviewers that were auto-assigned. Open the **preview URL**, add a product to the cart and view
`/cart`. **Merge.** Watch #C move to shipped by itself and **#D** unblock.
🎙️ **SAY** — Nobody clicked "done". The merge webhook moved the task.
⏸️ **PAUSE** — The hidden-products standard: the cart lookup is a *new* query, and new queries
inherit no filter. Show the test that POSTs an `elsewhere` product id and gets rejected.

### 8. Human in the loop

🖥️ **DO** — Show **#G Confirmation email** (supervised, still blocked on #E). Explain that a
developer claims it locally with `/work-on-task`.
🎙️ **SAY** — Email is the one stub the no-mocks standard allows, because it's an unrecoverable side
effect. That's a judgement call, so a human owns it.

### 9. Close the loop

🖥️ **DO** — Return to the #E run (or the rehearsal recording if it hasn't finished). Move the idea
to **Design Partner**.
🎙️ **SAY** — Shipped isn't the finish line. The idea is now in front of a design-partner cohort,
measuring cart → order conversion against the hypothesis.

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
