# Standards — the active gate

These are not documentation an agent *might* read. They are **data the agent is forced to answer
to** at three checkpoints in the SDLC. This is Opinion 4 in [`../FRAMEWORK.md`](../FRAMEWORK.md).

## The three-point flow

```
  standards/*.md                                   (source of truth — version controlled)
        │
        │  tsx scripts/seed-standards.ts           (1) SEED → `standards` table in Postgres
        ▼
  ┌──────────────┐
  │ standards    │   queried at task pickup
  │  table       │ ──────────────────────────────▶ (2) INJECTED into the task context alongside
  └──────────────┘                                     the spec (renderPlanAndSelfChallenge)
        │
        ├──▶ (3) SELF-CHALLENGE TABLE   work-on-task step 5b — one row per standard, BEFORE any
        │                               production code is written
        │
        └──▶ (4) confirmStandards GATE  precommit re-lists every standard; the push is blocked
                                        until the agent confirms each one
```

Mirrors the studio-ai mechanism, where standards are `KBDocument`s of `type: "standard"` served to
the agent at task pickup. Here they are rows in a `standards` table, seeded from the markdown files
in this directory.

## Source of truth: files, not the DB (a deliberate divergence)

In studio-ai the **database record is the source of truth** — standards are governance data that
PMs and leads edit through the product UI, never checked into the repo. This demo flips that: the
**version-controlled `standards/*.md` files are canonical**, and the `standards` table is a seeded
projection of them.

That is an intentional choice for an **engineering-owned codebase**:

- Standards are reviewed in PRs like any other code — a change to the gate is itself gated.
- They are diffable, blame-able, and roll back with the code they govern.
- No separate admin UI is needed.

The trade-off: non-engineers can't edit the gate without a PR. For a product-governance context
(studio-ai's), DB-as-source-of-truth is the right call; for an eng-owned repo, files are. Both
serve the agent the same way at runtime — the seeding step is the only difference.

## The standards in this repo

| File | Title | What it enforces |
|------|-------|------------------|
| [`no-mocks.md`](no-mocks.md) | Tests Run Against Real Services | Real DB / real components in tests; no mocked fetch or fake backends |
| [`leave-files-cleaner.md`](leave-files-cleaner.md) | Leave Touched Files Cleaner | Campground rule, scoped to files the task already opens |

## File format

Each standard is a markdown file with frontmatter. `title` becomes the row's display name; the body
after the frontmatter is the `content` shown to the agent.

```markdown
---
title: <display name>
type: standard
---

<the gate text — phrased as questions the agent must answer>
```

Phrasing each standard as **questions the agent must answer** is what makes the self-challenge table
work — a flat assertion ("no mocks") gives the agent nothing to fill in; a question ("name the real
service each test hits") forces a verifiable answer.

## Adding a standard

1. Add a `standards/<slug>.md` file in the format above.
2. Run `tsx scripts/seed-standards.ts`.

No skill changes are needed — the new standard automatically becomes a row in the self-challenge
table and a line in the `confirmStandards` gate.
