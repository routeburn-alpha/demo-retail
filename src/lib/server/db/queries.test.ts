import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { inArray } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import type { Sql } from 'postgres';
import * as schema from './schema';
import { selectCoreProducts } from './select';

// Integration test against the real (dev) database. Skips when DATABASE_URL is
// absent so the suite stays green in environments without a DB.
const url = process.env.DATABASE_URL;
const suite = url ? describe : describe.skip;

const IDS = ['__test__core', '__test__hidden', '__test__inactive', '__test__elsewhere'];

function sentinel(id: string, over: Partial<schema.NewProductRow> = {}): schema.NewProductRow {
  return {
    id,
    slug: id,
    name: id,
    category: 'test',
    priceCents: 100,
    description: '',
    imageUrl: '',
    collection: 'core',
    hidden: false,
    active: true,
    ...over
  };
}

suite('selectCoreProducts (integration)', () => {
  let client: Sql;
  let db: PostgresJsDatabase<typeof schema>;

  beforeAll(async () => {
    client = postgres(url!, { prepare: false });
    db = drizzle(client, { schema });
    // Clean any leftovers from a prior failed run, then insert four sentinels:
    // one visible + three that must each be filtered out for a different reason.
    await db.delete(schema.products).where(inArray(schema.products.id, IDS));
    await db.insert(schema.products).values([
      sentinel('__test__core'),
      sentinel('__test__hidden', { hidden: true }),
      sentinel('__test__inactive', { active: false }),
      sentinel('__test__elsewhere', { collection: 'elsewhere' })
    ]);
  });

  afterAll(async () => {
    await db.delete(schema.products).where(inArray(schema.products.id, IDS));
    await client.end();
  });

  it('includes the active, non-hidden, core product', async () => {
    const ids = (await selectCoreProducts(db)).map((r) => r.id);
    expect(ids).toContain('__test__core');
  });

  it('excludes hidden, inactive, and elsewhere products', async () => {
    const ids = new Set((await selectCoreProducts(db)).map((r) => r.id));
    expect(ids.has('__test__hidden')).toBe(false);
    expect(ids.has('__test__inactive')).toBe(false);
    expect(ids.has('__test__elsewhere')).toBe(false);
  });
});

suite('selectCoreProducts department filter (integration)', () => {
  let client: Sql;
  let db: PostgresJsDatabase<typeof schema>;
  // Unique per-run namespace so parallel fleet runs don't collide (ARCHITECTURE §4.3).
  const ns = `__test__dept_${randomUUID().slice(0, 8)}`;
  const id = { w: `${ns}_w`, m: `${ns}_m`, u: `${ns}_u` };
  const all = Object.values(id);

  beforeAll(async () => {
    client = postgres(url!, { prepare: false });
    db = drizzle(client, { schema });
    await db.delete(schema.products).where(inArray(schema.products.id, all));
    await db.insert(schema.products).values([
      sentinel(id.w, { department: 'womens' }),
      sentinel(id.m, { department: 'mens' }),
      sentinel(id.u, { department: 'unisex' })
    ]);
  });

  afterAll(async () => {
    await db.delete(schema.products).where(inArray(schema.products.id, all));
    await client.end();
  });

  it("the Women's filter returns women's + unisex and excludes men's", async () => {
    const ids = new Set((await selectCoreProducts(db, 'womens')).map((r) => r.id));
    expect(ids.has(id.w)).toBe(true);
    expect(ids.has(id.u)).toBe(true);
    expect(ids.has(id.m)).toBe(false);
  });
});
