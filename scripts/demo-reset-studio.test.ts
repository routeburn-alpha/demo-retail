import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { callTool, hasCredentials } from './studio-poll';
import { discoverResettable, resetStudio, PROTECTED_NAME } from './demo-reset-studio';

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

/** Create a throwaway fuzzy idea this run asserts on. Returns its idea number. */
async function createFixture(name: string = FIXTURE_NAME): Promise<number> {
  const text = await callTool('create_idea', {
    productCode: PRODUCT,
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
async function destroyFixture(n: number): Promise<void> {
  if (!n) return;
  try {
    await callTool('update_idea', {
      productCode: PRODUCT,
      ideaNumber: n,
      name: `Archived test fixture ${n}`,
      hypothesis: 'Archived demo artefact. Content cleared so it cannot surface in demo search results.',
      technicalDesign: 'Archived demo artefact. Content cleared so it cannot surface in demo search results.'
    });
  } catch {
    /* scrub is best-effort — still attempt the delete below */
  }
  try {
    await callTool('delete_idea', { productCode: PRODUCT, ideaNumber: n });
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
});
