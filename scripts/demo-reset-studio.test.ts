import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { callTool, hasCredentials } from './studio-poll';
import {
  CHECKOUT_RUN_NAME,
  discoverCheckoutRun,
  discoverResettable,
  parseItemLine,
  resetStudio,
  scrubArchivedTask,
  PROTECTED_NAME
} from './demo-reset-studio';

// Integration tests — these hit the REAL studio-ai MCP HTTP endpoint (no mocks), per
// standards/no-mocks.md and ARCHITECTURE §4.3. Skipped (never mocked) when no token.
//
// Own-your-data (§4.3): each run creates its own throwaway idea under a unique namespace
// and cleans it up in beforeAll *and* afterAll, so parallel runs never collide and a
// crashed run can't poison the next one. Every mutating call is scoped with `only`, so a
// test can never sweep up real studio state.

const PRODUCT = 'search';
const RUN_ID = randomUUID().slice(0, 8);
const FIXTURE_NAME = `fuzzy search reset-test ${RUN_ID}`;

let fixtureNumber = 0;

/** Create a throwaway idea this run asserts on. Returns its idea number. */
async function createFixture(name: string = FIXTURE_NAME, product: string = PRODUCT): Promise<number> {
  const text = await callTool('create_idea', {
    productCode: product,
    name,
    hypothesis: `Throwaway fixture for demo-reset-studio integration run ${RUN_ID}. Safe to delete.`,
    validationStatus: 'Building'
  });
  const m = text.match(/Created idea #(\d+)/);
  if (!m) throw new Error(`could not parse created idea number from: ${text}`);
  return Number(m[1]);
}

/**
 * Best-effort cleanup — the fixture may already be gone, which is the success case.
 *
 * Scrub, THEN delete. `delete_idea` is a soft delete, so a merely-deleted fixture survives as
 * Archived and is still returned by Knowledge-backed search — which is how every past run left
 * one more `fuzzy search reset-test` idea in the demo chat's results. Scrubbing is safe on an
 * already-archived record, which matters because the `--apply` test deletes the shared fixture
 * before `afterAll` gets to it.
 */
async function destroyFixture(n: number, product: string = PRODUCT): Promise<void> {
  if (!n) return;
  try {
    await callTool('update_idea', {
      productCode: product,
      ideaNumber: n,
      name: `Archived test fixture ${n}`,
      hypothesis: 'Archived demo artefact. Content cleared so it cannot surface in demo search results.',
      technicalDesign: 'Archived demo artefact. Content cleared so it cannot surface in demo search results.'
    });
  } catch {
    /* scrub is best-effort — still attempt the delete below */
  }
  try {
    await callTool('delete_idea', { productCode: product, ideaNumber: n });
  } catch {
    /* already deleted */
  }
}

describe.skipIf(!hasCredentials())('demo-reset-studio (real studio-ai MCP over HTTP)', () => {
  beforeAll(async () => {
    fixtureNumber = await createFixture();
  });

  afterAll(async () => {
    await destroyFixture(fixtureNumber);
  });

  it('discovers a fuzzy-named idea that a demo run created', async () => {
    const found = await discoverResettable(PRODUCT);
    expect(found.ideas.map((i) => i.number)).toContain(fixtureNumber);
  });

  it('never selects the cleanup work itself', async () => {
    // Task #1147 is the trap: its name contains "fuzzy-search", so it matches the discovery
    // pattern and would be deleted without the PROTECTED_NAME guard.
    const guarded = 'Restore exact-match search baseline and make the fuzzy-search demo replayable';
    expect(PROTECTED_NAME.test(guarded)).toBe(true);

    const found = await discoverResettable(PRODUCT);
    for (const item of [...found.ideas, ...found.tasks]) {
      expect(PROTECTED_NAME.test(item.name)).toBe(false);
    }
  });

  it('dry-run reports the idea but does not delete it', async () => {
    const result = await resetStudio({
      product: PRODUCT,
      apply: false,
      only: { ideas: [fixtureNumber] }
    });
    expect(result.ideas.map((i) => i.number)).toContain(fixtureNumber);
    // Still discoverable => genuinely untouched.
    const found = await discoverResettable(PRODUCT);
    expect(found.ideas.map((i) => i.number)).toContain(fixtureNumber);
  });

  // Three sequential live round-trips (delete, re-discover, re-delete) against an endpoint that
  // answers in ~1-2.5s each, so vitest's 5s default leaves no headroom and this reds the suite under
  // parallel load. The work is real network latency, not a hang — give it a budget that matches.
  it('--apply soft-deletes the idea, and a second run is a no-op (idempotent)', async () => {
    const first = await resetStudio({ product: PRODUCT, apply: true, only: { ideas: [fixtureNumber] } });
    expect(first.ideas.map((i) => i.number)).toContain(fixtureNumber);
    expect(first.failed).toEqual([]);

    const found = await discoverResettable(PRODUCT);
    expect(found.ideas.map((i) => i.number)).not.toContain(fixtureNumber);

    const second = await resetStudio({ product: PRODUCT, apply: true, only: { ideas: [fixtureNumber] } });
    expect(second.ideas).toEqual([]);
  }, 20_000);

  // The leak this guards: `delete_idea` is a SOFT delete, so a merely-deleted fixture survives
  // as Archived — and archived records are STILL returned by Knowledge-backed search, which is
  // what the demo chat queries. Every test run therefore left one more `fuzzy search reset-test`
  // idea in the demo's search results and the pile only ever grew (8 of them by 2026-09-13).
  //
  // Asserted by reading the record straight back rather than by querying search: a freshly
  // created idea is not in the Knowledge index yet, so a search-based assertion passes
  // vacuously and proves nothing. This reads the artefact itself, which is never stale.
  it('scrubs the fixture text before deleting, leaving no fuzzy remnant', async () => {
    const leaked = await createFixture(`${FIXTURE_NAME} leak`);
    await destroyFixture(leaked);

    const detail = await callTool('get_idea', { productCode: PRODUCT, ideaNumber: leaked });
    expect(detail).not.toMatch(/fuzzy|typo|levenshtein/i);
  }, 20_000);

  // Studio refuses to rename a task once it has left the backlog, so an already-archived task —
  // archived by a closed PR, by hand, or by a reset that predates scrubbing — kept its fuzzy
  // title and spec in the demo chat's search results. Asserted by reading the task back, for the
  // same index-staleness reason as the idea test above.
  it('blanks an already-archived task, title included, and leaves it archived', async () => {
    const created = await callTool('create_task', {
      productCode: PRODUCT,
      name: `Fuzzy typo reset-test task ${RUN_ID}`,
      specification: `Throwaway fixture for demo-reset-studio run ${RUN_ID}: Levenshtein typo tolerance.`
    });
    const n = Number(created.match(/#(\d+)/)?.[1]);
    expect(n).toBeGreaterThan(0);
    await callTool('delete_task', { productCode: PRODUCT, taskNumber: n });

    await scrubArchivedTask(PRODUCT, n);

    const detail = await callTool('get_task', { productCode: PRODUCT, taskNumber: n });
    const own = detail.split('\n=== idea')[0]; // the task's own section, not its linked context
    expect(own).not.toMatch(/fuzzy|typo|levenshtein/i);
    expect(own).toMatch(/^(?:[\w-]+)?#\d+: .* \(Archived,/m);
  }, 30_000);
});

// The checkout run's name is matched EXACTLY, never by keyword: the template (platform idea #2)
// shares every word of it but the suffix, and a keyword match is how a teammate's real backlog was
// once deleted. Pure string matching, no I/O — so these are plain unit tests.
describe('checkout run matching', () => {
  it('matches a run copy by its exact name', () => {
    expect(CHECKOUT_RUN_NAME.test('Cart → checkout → order confirmation — demo run 2026-10-20')).toBe(true);
  });

  it('never matches the template, a run name without a date, or a keyword lookalike', () => {
    for (const name of [
      'Cart → checkout → order confirmation',
      'Cart → checkout → order confirmation — demo run',
      'Cart → checkout → order confirmation — demo run tomorrow',
      'Make demo:reset restore stock and clear demo carts and orders',
      'Checkout demo run tidy-up'
    ]) {
      expect(CHECKOUT_RUN_NAME.test(name), name).toBe(false);
    }
  });

  it('reads the linked idea number off a task line', () => {
    const line = '  #1201: Cart port (cookie cart) [managedOpus] [owner: C S] (Idea #1199: Cart → checkout → order confirmation — demo run 2026-10-20)';
    expect(parseItemLine(line, 'Task')).toEqual({ number: 1201, name: 'Cart port (cookie cart)', status: '', idea: 1199 });
  });

  // Verbatim from a 2026-10-29 listing: a demo run's idea and task were left live because these
  // lines did not parse, and the reset reported "Studio already clean".
  it('reads product-prefixed lines and skips the URL line under them', () => {
    expect(parseItemLine('  search#1188: Typo-tolerant search matching (Building) [owner: Cassandra Shum]', 'Idea')).toEqual({
      number: 1188,
      name: 'Typo-tolerant search matching',
      status: 'Building'
    });
    const task = '  search#1285: Wire tolerant matcher into storefront search input (Idea search#1188: Typo-tolerant search matching)';
    expect(parseItemLine(task, 'Task')).toEqual({
      number: 1285,
      name: 'Wire tolerant matcher into storefront search input',
      status: '',
      idea: 1188
    });
    expect(parseItemLine('    URL: https://app.getpraxa.ai/demo-alpha/search-discovery/search/ideas/1188', 'Idea')).toBeNull();
  });
});

describe.skipIf(!hasCredentials())('checkout run discovery (real studio-ai MCP over HTTP)', () => {
  const CHECKOUT_PRODUCT = 'platform';
  const runName = `Cart → checkout → order confirmation — demo run 2099-01-01 reset-test ${RUN_ID}`;
  let runIdea = 0;

  beforeAll(async () => {
    runIdea = await createFixture(runName, CHECKOUT_PRODUCT);
  });

  afterAll(async () => {
    await destroyFixture(runIdea, CHECKOUT_PRODUCT);
  });

  it('finds the run idea and nothing that is not a run', async () => {
    const found = await discoverCheckoutRun(CHECKOUT_PRODUCT);
    expect(found.ideas.map((i) => i.number)).toContain(runIdea);
    for (const idea of found.ideas) expect(CHECKOUT_RUN_NAME.test(idea.name), idea.name).toBe(true);
    const runIdeas = found.ideas.map((i) => i.number);
    for (const task of found.tasks) expect(runIdeas).toContain(task.idea);
  });

  it('dry-run reports the run idea but leaves it in place', async () => {
    const result = await resetStudio({ product: CHECKOUT_PRODUCT, checkout: true, only: { ideas: [runIdea] } });
    expect(result.applied).toBe(false);
    expect(result.ideas.map((i) => i.number)).toEqual([runIdea]);

    const found = await discoverCheckoutRun(CHECKOUT_PRODUCT);
    expect(found.ideas.map((i) => i.number)).toContain(runIdea);
  }, 20_000);
});
