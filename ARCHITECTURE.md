# Architecture & Technical-Design Rulebook — Routeburn

This is the **authoritative technical-design context** for the Routeburn storefront and the
`search-discovery` studio that drives it. Every spec, idea technical-design, and task in studio-ai
should be written and reviewed against the rules below. It is intentionally **prescriptive**: it
uses **MUST / SHOULD / MAY** the way [`standards/`](standards/) does, because in this repo design
conventions are a gate, not a suggestion (see [`FRAMEWORK.md`](FRAMEWORK.md), Opinion 4).

> Read order for a new agent: [`FRAMEWORK.md`](FRAMEWORK.md) (the SDLC) → this file (how code is
> shaped) → [`standards/`](standards/) (the active gate) → [`sdlc/core.md`](sdlc/core.md).

---

## 1. At a glance

| Concern          | Choice                                                                 |
| ---------------- | --------------------------------------------------------------------- |
| Framework        | SvelteKit 2 + Svelte 5 (runes: `$state`, `$derived`, `$props`)         |
| Language         | TypeScript (strict, `checkJs`); framework code held to the same gate   |
| Persistence      | Postgres (Neon, via Vercel Marketplace) + Drizzle ORM (`postgres-js`)  |
| Data access      | Layered ports-and-adapters under `src/lib/server/db/`                  |
| Rendering        | Catalog loaded **server-side** from Postgres (`+page.server.ts`); search runs client-side |
| Styling          | Tailwind CSS 3 + CSS custom-property palette                          |
| Deploy target    | Vercel via `@sveltejs/adapter-vercel`, configured by `vercel.ts`      |
| Tests            | Vitest two-runtime workspace — real browser (Playwright) + real Postgres |
| Build/test gate  | `npm run precommit` = `check && build && test`, run pre-push by the agent |

> **Note on history:** earlier revisions of this app were fully client-side with no database. That
> is no longer true — a real Drizzle/Postgres domain layer (products, inventory, carts, orders, and
> a hidden `elsewhere` collection) now backs the storefront. Treat this document, not git memory or
> older prose, as ground truth.

---

## 2. The layered data architecture (ports & adapters)

The data layer is **hexagonal-lite**: the application talks to a small port that returns *domain
types*, and the persistence details (Drizzle, Postgres, cents-vs-dollars) stay behind an adapter +
an anti-corruption mapping. The current `src/lib/server/db/` layer is the reference implementation.

```
  routes/+page.server.ts          ← consumer: calls the PORT, never the ORM
        │  listCoreProducts()
        ▼
  db/queries.ts                   ← PORT / application service (returns domain Product[])
        │ composes
        ├── db/select.ts          ← ADAPTER: query builders, take `database` as a PARAMETER (DI seam)
        ├── db/map.ts             ← ANTI-CORRUPTION: pure ProductRow → Product (cents → dollars)
        └── db/index.ts           ← COMPOSITION ROOT: lazy singleton connection, env, Neon pooler
  db/schema.ts                    ← PERSISTENCE MODEL: Drizzle tables + $inferSelect/$inferInsert
```

### 2.1 Data layer — REQUIRED shape

Every bounded context that touches the database **MUST** provide these roles (one file each; small
contexts MAY co-locate, but the responsibilities stay distinct):

| File         | Single responsibility                                              | Rules |
| ------------ | ----------------------------------------------------------------- | ----- |
| `schema.ts`  | Drizzle table definitions + inferred row types                     | The **only** place table shape lives. Export `$inferSelect`/`$inferInsert` types; never hand-write row types. |
| `select.ts`  | Query *builders*                                                    | **MUST** take the `database` (or transaction) as a **parameter** — never import the singleton. This is the seam that makes integration tests possible without `$env`. |
| `map.ts`     | Pure persistence→domain mapping                                    | **MUST** be pure (no DB, no `$env`, no I/O). All unit conversions (e.g. `priceCents/100`) live here and **nowhere else**. |
| `queries.ts` | The **port** the rest of the app calls                             | **MUST** return domain types (`Product`), **never** raw `ProductRow`. Composes `select` + `map` over the singleton `db`. |
| `index.ts`   | Connection / composition root                                      | Lazy-initialised; reads `DATABASE_URL` from `$env/dynamic/private`; `prepare:false` for Neon's transaction pooler. Importing it **MUST NOT** require a live connection (build-time route analysis must not hit the DB). |

