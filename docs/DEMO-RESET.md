# Repeatable demo — reset checklist (preview-URL flow)

The preview-URL demo shows a managed agent taking a task → PR → **Vercel branch preview**,
*without* merging to production — so it can be run over and over. This is the reset runbook
that keeps every run starting from the same clean "before."

Verified live: a pushed branch gets a public preview at a predictable URL
(`demo-retail-git-<branch>-praxaai.vercel.app`), HTTP 200, no login wall, serving the branch's
build within ~30s. Deleting the branch drops the preview; `main`/production is never touched.

## What each run mutates (and how it resets)

| State | The run does | Reset |
|-------|--------------|-------|
| **Code** on the agent branch | agent adds the low-stock badge + a test | `npm run demo:reset` → hard-reset to `origin/main` |
| **Branch + Vercel preview** | pushes a `claude/managed-*` (or demo) branch | `npm run demo:reset <branch>` → deletes local + remote branch (preview drops) |
| **Studio idea/task** | creates an idea + task per run | soft-delete by hand (MCP store, not git) |
| **DB inventory** | *unchanged per run* — but the badge needs a low-stock product to render | one-time pre-flight: `npm run demo:reset -- --seed` |

## Pre-flight (once, before a demo session)

```bash
# Reseed the catalogue and force a low-stock spread so every badge threshold has
# a product to render (shell-001→1, down-001→3, fleece-001→6). Seed alone leaves
# every product at 8+ stock, so the badge would never appear.
npm run demo:reset -- --seed
```

- Confirm `main` is clean on the **praxaai** Vercel project (production storefront unchanged).
- Have the dev server running if you also want to point at localhost: `npm run dev`.

## Per-run reset (between takes)

```bash
npm run demo:reset                       # code back to origin/main, working tree clean
npm run demo:reset claude/managed-XX-... # also drop that run's branch + its Vercel preview
```

Then soft-delete the run's Studio idea + task (same as deleting idea #8).

## Two live-demo gotchas

1. **Stale first load.** The preview URL returns 200 immediately but may serve the *previous*
   build for a few seconds. Give Vercel ~30–60s and **confirm your change is on screen** before
   presenting — don't trust the first load.
2. **No low-stock product = no badge.** If you skipped the `--seed` pre-flight, the seed's minimum
   stock is 8 and the badge never renders. The demo falls flat silently.

## Commands added for this flow

| Command | Does |
|---------|------|
| `npm run demo:reset [branch] [-- --seed]` | Reset code to `origin/main`, optionally delete a demo branch, optionally reseed + low-stock |
| `npm run db:seed:lowstock` | Apply just the low-stock spread (assumes catalogue already seeded) |
