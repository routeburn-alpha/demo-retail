# Lineage — Idea → Task → PR → Build Report

Opinion 7 of [`../FRAMEWORK.md`](../FRAMEWORK.md): every change traces back to a hypothesis. Nothing
gets built that can't answer "which idea is this serving, and did it work?"

```
  IDEA  (a hypothesis about the product)
   │      e.g. "Shoppers search by everyday words, not our category names —
   │            synonym search will lift add-to-cart on the storefront."
   │      fields: validationStatus (draft → backlog → validated → scaling | failed)
   │
   └─▶ TASK  (a unit of work serving the idea)
        │      e.g. backlog/0001-synonym-search.md
        │      fields: status (ready → in-progress → review → done), spec,
        │              acceptanceCriteria, owner (agent name)
        │
        └─▶ EXECUTION  (one agent's attempt — local session or managed run)
             │      produces commits on a short-lived {id}-{slug} branch
             │
             └─▶ PR  (the reviewable changeset)
                  │      opened by /precommit, squash-merged on approval
                  │
                  └─▶ BUILD REPORT  (posted back onto the task)
                         - How we implemented it
                         - Decisions off-spec
                         - Learnings (incl. follow-on candidates — never auto-created)
```

## Why it matters for the demo

- **Traceability runs both directions.** From a merged PR you can walk back to the task and the
  idea that motivated it; from an idea you can see every task and PR that tested it.
- **The build report closes the loop.** Learnings flow back to the idea, which updates its
  `validationStatus`. That's how a hypothesis gets marked validated or failed — with evidence.
- **No orphan work.** The `/precommit` gate refuses to push without an active task (Opinion 5), and
  a task belongs to an idea. Orphan commits can't enter `main`.

## In this repo

The demo models tasks as files in [`../backlog/`](../backlog/) (a stand-in for a real task API like
studio-ai). Ideas live in the studio (the **platform** product holds the milestone ideas; see
[`SETUP.md`](../SETUP.md) for stack and onboarding). In a production deployment, ideas, tasks,
executions, PRs, and build-report comments are first-class records in the backend, queried via an
MCP server — but the *shape* of the lineage is identical.
