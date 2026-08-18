# studioAI Demo: Full Narration Script

Target runtime: about 11 minutes.
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

## 1. Cold open (0:00 to 0:45)

**[SCREEN: the live retail site. Browse briefly. Filter by Women's, then back to All.]**

I want to start somewhere ordinary. This is a retail site, and it is running in production right
now — real customers, real orders, real money moving through it. Jackets, boots, the sort of thing
you would buy before a weekend in the hills.

**[SCREEN: type "shel jaket" into search. Empty result.]**

This morning we got an email from a customer. She was looking for a shell jacket, she typed it a
little quickly, and the site told her we had nothing. We sell two of them. They were sitting right
there, in stock, and she never saw them.

Pause here. Let that sit for a second.

That is a small bug. Honestly, it is the smallest kind of bug there is. But what happens to it next
is the part I actually want to show you, because that is where most teams quietly lose their
afternoons — and their confidence.

---

## 2. Frame (0:45 to 1:30)

**[SCREEN: hold on the empty search result.]**

Most AI coding demos end at a working prototype. Something appears on screen, everybody claps, and
the demo is over. But if you have run an engineering team, you know the applause is not where the
difficulty lives. The hard questions all arrive later.

Can we change this safely in six months, when the person who wrote it has moved on? Does anybody
remember why it was built this way, or which trade-off we made on purpose? And the one nobody likes
asking out loud — did it actually work? Did the thing we shipped fix the problem we shipped it for?

So I am not going to stop at a prototype. I am going to take this one customer complaint all the
way through to production, and I am going to leave every step on screen. Nothing skipped, nothing
edited out. If something is slow or awkward, you will see that too.

---

## 3. Capture the idea (1:30 to 3:00)

**[SCREEN: studioAI, agent panel on the left, work in progress on the right.]**

This is studioAI. The layout is deliberately simple: on the left, the agent I am talking to. On the
right, everything the team currently has in flight. One screen, the whole picture.

**[SCREEN: type the request.]**

I am just going to tell it what came in. Plain language, the way I would tell a colleague standing
at my desk: a customer searched for a shell jacket, made a typo, and got nothing back.

**[SCREEN: agent loads repository context and searches existing ideas.]**

Two things are happening while I type, and both matter. It is pulling in the context for this
codebase — what we have, how it is put together, how we work. And it is checking whether anyone on
the team has already raised this.

That second one is small and unglamorous and saves a genuinely surprising amount of pain. Duplicate
effort dies here, in about four seconds, rather than three days from now when two people discover
they have been solving the same problem in different branches.

**[SCREEN: agent proposes framing.]**

Now watch how it frames the work. It does not come back with "fix the word jacket." It proposes
typo tolerance in search, because that is the real problem. One customer told us about one
misspelling, but the thing underneath is that our search is unforgiving, and every customer who
ever types quickly is hitting it.

That reframing is the difference between patching a symptom and fixing a cause. Let us create the
idea.

---

## 4. Standards and team input (3:00 to 4:15)

**[SCREEN: the idea, with hypothesis field.]**

Notice what the idea is carrying. There is a hypothesis, and there are success criteria. This is
not a ticket that says "make search better" and leaves the rest to whoever picks it up. It is a
claim — we believe this change will do this specific thing — and we are going to come back at the
end and check whether we were right.

**[SCREEN: attach architecture and design guidelines.]**

Here I am attaching our architecture and our technical design guidelines. These are the standards
this team already agreed on, written down once. Anything built from this point forward has to
respect them.

This is the piece I would underline if you take one thing away. It is how you stop generated code
from turning into a pile that nobody can maintain. The agent is not inventing house style as it
goes. It is working inside ours.

**[SCREEN: developer comment appears suggesting fuzzy matching.]**

And now a developer on the team reads this and leaves a comment suggesting fuzzy matching. Just a
comment, the way you would drop a thought into a pull request or a thread.

Keep an eye on that comment. I want you to see where it ends up.

---

## 5. Technical design (4:15 to 5:30)

**[SCREEN: generate technical design.]**

Now we generate the technical design, and it is being written against three things at once: the
actual codebase, our engineering standards, and that developer's comment from a minute ago.

**[SCREEN: design populates.]**

There it is. The human input shaped the implementation itself. It did not show up afterwards as a
review note on something already half-built, where the honest options are "argue about it" or "let
it go."

That is the whole difference between collaboration and cleanup. Same comment, same developer,
completely different cost depending on when it lands.

**[SCREEN: scroll to the test section.]**

And scroll down here — the tests are part of the design. Not a follow-up task, not something we get
to if there is time on Friday. The change does not count as done until they pass, and that rule is
written into the plan before a line of code exists.

---

## 6. Tasks and the gate (5:30 to 7:15)

**[SCREEN: create tasks. Task list appears.]**

The design becomes tasks. First one up is the fuzzy matching implementation — the substance of the
change.

**[SCREEN: assign to managed agent.]**

Now, in a perfect week I would hand this to a developer. But nobody is free right now, and I would
like this fixed today rather than in the next sprint, so I am going to give it to a managed agent.

**[SCREEN: gate prompt requiring the idea to move to building.]**

And it refuses to start.

I love this moment, so let me stay on it. The idea has to be moved into building before any
execution begins. That is a gate, and it is one of several sitting along this path.

It is tempting to read that as friction, and in the moment it does feel like friction. But speed
without gates is exactly how teams end up with a codebase they are quietly afraid of — everything
went fast, nobody can say what happened, and now every change feels like a risk. The gates are what
make the speed safe to keep.

**[SCREEN: move to building. Execution begins.]**

**[SCREEN: agent phases: bootstrapping, planning, coding, verifying, submitting.]**

Now it runs, and I can genuinely walk away here — go to a meeting, get a coffee. But if I do want
to watch, I can see precisely where it is at any moment. Bootstrapping. Planning. Coding.
Verifying. Submitting.

No black box, no spinner that means "something is happening somewhere."

**[SCREEN: the failing test being written first.]**

And look at this one. It writes the failing test before it writes the fix.

That is our standard. It is doing that because we told it to, in the guidelines we attached a few
minutes ago — not because it happened to feel like it on this particular run. That is the
difference between a habit and a hope.

---

## 7. What it cost (7:15 to 8:30)

**[SCREEN: execution complete. Per-phase metrics static on screen.]**

Right. This is the part I care most about, and it is usually the part that gets left out.

**[SCREEN: hold on the numbers.]**

Every execution reports what it cost. Time spent in each phase. How many turns the agent took. How
many tool calls it made. Tokens consumed. Estimated dollars.

Sit with that for a moment, because for one feature it looks like trivia. Now run it across a
hundred features, across a quarter, across a team.

What you have then is something most engineering organizations have genuinely never had: the real
unit cost of shipping work, and — more importantly — whether that number is going up or down over
time.

Every leader in this room has been asked what engineering costs and has had to answer with a
headcount number and a shrug. This is a different kind of answer. This is a number you can take to
a board and defend.

---

## 8. Review and ship (8:30 to 9:10)

**[SCREEN: pull request ready notification, then the PR itself.]**

The work arrives the way work always arrives here: as a pull request. A human reads it, a human
approves it. Nothing reaches production without a person putting their name on it, and that is not
a setting we plan to relax.

The agent moved fast. It did not get to skip the part where somebody is accountable.

**[SCREEN: merge. Deploy.]**

Merged. Deployed. That is live.

---

## 9. The fix, live (9:10 to 9:50)

**[SCREEN: the live site. Search "shel jaket." Both shell jackets appear.]**

Same site. Same search box. The same typo our customer made this morning.

And there they are — both shell jackets, exactly where she should have found them the first time.

**[SCREEN: search "hikng boot." The hiking boot appears.]**

And this is not a special case bolted on for one word. Let me try something completely different —
a misspelled hiking boot. There it is too.

Any near miss in the catalogue now works, because the near miss was the actual problem. We fixed
the cause, not the complaint.

---

## 10. Close the loop (9:50 to 10:45)

**[SCREEN: back to the idea, success criteria verified.]**

Now let us go all the way back to where we started. Here is the original idea, and here are the
success criteria we wrote at the very beginning — before any code existed — verified against the
running site.

We are not assuming this worked. We are not taking the agent's word for it, and we are not taking
mine. We measured it.

**[SCREEN: retrospective.]**

The agent also wrote a retrospective on its own run: what went well, what it stumbled over, what it
would do differently. Which means the next execution starts smarter than this one did. The system
compounds.

**[SCREEN: the idea, showing the full trail from ticket to production.]**

So here is the whole thing in one view.

One customer email. One tracked idea with a hypothesis attached. A design shaped by a real
developer's comment before the build, not after. A reviewed, human-approved change in production. A
verified result. And an honest record of what every bit of it cost.

That is the whole loop — not a prototype, a loop. From studioAI at Praxa.

---

## Alternate section 10, if criteria verification is not yet built

**[SCREEN: retrospective, then the idea's full history.]**

The agent wrote a retrospective on its own run — what went well, what it stumbled over, what it
would do differently next time. So the next run starts smarter than this one did.

And look at what is still intact: the trail. This change in production traces back to the design.
The design traces back to a developer's comment. And all of it traces back to one customer who
could not find a jacket we had sitting in stock.

A year from now, when somebody new opens this file and asks why this code exists and what it cost
us — there is an answer waiting for them. That is rarer than it should be.

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
