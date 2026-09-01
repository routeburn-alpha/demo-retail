---
title: Hidden Products Never Reach the Storefront
type: standard
---

**Nothing that isn't for sale reaches the browser** — The catalogue has a hidden `elsewhere`
collection (`schema.ts`): real, purchasable products deliberately kept off the storefront, plus
rows flagged `hidden` or `active: false`. Exactly one predicate keeps them off the site:

```
collection = 'core' AND active = true AND hidden = false
```

Answer each of these for this changeset:

- **Which code paths return product rows to a client?** Name every route load, form action, API
  response, or port function in this changeset that puts product data where a browser can see it.
- **Does each one apply the core predicate?** Say where. Going through `listCoreProducts` counts;
  a new query builder does not, unless it re-applies the filter itself.
- **Did you widen a result set?** More rows fetched, looser matching, a new search path, a removed
  `where` — if so, state what stops an `elsewhere`, `hidden`, or inactive product riding along.
- **What proves it?** Name the test that would fail if the filter were dropped, and the real
  service it runs against.

The predicate is currently **inlined in `selectCoreProducts`** (`src/lib/server/db/select.ts`), not
shared. A new query builder therefore starts with *no* filter and inherits no protection — "I used
the existing pattern" is not an answer. State explicitly where your path re-applies it.

A leak here is not a cosmetic bug: it publishes unreleased product names and prices to every
shopper, and it cannot be recalled once a page is served.
