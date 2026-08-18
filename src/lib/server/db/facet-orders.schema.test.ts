import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { like } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import type { Sql } from 'postgres';
import * as schema from './schema';

// Integration test against the real (dev) database. Skips when DATABASE_URL is
// absent so the suite stays green in environments without a DB (ARCHITECTURE §4.3).
const url = process.env.DATABASE_URL;
const suite = url ? describe : describe.skip;

// Per-run unique namespace so parallel fleet agents never collide (ARCHITECTURE §4.3,
// §2.4.1 — fixed sentinel ids are debt, not a pattern to copy).
const ns = `__test__${randomUUID().slice(0, 8)}`;

suite('facet ordering schema (integration)', () => {
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

  it('accepts a category facet order row and enforces UNIQUE(category_slug, facet_key)', async () => {
    const categorySlug = `${ns}-tents`;
    await db
      .insert(schema.categoryFacetOrders)
      .values({ categorySlug, facetKey: 'season', displayOrder: 1 });
    await expect(
      db.insert(schema.categoryFacetOrders).values({ categorySlug, facetKey: 'season', displayOrder: 2 })
    ).rejects.toThrow();
  });

  it('allows the same facet_key under a different category', async () => {
    await db
      .insert(schema.categoryFacetOrders)
      .values({ categorySlug: `${ns}-a`, facetKey: 'weight', displayOrder: 1 });
    await expect(
      db.insert(schema.categoryFacetOrders).values({ categorySlug: `${ns}-b`, facetKey: 'weight', displayOrder: 1 })
    ).resolves.not.toThrow();
  });

  it('enforces UNIQUE(facet_key) on default_facet_orders', async () => {
    const facetKey = `${ns}-size`;
    await db.insert(schema.defaultFacetOrders).values({ facetKey, displayOrder: 1 });
    await expect(
      db.insert(schema.defaultFacetOrders).values({ facetKey, displayOrder: 2 })
    ).rejects.toThrow();
  });
});
