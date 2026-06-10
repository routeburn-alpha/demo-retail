---
id: 0002
title: Low-stock badge on product cards
idea: "Scarcity cues lift conversion on the storefront"
status: ready
owner: null
---

# Low-stock badge on product cards

## Spec
When a product's inventory is at or below a low-stock threshold (default 5 units), show a
"Only N left" badge on its storefront product card. Products above the threshold show no badge.

## Acceptance criteria
- A product with inventory <= 5 renders an "Only N left" badge with the correct count.
- A product with inventory > 5 renders no badge.
- The threshold is read from a single named constant, not duplicated.

## Notes
A ready task for demoing `/work-on-task` live end-to-end (the inventory table already exists in the
Drizzle schema). Test against real Postgres per the no-mocks standard.
