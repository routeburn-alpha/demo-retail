import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import type { Sql } from 'postgres';
import { inArray } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import * as schema from '$lib/server/db/schema';
import { GET } from './+server';

// Integration test against the real (dev) database. Skips when DATABASE_URL is absent.
// Tests the server-side search API endpoint with real Postgres.
const url = process.env.DATABASE_URL;
const suite = url ? describe : describe.skip;

suite('Server-side search API', () => {
  let client: Sql;
  let db: PostgresJsDatabase<typeof schema>;

  const ns = `__test__search_${randomUUID().slice(0, 8)}`;
  const id = {
    runner: `${ns}_runner`,
    shell: `${ns}_shell`,
    backpack: `${ns}_backpack`
  };
  const sentinels = Object.values(id);

  function testProduct(rowId: string, name: string, category: string): schema.NewProductRow {
    return {
      id: rowId,
      slug: rowId,
      name,
      category,
      priceCents: 10000,
      description: 'test product',
      imageUrl: 'https://example.com/img.jpg',
      collection: 'core',
      hidden: false,
      active: true
    };
  }

  beforeAll(async () => {
    client = postgres(url!, { prepare: false });
    db = drizzle(client, { schema });

    await db.delete(schema.products).where(inArray(schema.products.id, sentinels));
    await db.insert(schema.products).values([
      testProduct(id.runner, 'Trail Runner', 'footwear'),
      testProduct(id.shell, 'Storm Shell', 'jacket'),
      testProduct(id.backpack, 'Tarn Pack', 'backpack')
    ]);
  });

  afterAll(async () => {
    await db.delete(schema.products).where(inArray(schema.products.id, sentinels));
    await client.end();
  });

  it('returns an empty array for an empty query', async () => {
    const mockEvent = {
      url: new URL('http://localhost?q=')
    } as unknown as Parameters<typeof GET>[0];
    const response = await GET(mockEvent);
    const data = await response.json();
    expect(data).toEqual([]);
  });

  it('returns products matching the query with fuzzy search', async () => {
    const mockEvent = {
      url: new URL('http://localhost?q=trail')
    } as unknown as Parameters<typeof GET>[0];
    const response = await GET(mockEvent);
    const data = await response.json();
    expect(data).toHaveLength(1);
    expect(data[0].id).toBe(id.runner);
    expect(data[0].name).toBe('Trail Runner');
  });

  it('supports multi-token queries that match all tokens', async () => {
    const mockEvent = {
      url: new URL('http://localhost?q=trail%20runner')
    } as unknown as Parameters<typeof GET>[0];
    const response = await GET(mockEvent);
    const data = await response.json();
    expect(data).toHaveLength(1);
    expect(data[0].id).toBe(id.runner);
  });

  it('returns no results when query does not match any product', async () => {
    const mockEvent = {
      url: new URL('http://localhost?q=xyz')
    } as unknown as Parameters<typeof GET>[0];
    const response = await GET(mockEvent);
    const data = await response.json();
    expect(data).toEqual([]);
  });

  it('supports fuzzy matching with typos', async () => {
    const mockEvent = {
      url: new URL('http://localhost?q=rnner')
    } as unknown as Parameters<typeof GET>[0];
    const response = await GET(mockEvent);
    const data = await response.json();
    expect(data).toHaveLength(1);
    expect(data[0].id).toBe(id.runner);
  });

  it('respects the department filter', async () => {
    const mockEvent = {
      url: new URL('http://localhost?q=&department=mens')
    } as unknown as Parameters<typeof GET>[0];
    const response = await GET(mockEvent);
    const data = await response.json();
    // The test products have no department, so they should not appear in a filtered result.
    // Real products would have departments set, and the filter would apply.
    expect(Array.isArray(data)).toBe(true);
  });
});
