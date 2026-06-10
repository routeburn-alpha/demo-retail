import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { like } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import type { Sql } from 'postgres';
import * as schema from './schema';
import { getFacetOrderForCategory, getDefaultFacetOrder, updateCategoryFacetOrder } from './queries';

// Integration test against the real (dev) database. Skips when DATABASE_URL is
// absent so the suite stays green without a DB (ARCHITECTURE §4.3). The ports
// under test use the singleton `db`; this handle is only for setup/cleanup.
const url = process.env.DATABASE_URL;
const suite = url ? describe : describe.skip;

// Per-run unique namespace so parallel fleet agents never collide (§4.3, §2.4.2).
const ns = `__test__${randomUUID().slice(0, 8)}`;

suite('facet ordering ports (integration)', () => {
  let client: Sql;
  let db: PostgresJsDatabase<typeof schema>;

  const cleanup = async () => {
    await db
      .delete(schema.categoryFacetOrders)
      .where(like(schema.categoryFacetOrders.categorySlug, `${ns}%`));
    await db.delete(schema.defaultFacetOrders).where(like(schema.defaultFacetOrders.facetKey, `${ns}%`));
  };

  beforeAll(async () => {
    client = postgres(url!, { prepare: false });
    db = drizzle(client, { schema });
    await cleanup();
  });

  afterAll(async () => {
    await cleanup();
    await client.end();
  });

  it('persists a category ordering and reads it back ordered by displayOrder', async () => {
    const categorySlug = `${ns}-tents`;
    await updateCategoryFacetOrder({
      categorySlug,
      // intentionally out of order to prove the query orders, not insertion order
      facetOrders: [
        { facetKey: 'capacity', displayOrder: 2 },
        { facetKey: 'season', displayOrder: 1 },
        { facetKey: 'weight', displayOrder: 3 }
      ]
    });

    const order = await getFacetOrderForCategory(categorySlug);
    expect(order).toEqual([
      { facetKey: 'season', displayOrder: 1 },
      { facetKey: 'capacity', displayOrder: 2 },
      { facetKey: 'weight', displayOrder: 3 }
    ]);
  });

  it('replaces the whole category ordering (a dropped facet disappears)', async () => {
    const categorySlug = `${ns}-jackets`;
    await updateCategoryFacetOrder({
      categorySlug,
      facetOrders: [
        { facetKey: 'insulation', displayOrder: 1 },
        { facetKey: 'waterproof', displayOrder: 2 }
      ]
    });
    await updateCategoryFacetOrder({
      categorySlug,
      facetOrders: [{ facetKey: 'insulation', displayOrder: 1 }]
    });

    const order = await getFacetOrderForCategory(categorySlug);
    expect(order).toEqual([{ facetKey: 'insulation', displayOrder: 1 }]);
  });

  it('returns the default facet ordering by displayOrder', async () => {
    await db.insert(schema.defaultFacetOrders).values([
      { facetKey: `${ns}-b`, displayOrder: 2 },
      { facetKey: `${ns}-a`, displayOrder: 1 }
    ]);

    const defaults = await getDefaultFacetOrder();
    const mine = defaults.filter((f) => f.facetKey.startsWith(ns));
    expect(mine).toEqual([
      { facetKey: `${ns}-a`, displayOrder: 1 },
      { facetKey: `${ns}-b`, displayOrder: 2 }
    ]);
  });
});
