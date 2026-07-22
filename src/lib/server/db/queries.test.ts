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
  // Unique per-run namespace so parallel fleet runs don't collide (ARCHITECTURE §4.3).
  const ns = `__test__core_${randomUUID().slice(0, 8)}`;
  const id = {
    core: `${ns}_core`,
    hidden: `${ns}_hidden`,
    inactive: `${ns}_inactive`,
    elsewhere: `${ns}_elsewhere`
  };
  const all = Object.values(id);

  beforeAll(async () => {
    client = postgres(url!, { prepare: false });
    db = drizzle(client, { schema });
    // Clean any leftovers from a prior failed run, then insert four sentinels:
    // one visible + three that must each be filtered out for a different reason.
    await db.delete(schema.products).where(inArray(schema.products.id, all));
    await db.insert(schema.products).values([
      sentinel(id.core),
      sentinel(id.hidden, { hidden: true }),
      sentinel(id.inactive, { active: false }),
      sentinel(id.elsewhere, { collection: 'elsewhere' })
    ]);
  });

  afterAll(async () => {
    await db.delete(schema.products).where(inArray(schema.products.id, all));
    await client.end();
  });

  it('includes the active, non-hidden, core product', async () => {
    const ids = (await selectCoreProducts(db)).map((r) => r.id);
    expect(ids).toContain(id.core);
  });

  it('excludes hidden, inactive, and elsewhere products', async () => {
    const ids = new Set((await selectCoreProducts(db)).map((r) => r.id));
    expect(ids.has(id.hidden)).toBe(false);
    expect(ids.has(id.inactive)).toBe(false);
    expect(ids.has(id.elsewhere)).toBe(false);
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
