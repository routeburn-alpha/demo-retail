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

/** Create the throwaway fuzzy idea this run asserts on. Returns its idea number. */
async function createFixture(): Promise<number> {
  const text = await callTool('create_idea', {
    productCode: PRODUCT,
    name: FIXTURE_NAME,
    hypothesis: `Throwaway fixture for demo-reset-studio integration run ${RUN_ID}. Safe to delete.`,
    validationStatus: 'Building'
  });
  const m = text.match(/Created idea #(\d+)/);
  if (!m) throw new Error(`could not parse created idea number from: ${text}`);
  return Number(m[1]);
}

/** Best-effort cleanup — the fixture may already be gone, which is the success case. */
async function destroyFixture(n: number): Promise<void> {
  if (!n) return;
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
});
