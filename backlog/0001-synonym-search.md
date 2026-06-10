---
id: 0001
title: Synonym search on the storefront
idea: "Shoppers search by everyday words, not our category names"
status: done
owner: alpha
---

# Synonym search on the storefront

## Spec
Shoppers type everyday words ("trainers", "rucksack") that don't match our category names
("trail runner", "backpack"). Add a synonym layer so the storefront search substitutes known
synonyms before matching, and shows popular-query pills on a zero-result search.

## Acceptance criteria
- Typing "trainers" returns trail-runner products via synonym substitution.
- A nonsense query shows the popular-query pills.
- A multi-synonym query ("rucksack trainers") returns BOTH matching categories.
- Matching is case-insensitive and trims surrounding whitespace in the displayed query.

## Notes
This is the worked example already shipped in `src/routes/page.svelte.test.ts` — included here so
`/work-on-task` and `agent-loop.sh` have a real task to demonstrate against. Status is `done`;
copy it to a new id with `status: ready` to demo the loop live.
