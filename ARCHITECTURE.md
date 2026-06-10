# Architecture — Tarn & Trail Demo Storefront

A minimal, single-page outdoor-gear storefront. It is the customer-facing
artifact for the seeded `demo-alpha / search-discovery` studio in
[studio-ai](https://studio-ai-one.vercel.app/), and exists to make a small
number of "search & discovery" product ideas visible and clickable.

This document describes how the app is put together: its stack, its data flow,
its rendering model, and the seams where future features are meant to be added.

---

## 1. At a glance

| Concern            | Choice                                                        |
| ------------------ | ------------------------------------------------------------ |
| Framework          | SvelteKit 2 + Svelte 5 (runes: `$state`, `$derived`, `$props`) |
| Language           | TypeScript (strict, `checkJs`)                               |
| Bundler / dev      | Vite 5                                                        |
| Styling            | Tailwind CSS 3 + CSS custom properties for the palette       |
| Rendering          | **Fully prerendered** static page (`prerender = true`)        |
| Deploy target      | Vercel via `@sveltejs/adapter-vercel`, configured by `vercel.ts` |
| Tests              | Vitest in **real browser mode** (Playwright/Chromium) + `vitest-browser-svelte` |
| Server-side code   | None. There is no API, no database, no auth.                 |

The entire application is one route (`/`). All "search" happens client-side in
the browser against JSON shipped as static assets.

---

## 2. Directory map

```
demo-retail/
├── src/
│   ├── app.html                     # HTML shell; SvelteKit injects head/body
│   ├── app.css                      # Tailwind directives + :root color tokens
│   ├── lib/
│   │   └── storefront/
│   │       ├── search.ts            # Pure search + synonym-expansion logic
│   │       └── popular-queries.ts   # Static list of zero-results suggestions
│   └── routes/
│       ├── +layout.svelte           # Imports global CSS, renders children
│       ├── +page.ts                 # load(): fetches catalog + synonyms; prerender flag
│       ├── +page.svelte             # The whole UI (header, hero, grid, search, zero-results)
│       └── page.svelte.test.ts      # Browser tests for the page behavior
├── static/
│   ├── catalog.json                 # 15 products (the source of truth for inventory)
│   ├── synonyms.json                # query-term → canonical-term expansions
│   ├── favicon.svg
│   └── products/*.jpg               # one product image per catalog item
├── vercel.ts                        # Vercel project config (framework: sveltekit)
├── svelte.config.js                 # adapter-vercel + vitePreprocess
├── vite.config.ts                   # Vite + Vitest (browser/Playwright) config
├── tailwind.config.js               # palette bound to CSS vars; serif display font
├── postcss.config.js                # tailwind + autoprefixer
└── tsconfig.json                    # extends generated .svelte-kit/tsconfig.json
```

Convention: anything reusable and framework-agnostic lives under
`src/lib/storefront/` and is imported via the `$lib` alias. Route files own the
UI and the data-loading contract.

---

## 3. Rendering & data flow

The app is a **static site**. There is no runtime server work in the request
path; the page and its data are baked at build time and served as files.

```
            build time                            browser (client)
  ┌──────────────────────────────┐      ┌─────────────────────────────────┐
  │ +page.ts  load()             │      │  +page.svelte                   │
  │   prerender = true           │      │    query  = $state('')          │
  │   fetch /catalog.json   ─────┼──┐   │    results = $derived(          │
  │   fetch /synonyms.json  ─────┼┐ │   │       search(query, catalog,    │
  │   → { catalog, synonyms }    ││ │   │              synonyms))         │
  └──────────────────────────────┘│ │   │                                 │
                                   │ │   │  search.ts runs entirely        │
  static/catalog.json   ◄──────────┘ │   │  in-browser on every keystroke  │
  static/synonyms.json  ◄────────────┘   └─────────────────────────────────┘
```

1. **`+page.ts → load()`** fetches `/catalog.json` and `/synonyms.json` in
   parallel and returns `{ catalog, synonyms }` as the page's `data` prop.
   Because `export const prerender = true`, SvelteKit executes this at build
   time and emits a static HTML page plus a data payload — the two JSON files
   are effectively inlined into the prerendered output.
2. **`+page.svelte`** receives `data` via `$props()`. It holds a single piece
   of reactive state, `query`, and derives `results` from it. No fetch, no
   store, no effect — the derivation re-runs automatically when `query` changes.
3. **`search.ts`** is the only "engine." It is a pure function library with no
   imports and no side effects, which is why it is trivial to unit-test and
   safe to run on every keystroke.

The deliberate consequence: the catalog and synonym dictionary are the **only**
data sources, and both are editable plain-JSON files in `static/`. Adding a
product or a synonym requires no code change.

---

## 4. The search engine (`src/lib/storefront/search.ts`)

This file is the conceptual heart of the demo. It is ~50 lines and exports two
functions plus the core types.

### Types

```ts
type Product  = { id; name; category; price; description; imageUrl }
type Synonyms = Record<string, string[]>   // term → list of canonical expansions
```

### `applySynonyms(query, synonyms): string[]`

Produces a set of search phrases to try, given one user query:

- Lowercases and trims the query.
- For each synonym key found as a **whole word** (`\b…\b` regex), it:
  - adds each expansion as its own candidate phrase, **and**
  - builds a `rewritten` phrase where the key is replaced inline by its
    expansions.
- Returns the de-duplicated set: `{ original, …expansions, rewritten }`.

This dual approach (expansions *and* an inline-rewritten phrase) is what makes
multi-synonym queries work. `"rucksack trainers"` yields candidate phrases that
let it match **both** backpacks and trail runners — verified by a test.

### `search(query, catalog, synonyms): Product[]`

A two-pass, AND-of-tokens matcher with a precision-first fallback:

1. Empty query → return the whole catalog (the browse/landing state).
2. Expand the query into phrases via `applySynonyms`.
3. **Pass 1 (strict):** match against `name + category` only. A product matches
   a phrase if **every** token in that phrase is a substring of the haystack;
   the product matches overall if **any** candidate phrase matches.
4. If pass 1 found anything, return it.
5. **Pass 2 (fallback):** repeat including `description` in the haystack.

The strict-first design is intentional and tested: searching `"shell"` returns
the *Storm Cirrus Shell* (category/name hit) but **not** the gloves whose
description merely mentions a "shell mitt." Description matching only kicks in
when name/category matching yields nothing, keeping high-signal results from
being diluted by incidental description mentions.

> Characteristics worth knowing: matching is **substring**, not stemmed or
> fuzzy (no typo tolerance — that's a planned future feature). It is
> case-insensitive. Tokenization is whitespace-split. Everything runs O(catalog
> × phrases × tokens) per keystroke, which is fine at 15 items and would need
> rethinking at scale.

---

## 5. UI structure (`src/routes/+page.svelte`)

One component renders three mutually exclusive states driven entirely by
`query`:

| `query` state              | What renders                                              |
| -------------------------- | -------------------------------------------------------- |
| empty (`''`)               | Hero banner + full catalogue grid + item count           |
| non-empty, `results > 0`   | Result count line + matched-product grid                 |
| non-empty, `results === 0` | `zero-results` section with 5 clickable popular-query pills |

Other UI notes:

- **Search input** is the single source of truth: `bind:value={query}`. A clear
  (✕) button appears once there's text and calls `setQuery('')`.
- **Popular-query pills** come from `popular-queries.ts`. Clicking one calls
  `setQuery(label)`, which flows back through the same reactive `query` →
  `results` derivation — i.e. clicking a pill is identical to typing it.
- **Product cards** carry `data-testid="product-card"`; the zero-results block
  carries `data-testid="zero-results"`. These are the stable hooks the tests
  (and any future automation) rely on.
- The header is sticky; images are `loading="lazy"`; layout is responsive
  Tailwind (2→3→4 column grid).

---

## 6. Styling system

- **Tailwind** is the utility layer (`tailwind.config.js` scans `src/**`).
- The **palette is indirected through CSS custom properties** defined in
  `:root` in `app.css` (`--color-bg`, `--color-surface`, `--color-ink`,
  `--color-muted`, `--color-accent`, `--color-line`). Tailwind's theme maps
  semantic names (`bg`, `surface`, `ink`, …) to those vars, so colors can be
  retheme­d in one place without touching markup.
- A serif **display font** (`font-display` → Georgia) is used for brand/heading
  text to give the storefront its editorial feel.

---

## 7. Testing

Tests live in `src/routes/page.svelte.test.ts` and run under **Vitest in real
browser mode** (Playwright-driven headless Chromium, configured in
`vite.config.ts`). They render the actual Svelte component via
`vitest-browser-svelte` and interact through accessible queries
(`getByLabelText`, `getByRole`, `getByTestId`).

The suite is behavior-focused and doubles as living documentation of the two
headline features plus the search engine's edge cases:

- synonym substitution (`trainers` → trail runners)
- zero-results pills render with correct labels
- clicking a pill re-runs the search
- multi-synonym query returns products from both expansions
- keyword precision (strict pass excludes incidental description matches)
- case-insensitivity
- displayed query is trimmed

Run with `npm test` (single run) or `npm run test:watch`. Note that the test
fixtures define their own small catalog/synonyms inline, so tests don't depend
on `static/*.json`.

---

## 8. Build & deployment

- **`svelte.config.js`** uses `@sveltejs/adapter-vercel`. Because the only route
  is fully prerendered, the build output is effectively a static site.
- **`vercel.ts`** (the TypeScript successor to `vercel.json`, via
  `@vercel/config`) declares `framework: 'sveltekit'` and
  `buildCommand: 'npm run build'`, enabling Vercel preview/production deploys.
- No environment variables, secrets, or backend services are required to build
  or run. `.env*` files are gitignored but unused today.

Scripts:

| Command            | Purpose                                              |
| ------------------ | ---------------------------------------------------- |
| `npm run dev`      | Vite dev server (usually http://localhost:5173)      |
| `npm run build`    | Production build (prerendered output)                |
| `npm run preview`  | Serve the production build locally                   |
| `npm run check`    | `svelte-kit sync` + `svelte-check` type checking     |
| `npm test`         | Vitest browser tests, single run                     |

---

## 9. Design decisions & their rationale

- **Everything client-side and prerendered.** The demo needs to be cheap,
  instantly hostable, and have zero operational surface. Doing search in the
  browser against static JSON means there is no server to run, scale, or secure.
- **Search logic isolated as a pure module.** `search.ts` has no framework
  dependencies, so it can be exhaustively unit-tested and could be lifted into a
  real backend later without rewrite.
- **Data as editable JSON in `static/`.** Catalog and synonyms are content, not
  code. This lets the storefront's inventory and the "shipped" synonym idea
  evolve without touching components.
- **Strict-then-fallback matching.** Encodes a real product-quality decision
  (precision over recall) that the paired studio is meant to showcase, and it's
  pinned by a test so future changes can't silently regress it.

---

## 10. Where future features plug in

This repo is paired with studio-ai task #1557, and follow-up tasks are expected
to extend it (each linked to a real PR). The natural extension points:

| Planned idea            | Most likely touch points                                          |
| ----------------------- | ----------------------------------------------------------------- |
| Typo tolerance          | `search.ts` matching pass (fuzzy/edit-distance before substring)  |
| Product detail page (PDP)| new route `src/routes/products/[id]/`; reuse `Product` type + catalog |
| Browse / category nav   | new route or `+page.svelte` state; filter on `category`           |
| Facets / filters        | extend `search()` signature; add UI controls in `+page.svelte`    |
| Recommendations         | new module in `src/lib/storefront/`; new data file in `static/`   |

The two features shipped today — the **synonym dictionary**
(`static/synonyms.json` + `applySynonyms`) and the **zero-results page**
(`popular-queries.ts` + the `zero-results` block) — are the templates to follow:
a small pure module, optionally a JSON data file, surfaced through one of the
three render states, and covered by a browser test.
