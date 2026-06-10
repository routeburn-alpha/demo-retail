# The Opinionated SDLC Framework

> Most agent tools give you a chat box and a sandbox. This repo demonstrates a **paved road**:
> an opinionated software-development lifecycle that every agent — human-supervised or fully
> autonomous — is forced to walk, *identically*, every time.

The framework's central bet is that **drift is the enemy**: drift between agents, drift between
the interactive and headless paths, and drift between "what we said our process is" and "what the
agent actually did." Every design choice below exists to remove a source of drift.

This is the document to read first. Each opinion below maps to a concrete artifact you can open.

---

## The 7 opinions

| # | Opinion | Artifact |
|---|---|---|
| 1 | **One SDLC spec, two runtimes.** Human and autonomous agents render the *same* step text from one source. | [`sdlc/core.md`](sdlc/core.md) + [`sdlc/core.ts`](sdlc/core.ts) |
| 2 | **Work is a typed record, claimed from a backlog** — not a prompt typed into chat. | [`backlog/`](backlog/) + [`scripts/agent-loop.sh`](scripts/agent-loop.sh) |
| 3 | **Test-first is non-negotiable and *gated*.** No production code until a failing test exists. | [`.claude/skills/work-on-task/SKILL.md`](.claude/skills/work-on-task/SKILL.md) |
| 4 | **Standards are an active gate, not passive docs.** Injected at pickup, self-challenged before coding, re-confirmed at submit. | [`standards/`](standards/) |
| 5 | **The push gate is the only door, and it's the single human touchpoint.** | [`.claude/skills/precommit/SKILL.md`](.claude/skills/precommit/SKILL.md) |
| 6 | **Branch hygiene is an invariant.** The agent branch always mirrors `origin/main` exactly between tasks. | `precommit` reset + `work-on-task` step 2 |
| 7 | **Unbroken lineage: Idea → Task → PR → Build Report.** Every change traces to a hypothesis. | [`docs/lineage.md`](docs/lineage.md) |

---

## Opinion 1 — One spec, two runtimes

This is the architectural keystone. There is exactly one description of the SDLC step sequence,
and both consumers render it.

```
                    sdlc/core.md   (the human-readable contract)
                          │
                          ▼
                    sdlc/core.ts   exports render*() — the canonical step TEXT
                 ┌────────┴─────────┐
                 ▼                  ▼
     work-on-task/SKILL.md    (a managed/headless prompt)
       HUMAN variant            MANAGED variant
     + plan-mode              + setup prelude (clone, install, env)
     + browser E2E            + runs DB sync unconditionally
     + review gate            + no review gate (the PR review is the gate)
                              + ends with submit + comment + DONE
```

The two variants differ *only* where the environment forces them apart. **Edit the core once and
both paths update.** Before a shared core, each path kept its own copy of the process and drift
was the default.

In this demo the human variant is fully wired (the `.claude/skills`). The managed variant is
described in `sdlc/core.md` as the second consumer — the same `render*()` functions would compose
it.

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

The two principles this repo demonstrates:

- **[Tests run against real services (no mocks)](standards/no-mocks.md)**
- **[Leave touched files cleaner (boyscout, scoped)](standards/leave-files-cleaner.md)**

This is the demonstration: *our principles aren't a `CONTRIBUTING.md` nobody reads — they're a
gate the agent literally cannot skip.*

---

## Opinion 7 — The autonomous fleet (optional altitude)

The same SDLC scales to **many isolated agents pulling from one backlog**, with no central
scheduler. See [`docs/lineage.md`](docs/lineage.md) and:

- [`scripts/worktree-init.sh`](scripts/worktree-init.sh) — each agent is a `git worktree` with its
  own identity (`AGENT_NAME`, `AGENT_PORT`) and an isolated dev-server port.
- [`scripts/agent-loop.sh`](scripts/agent-loop.sh) — an outside-the-session poll loop that claims
  one backlog task, launches a session, and idles otherwise.

The invariant that makes N parallel agents safe: each agent branch always returns to
`origin/main` between tasks (Opinion 6).

---

## Suggested demo narrative (~6 minutes)

1. **Open `sdlc/core.md` and `core.ts` side by side.** "One spec, two runtimes. Edit once." *(60s)*
2. **Open a task in `backlog/`.** Point at the embedded acceptance criteria. "Work is a record, not a prompt." *(30s)*
3. **Run `/work-on-task` to the gate.** Stop on the standards self-challenge table + the *failing* test output. The "it can't skip the process" moment. *(2m)*
4. **Implement, then `/precommit`.** Land on the review gate: PR link + diff + the `confirmStandards` re-list. "One human touchpoint." *(1.5m)*
5. **Show the build-report comment + merged PR, trace back to the task.** "Unbroken lineage." *(30s)*
6. **The kicker:** `scripts/worktree-init.sh bravo` + `agent-loop.sh`. "The same SDLC, N agents, each in its own worktree, all pulling one backlog." *(45s)*

---

## What to port vs. what's demo scaffolding

| Layer | Portable essence | Demo scaffolding (swap for your infra) |
|---|---|---|
| SDLC framework | `sdlc/`, `.claude/skills/`, `standards/`, `CLAUDE.md` | — |
| Task backlog | The *contract* (claim → submit) | `backlog/` file store stands in for a real task API |
| Standards gate | The 3-point flow | `standards` table seeded by `seed-standards.ts` |
| Fleet | worktree + per-agent port + poll loop | the specific scripts |
