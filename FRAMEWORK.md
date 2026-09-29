# The Opinionated SDLC Framework

> Most agent tools give you a chat box and a sandbox. This repo demonstrates a **paved road**:
> an opinionated software-development lifecycle that every agent — human-supervised or fully
> autonomous — is forced to walk, *identically*, every time.

The framework's central bet is that **drift is the enemy**: drift between agents, drift between
the interactive and headless paths, and drift between "what we said our process is" and "what the
agent actually did." Every design choice below exists to remove a source of drift.

This is the document to read first. Each opinion below maps to a concrete artifact you can open.
For a narrative, newcomer-facing walkthrough of how these opinions play out when you ship one change
— and the source for the demo deck — see [`docs/BUILDERS-JOURNEY.md`](docs/BUILDERS-JOURNEY.md).

---

## The 7 opinions

| # | Opinion | Artifact |
|---|---|---|
| 1 | **One SDLC spec, two runtimes.** Human and autonomous agents render the *same* step text from one source. | [`sdlc/core.md`](sdlc/core.md) + [`sdlc/core.ts`](sdlc/core.ts) |
| 2 | **Work is a typed record, claimed from a backlog** — not a prompt typed into chat. | studio-ai task records over MCP (`mcp__studio-ai__work_on_next_task` / `get_tasks`) |
| 3 | **Test-first is non-negotiable and *gated*.** No production code until a failing test exists. | [`.claude/skills/work-on-task/SKILL.md`](.claude/skills/work-on-task/SKILL.md) |
| 4 | **Standards are an active gate, not passive docs.** Injected at pickup, self-challenged before coding, re-confirmed at submit. | [`standards/`](standards/) |
| 5 | **The push gate is the only door, and it's the single human touchpoint.** | [`.claude/skills/precommit/SKILL.md`](.claude/skills/precommit/SKILL.md) |
| 6 | **Branch hygiene is an invariant.** The agent branch always mirrors `origin/main` exactly between tasks. | `precommit` reset + `work-on-task` step 2 |
| 7 | **Unbroken lineage: Idea → Task → PR → Build Report.** Every change traces to a hypothesis. | [`docs/lineage.md`](docs/lineage.md) |

---

## Opinion 1 — One spec, one path

This is the architectural keystone. There is exactly one description of the SDLC step sequence, and
everyone working a task follows it — a person driving Claude Code in a checkout, or an agent
launched into a cloud sandbox.

```
                    sdlc/core.md   (the human-readable contract)
                          │
                          ▼
                    sdlc/core.ts   exports render*() — the canonical step TEXT
                          │
                          ▼
              .claude/skills/{work-on-task,precommit}
                    ONE sequence, whoever is working

       the environment shows through in exactly two places:
         · were you given a task, or do you claim one?
         · is a person driving, or do you state the plan and continue?
```

**Edit the core once and the path updates.** Before a shared core, each consumer kept its own copy
of the process and drift was the default.

This used to be drawn as *two* runtimes — a HUMAN variant and a MANAGED one, with a column of
deltas each. It was wrong twice over. The managed column existed only in this diagram: no
`MANAGED_STEPS`, nothing importing `core.ts`, no code assembling a managed prompt. And a launched
agent, having nothing else to read, followed the human skill — which told it to claim a task it had
already been given, to abort unless `HEAD` was an agent branch, to read its identity from a worktree
file absent in a sandbox, and to wait for an approval nobody was going to give. It shipped by
disobeying its own instructions. Two paths cost more than they bought: the second one rots, and the
first one gets followed by someone it was never addressed to.

**The framework's own code is held to the same gate as the app.** `npm run check` type-checks
`sdlc/core.ts` and the `scripts/` under the same strict config as `src/` (via
`tsconfig.framework.json`), and `npm run check` is part of the `precommit` gate — so a broken
`render*()` signature can no more reach `main` than a broken product change can.

---

## Opinion 4 — Standards as an active gate (the strongest moment)

Coding principles in most repos are documentation an agent *might* read. Here they are **data the
agent is forced to answer to** at three checkpoints:

