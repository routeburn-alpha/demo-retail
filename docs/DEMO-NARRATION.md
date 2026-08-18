# studioAI Demo: Full Narration Script

Target runtime: about 8 minutes.
Format: **[SCREEN]** = what is visible. Plain text = what you say.

The **studio-first** demo: one customer complaint walked from idea → design → managed-agent
execution → PR → production, narrated end to end. Its siblings tell the same story from other
angles — [`DEMO-SCRIPT.md`](DEMO-SCRIPT.md) is the ~6-minute *live human* `/work-on-task` walk,
[`DEMO-RUNBOOK.md`](DEMO-RUNBOOK.md) is the repeatable preview-URL flow (both still written around
the low-stock-badge feature). Reset mechanics for this one: [`DEMO-RESET.md`](DEMO-RESET.md) and
`scripts/demo-reset.sh`.

> Demo query verified against the live catalogue on `demo-retail-praxaai.vercel.app`:
> `shel jaket` returns nothing today and returns **Storm Cirrus Shell** + **Aurora Women's 3L Shell**
> once typo tolerance ships. Backup query for the second search: `hikng boot` → **Routeburn Mid GTX**.
> Both are one-edit typos per token, so they land regardless of which edit-distance threshold the
> agent picks. Do **not** use `jckt`, `down jacekt`, or anything mentioning Gore-Tex or "rain" —
> those depend on a threshold of 2, or on words that appear nowhere in the catalogue.

---

## 1. Cold open (0:00 to 0:30)

**[SCREEN: the live retail site. Browse briefly. Filter by Women's, then back to All.]**

This is a retail site running in production. Real customers, real orders.

**[SCREEN: type "shel jaket" into search. Empty result.]**

A customer emailed us this morning. They searched for a shell jacket, fat-fingered it, and got nothing back. We sell two of them.

Pause here.

That is a small bug. What happens next is the part I want to show you.

---

## 2. Frame (0:30 to 1:00)

**[SCREEN: hold on the empty search result.]**

Most AI coding demos stop at a working prototype. The harder questions come after. Can we change this safely in six months. Does anyone know why it was built this way. Did it work.

I am going to take this one customer complaint all the way to production. Every step is on screen. Nothing is skipped.

---

## 3. Capture the idea (1:00 to 2:00)

**[SCREEN: studioAI, agent panel on the left, work in progress on the right.]**

This is studioAI. On the left, the agent. On the right, everything currently in flight.

**[SCREEN: type the request.]**

I am telling it what came in. A customer searched for a shell jacket with a typo and got nothing.

**[SCREEN: agent loads repository context and searches existing ideas.]**

Two things are happening. It is loading the context for the codebase, and it is checking whether anyone is already working on this. Duplicate effort dies here rather than three days from now.

**[SCREEN: agent proposes framing.]**

It proposes framing the work as typo tolerance in search, which is the real problem, not this one misspelling. Create the idea.

---

## 4. Standards and team input (2:00 to 3:00)

**[SCREEN: the idea, with hypothesis field.]**

The idea carries a hypothesis and success criteria. This is not a ticket. It is a claim we are going to test.

**[SCREEN: attach architecture and design guidelines.]**

I am attaching our architecture and technical design guidelines. Anything built from here has to respect them. This is how you keep generated code from becoming code nobody can maintain.

**[SCREEN: developer comment appears suggesting fuzzy matching.]**

A developer on the team reviews this and adds a comment suggesting fuzzy matching. Watch what that comment does.

---

## 5. Technical design (3:00 to 4:00)

**[SCREEN: generate technical design.]**

The design is generated against three things. The codebase, our engineering standards, and the developer's comment.

**[SCREEN: design populates.]**

The human input shaped the implementation. It did not arrive afterward as a review note on something already built. That is the difference between collaboration and cleanup.

**[SCREEN: scroll to the test section.]**

Tests are part of the design, not an afterthought. The change does not count as done until they pass.

---

## 6. Tasks and the gate (4:00 to 5:30)

**[SCREEN: create tasks. Task list appears.]**

The design becomes tasks. First one is the fuzzy matching implementation.

**[SCREEN: assign to managed agent.]**

No developer is free right now and I want this today, so I am handing it to a managed agent.

**[SCREEN: gate prompt requiring the idea to move to building.]**

It will not start. The idea has to move into building first. That is a gate, and there are several. Speed without gates is how teams end up with software they are afraid of.

**[SCREEN: move to building. Execution begins.]**

**[SCREEN: agent phases: bootstrapping, planning, coding, verifying, submitting.]**

I can walk away here. If I watch, I can see exactly where it is. Bootstrapping, planning, coding, verifying, submitting.

**[SCREEN: the failing test being written first.]**

It writes the failing test before it writes the fix. That is our standard, and the agent follows it because we told it to, not because it chose to.

---

## 7. What it cost (5:30 to 6:30)

**[SCREEN: execution complete. Per-phase metrics static on screen.]**

Now the part I care most about.

Every execution reports what it cost. Time in each phase. How many turns the agent took. How many tool calls. Tokens consumed. Estimated dollars.

**[SCREEN: hold on the numbers.]**

Run this across a hundred features and you have something most engineering organizations have never had. The actual unit cost of shipping work, and whether it is going up or down.

That is a number you can take to a board.

---

## 8. Review and ship (6:30 to 7:00)

**[SCREEN: pull request ready notification, then the PR itself.]**

The work arrives as a pull request. A human reviews it. Nothing reaches production without that.

**[SCREEN: merge. Deploy.]**

Merged and deployed.

---

## 9. The fix, live (7:00 to 7:30)

**[SCREEN: the live site. Search "shel jaket." Both shell jackets appear.]**

Same site. Same search. Same typo. The jackets are there.

**[SCREEN: search "hikng boot." The hiking boot appears.]**

And it is not a special case for one word. Any near miss in the catalogue, because that was the actual problem.

---

## 10. Close the loop (7:30 to 8:00)

**[SCREEN: back to the idea, success criteria verified.]**

Back at the idea we started with, the success criteria we wrote at the beginning are verified against the running site. We are not assuming this worked. We measured it.

**[SCREEN: retrospective.]**

The agent also produced a retrospective, so the next execution is more efficient than this one.

**[SCREEN: the idea, showing the full trail from ticket to production.]**

One customer email. One tracked idea. A design shaped by a human. A reviewed change in production. A verified result. And a record of what all of it cost.

That is the whole loop. From studioAI at Praxa.

---

## Alternate section 10, if criteria verification is not yet built

**[SCREEN: retrospective, then the idea's full history.]**

The agent produced a retrospective, so the next run is more efficient than this one.

And the trail is intact. This change in production traces back to the design, the design traces back to a developer's comment, and all of it traces back to one customer who could not find a jacket.

A year from now, when someone asks why this code exists and what it cost, there is an answer.

That is the whole loop. From studioAI at Praxa.

---

## Pre-flight (before you present)

```bash
npm install                                  # node_modules is not checked in
vercel env pull .env.local                   # DATABASE_URL, needed for dev + db-backed tests
scripts/demo-reset.sh --check                # expect: repo IS at the demo baseline
```

Open the storefront at **https://demo-retail-praxaai.vercel.app** — *not* `demo-retail.vercel.app`,
which now serves an unrelated site. Confirm `shel jaket` returns nothing before you start.