### 2.2 API / port design rules

- A port function **MUST** speak the domain language (`listCoreProducts(): Promise<Product[]>`), not
  the ORM's. Callers never see Drizzle types.
- Query builders **MUST** be parameterized by `database` so the same builder runs against the app
  singleton in production and against a fresh test connection in integration tests.
- Money is stored as integer cents (`priceCents`) and converted to dollars at exactly one boundary
  (`map.ts`). No other layer does money arithmetic.
- List ports **SHOULD** define explicit ordering and, once result sets can grow, pagination — do not
  return unbounded selects as the catalogue scales.
- Errors **SHOULD** surface as typed failures from the port; do not leak raw `postgres` errors to
  routes.

### 2.3 Adapter-model rules

- `map.ts` is an **anti-corruption layer**: the persistence shape (`ProductRow`) and the domain shape
  (`Product`) are allowed to diverge, and the mapper absorbs the difference. Keep it **one-directional
  and pure**; add a reverse `toRow`/`toInsert` mapper when writes are introduced — do not let routes
  build raw insert objects.
- Adapters (`select.ts`) stay **thin**: build the query, return the rows, map elsewhere. No business
  rules in the adapter beyond the filter that defines the view (e.g. "core = active, not hidden,
  collection core").
- The lazy `Proxy` singleton in `index.ts` is the connection provider. If a context needs an explicit
  handle (tests, scripts), it **SHOULD** construct its own `drizzle(postgres(url))` rather than
  reaching through the Proxy — exactly as `queries.test.ts` does.

### 2.4 Known debt (fix as you touch these areas)

1. **Test-data isolation under the fleet.** Integration tests use fixed sentinel IDs (`__test__core`,
   …) against a shared Neon database. The framework runs N parallel worktree agents (Opinion 7) — fixed
   IDs **will** collide. New DB tests **MUST** use per-run unique namespaces (or transaction-rollback
   fixtures), not shared constant IDs. See §4.3.

---

## 3. Modularization — modular monolith, not monorepo

**Decision: this stays a single SvelteKit package.** Organize by **bounded context**, not by
splitting into separate packages.

- New domains (catalog, cart, orders, search, recommendations) **MUST** live as
  `src/lib/<context>/` (UI/pure logic) and `src/lib/server/<context>/` (data access), each following
  the §2.1 file roles.
- Cross-context imports **SHOULD** go through a context's port (its `queries.ts` / public module), not
  into its internals. A context owns its tables; another context reads them via the owner's port.
- **Do NOT introduce a monorepo** (pnpm/turbo workspaces) yet. There is one deploy target and one
  team; a monorepo would add build/tooling tax for no independent-release benefit. Revisit *only* when
  a piece needs its own deploy cadence, runtime, or team boundary. Capture that trigger as a studio
  idea — do not pre-build for it.
- The five studio "products" (search, browse, recommendations, merchandising, platform) are
  **product/roadmap groupings, not package boundaries.** They map to bounded contexts inside this one
  app.

---

## 4. Testing strategy

Two runtimes, one workspace ([`vitest.workspace.ts`](vitest.workspace.ts)): a **browser** project
(`*.svelte.test.ts` in real headless Chromium via Playwright) and a **node** project (everything
else, with `DATABASE_URL` loaded from `.env.local` by `vitest.setup.node.ts`).

### 4.1 Real services — no mocks (the hard rule)

Per [`standards/no-mocks.md`](standards/no-mocks.md):

- Component tests **MUST** render real Svelte components in a real browser.
- Server/DB tests **MUST** run against a real Postgres. **Never** mock `fetch`; **never** fake the DB.
- A pure unit test is allowed **only** for logic with no I/O (e.g. `search.ts`, `map.ts`). If you
  write one, state why it has no I/O.
- The only permitted stub is a service with unrecoverable side effects (email, SMS, live payments).

### 4.2 What to test where

| Subject                          | Test kind        | Runtime  | Example |
| -------------------------------- | ---------------- | -------- | ------- |
| Pure logic (search, mappers)     | Unit (no I/O)    | node     | `map.ts`, `search.ts` |
| Query builders / ports           | Integration      | node     | `queries.test.ts` against real Postgres |
| Component behavior / UI states   | Browser          | browser  | `page.svelte.test.ts` |

### 4.3 Integration-test conventions (REQUIRED)

- **Skip gracefully** when `DATABASE_URL` is absent (`const suite = url ? describe : describe.skip`),
  and say so at the review gate rather than mocking.
- **Own your data:** insert the rows the test asserts on; clean up in `beforeAll` *and* `afterAll`.
- **Parallel-safe IDs:** generate a unique namespace per run; do **not** reuse fixed sentinel IDs
  across the fleet (see §2.4.1). The current `__test__*` constants are debt to replace, not a pattern
  to copy.
- Pipe output to a log and read it back — never re-run just to see output again:
  `npm run test 2>&1 | tee logs/test-output.log`.

---

## 5. The build & gate pipeline

- **Build:** `vite build` → `@sveltejs/adapter-vercel` emits Vercel-native output; `vercel.ts`
  (`@vercel/config`) declares `framework: 'sveltekit'`, `buildCommand: 'npm run build'`.
- **The gate (`npm run precommit`):** `check` (svelte-check on the app + `tsc` on framework code in
  `sdlc/`/`scripts/`) → `build` → `test`. The framework's own code is held to the same gate as the app.
- **Local `/precommit` is the primary door** — the gate runs locally/in-agent before push via
  [`/precommit`](.claude/skills/precommit/SKILL.md) ("the push gate is the only door"). A change
  **MUST** pass the full gate before it can land; do not rationalize a red test as pre-existing/flaky.
- **Server-side CI mirrors the gate** — [`.github/workflows/ci.yml`](.github/workflows/ci.yml) re-runs
  the full `npm run precommit` (check → build → test) on every PR into `main` and on pushes to feature
  branches, as a safety net for a change that bypassed the local gate. It is **not** a replacement for
  `/precommit`. CI runs the same **real** services as local (real Chromium; real Postgres via a
  `DATABASE_URL` secret + `db:push`) so the no-mocks standard holds in CI exactly as locally — a
  missing DB secret fails the job rather than silently skipping the integration test.
- Merge & deploy are GitHub (squash-merge to `main`) + Vercel (preview per PR, production on `main`).

---

## 6. Spec / technical-design checklist (for studio-ai)

Before a task or idea technical-design is "ready," confirm it answers each — this is the contract
this rulebook exists to enforce:

1. **Bounded context** — which `src/lib/<context>/` does this belong to? New context or existing?
2. **Domain model** — what tables/types change in `schema.ts`? New domain types, and where do they
   live (neutral `$lib/domain/`, not inside a feature)?
3. **Port** — what does the public `queries.ts` signature look like? Does it return domain types, not
   rows? Is the query builder parameterized by `database`?
4. **Adapter/mapping** — what `map.ts` changes (incl. reverse mapper for writes)? Where does any unit
   conversion live?
5. **Rendering** — server load (`+page.server.ts`) vs client; what data is fetched where?
6. **Tests** — name the test file(s) and the **real** service each exercises (browser component / real
   Postgres). Confirm parallel-safe data isolation. Justify any pure unit test (no I/O).
7. **Standards** — one row per [`standards/`](standards/) entry, declaring how the plan respects it.
8. **Scope** — minimal change; touched files left cleaner; follow-ups listed as learnings, **not**
   spun off as new tasks autonomously (CLAUDE.md rule 8).

---

## 7. Reference map

| Layer / concern        | Where |
| ---------------------- | ----- |
| SDLC & opinions        | [`FRAMEWORK.md`](FRAMEWORK.md), [`sdlc/core.md`](sdlc/core.md) |
| Agent rules            | [`CLAUDE.md`](CLAUDE.md) |
| Active standards gate  | [`standards/`](standards/) |
| Data layer             | `src/lib/server/db/{schema,select,map,queries,index}.ts` |
| Pure storefront logic  | `src/lib/storefront/{search,popular-queries}.ts` |
| Routes / rendering     | `src/routes/+page.server.ts`, `+page.svelte` |
| Test config            | `vitest.workspace.ts`, `vite.config.ts`, `vitest.setup.node.ts` |
| Build / deploy         | `svelte.config.js`, `vercel.ts`, `drizzle.config.ts` |
