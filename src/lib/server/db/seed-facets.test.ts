import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import type { Sql } from 'postgres';
import * as schema from './schema';
import { selectCategoryFacetOrders, selectDefaultFacetOrders } from './select';
import { seedFacets, FACET_SEED, DEFAULT_FACET_SEED } from '../../../../scripts/seed-facets';

// Integration test against the real (dev) database. Skips when DATABASE_URL is
// absent (ARCHITECTURE §4.3). seedFacets is idempotent (replace per category),
// so running it here just converges the shared DB to the intended seed state.
const url = process.env.DATABASE_URL;
const suite = url ? describe : describe.skip;

suite('seedFacets (integration)', () => {
  let client: Sql;
  let db: PostgresJsDatabase<typeof schema>;

  beforeAll(async () => {
    client = postgres(url!, { prepare: false });
    db = drizzle(client, { schema });
    await seedFacets(db);
  });

  afterAll(async () => {
    await client.end();
  });

  it('seeds the tent category ordering by displayOrder', async () => {
    const rows = await selectCategoryFacetOrders(db, 'tent');
    expect(rows.map((r) => ({ facetKey: r.facetKey, displayOrder: r.displayOrder }))).toEqual([
      { facetKey: 'season', displayOrder: 1 },
      { facetKey: 'capacity', displayOrder: 2 }
    ]);
  });

  it('seeds every configured category from FACET_SEED', async () => {
    for (const config of FACET_SEED) {
      const rows = await selectCategoryFacetOrders(db, config.categorySlug);
      expect(rows.map((r) => ({ facetKey: r.facetKey, displayOrder: r.displayOrder }))).toEqual(
        config.facetOrders
      );
    }
  });

  it('seeds the default facet ordering', async () => {
    const all = await selectDefaultFacetOrders(db);
    const seededKeys = new Set(DEFAULT_FACET_SEED.map((f) => f.facetKey));
    const mine = all
      .filter((r) => seededKeys.has(r.facetKey))
      .map((r) => ({ facetKey: r.facetKey, displayOrder: r.displayOrder }));
    expect(mine).toEqual(DEFAULT_FACET_SEED);
  });

  it('is idempotent — re-running converges to the same state', async () => {
    await expect(seedFacets(db)).resolves.not.toThrow();
    const rows = await selectCategoryFacetOrders(db, 'tent');
    expect(rows.map((r) => r.facetKey)).toEqual(['season', 'capacity']);
  });
});