1. **Seeded** — [`scripts/seed-standards.ts`](scripts/seed-standards.ts) loads
   [`standards/*.md`](standards/) into a `standards` table in the database.
2. **Injected at task pickup** — the agent queries the standards and sees them inline with the
   task spec (see `renderPlanAndSelfChallenge` in `sdlc/core.ts`).
3. **Self-challenged before coding** — the agent fills a table, *one row per standard*, declaring
   how the plan respects each (`work-on-task` step 5b).
4. **Re-confirmed at submit** — `precommit` re-lists the standards and refuses to push until the
   agent confirms each (the `confirmStandards` gate).

The three principles this repo demonstrates:

- **[Tests run against real services (no mocks)](standards/no-mocks.md)**
- **[Leave touched files cleaner (campground rule, scoped)](standards/leave-files-cleaner.md)**
- **[Hidden products never reach the storefront](standards/no-hidden-products-in-search.md)** — the
  security gate; a leak here publishes unreleased products to every shopper

This is the demonstration: *our principles aren't a `CONTRIBUTING.md` nobody reads — they're a
gate the agent literally cannot skip.*

---

## Opinion 7 — The autonomous fleet (optional altitude)

The same SDLC scales to **many isolated agents pulling from one backlog**, with no central
scheduler. See [`docs/lineage.md`](docs/lineage.md) and:

- [`scripts/worktree-init.sh`](scripts/worktree-init.sh) — each agent is a `git worktree` with its
  own identity (`AGENT_NAME`, `AGENT_PORT`) and an isolated dev-server port. Both are read back
  through [`scripts/studio-poll.ts`](scripts/studio-poll.ts) (`whoami` / `port`), never from the
  ambient shell — an inherited export otherwise rebinds an agent to a neighbour's identity or port.
- [`scripts/agent-loop.sh`](scripts/agent-loop.sh) — an outside-the-session poll loop that claims
  one backlog task, launches a session, and idles otherwise. **Note:** this script polls an
  earlier file-based `backlog/` store; the task store has since moved to studio-ai over MCP, so the
  loop's claim step (`work_on_next_task`) is what a current fleet would call instead.

The invariant that makes N parallel agents safe: each agent branch always returns to
`origin/main` between tasks (Opinion 6).

---

## Suggested demo narrative (~6 minutes)

> For the full presenter script — exact commands, talking points, timing, and the enforcement
> moments to pause on — see [`docs/DEMO-SCRIPT.md`](docs/DEMO-SCRIPT.md). The outline below is the
> at-a-glance.

1. **Open `sdlc/core.md` and `core.ts` side by side.** "One spec, two runtimes. Edit once." *(60s)*
2. **Open a task in the studio (studio-ai over MCP).** Point at the embedded acceptance criteria. "Work is a record, not a prompt." *(30s)*
3. **Run `/work-on-task` to the gate.** Stop on the standards self-challenge table + the *failing* test output. The "it can't skip the process" moment. *(2m)*
4. **Implement, then `/precommit`.** Land on the review gate: PR link + diff + the `confirmStandards` re-list. "One human touchpoint." *(1.5m)*
5. **Show the build-report comment + merged PR, trace back to the task.** "Unbroken lineage." *(30s)*
6. **The kicker:** `scripts/worktree-init.sh bravo` + `agent-loop.sh`. "The same SDLC, N agents, each in its own worktree, all pulling one backlog." *(45s)*

---

## What to port vs. what's demo scaffolding

| Layer | Portable essence | Demo scaffolding (swap for your infra) |
|---|---|---|
| SDLC framework | `sdlc/`, `.claude/skills/`, `standards/`, `CLAUDE.md` | — |
| Task backlog | The *contract* (claim → submit) | studio-ai over MCP is the task API (an earlier revision used a `backlog/` file store) |
| Standards gate | The 3-point flow | `standards` table seeded by `seed-standards.ts` |
| Fleet | worktree + per-agent port + poll loop | the specific scripts |
