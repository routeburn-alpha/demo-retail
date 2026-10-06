# Standards

One markdown file per standard, each written as a question. They are version controlled and reviewed in PRs like any other code.

The agent applies them at two points, both visible in the Studio run:

1. **Before coding** (`work-on-task` skill): it prints a `Standard | Plan respects it? | Adjustment` table, one row per file in this folder, and changes the plan where a row says no.
2. **Before shipping** (`precommit` skill): it prints a `Standard | Met? | Evidence` table and puts it in the build report's `summary`, so the run's Outcome tab shows it.

To add a standard, add a file here. Nothing else needs to change.
