# Routeburn — Demo Storefront

A minimal one-page outdoor-gear storefront used as the customer-facing product for the seeded `demo-alpha / search-discovery` studio in [studio-ai](https://studio-ai-one.vercel.app/).

## Live

- **Production:** https://demo-retail.vercel.app
- **Previews:** every PR into `main` gets its own Vercel preview, linked from the PR's
  `vercel[bot]` check (URL pattern `demo-retail-git-<branch>-routeburn.vercel.app`).

## What it demonstrates

Two visible features that match shipped/validated ideas in the paired studio:

- **Synonym dictionary** (idea: shipped to all customers) — `static/synonyms.json` rewrites the query before matching. Typing `trainers` returns trail runners, `rucksack` returns backpacks, `anorak` returns shell jackets.
- **Zero-results page** (idea: design-partner validating) — a nonsense query shows a row of 5 popular-query pills you can click to re-run the search.

## Local dev

```bash
npm install
npm run dev
npm test
```

The dev server prints a URL (usually `http://localhost:5173`). The page is at `/`.

## Lifecycle

This repo is paired with studio-ai task #1557. Follow-up tasks against ideas in the same studio will add features here (typo tolerance, PDP, browse, facets, recommendations) — each linked to a real PR in this repo.

For how that work actually gets built — the opinionated SDLC every change walks — start with
[`FRAMEWORK.md`](FRAMEWORK.md), or read the narrative walkthrough in
[`docs/BUILDERS-JOURNEY.md`](docs/BUILDERS-JOURNEY.md).
