import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import type { Sql } from 'postgres';
import { and, eq, inArray, ne, or } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import * as schema from '$lib/server/db/schema';
import { ELSEWHERE_SEED } from '../../scripts/seed';
import { load } from './+page.server';

// Integration test against the real (dev) database. Skips when DATABASE_URL is absent
// (ARCHITECTURE §4.3). Real route load, real Postgres — nothing stubbed.
const url = process.env.DATABASE_URL;
const suite = url ? describe : describe.skip;

/**
 * The security invariant: NOTHING the storefront hands the browser may be hidden, inactive, or
 * outside the `core` collection. See `standards/no-hidden-products-in-search.md`.
 *
 * This asserts at the ROUTE boundary and scans the WHOLE payload rather than checking one query
 * builder, because the failure mode is a *new* builder that never got the filter. The core
 * predicate is inlined in `selectCoreProducts` (`src/lib/server/db/select.ts`), so anything that
 * fetches products another way starts with no protection — and a payload-wide scan still covers it
 * when the data arrives under a new key (`results`, `matches`, `suggestions`, …).
 */
suite('the storefront never serves products that are not for sale', () => {
  let client: Sql;
  let db: PostgresJsDatabase<typeof schema>;

  // Per-run namespace: the fleet runs N agents against one Neon database, so fixed sentinel ids
  // would collide (ARCHITECTURE §2.4.1 — the existing `__test__*` constants are debt, not a pattern).
  const ns = `__test__leak_${randomUUID().slice(0, 8)}`;
  const id = {
    control: `${ns}_control`,
    hidden: `${ns}_hidden`,
    inactive: `${ns}_inactive`,
    elsewhere: `${ns}_elsewhere`
  };
  const sentinels = Object.values(id);

  function sentinel(rowId: string, over: Partial<schema.NewProductRow> = {}): schema.NewProductRow {
    return {
      id: rowId,
      slug: rowId,
      name: rowId,
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

  beforeAll(async () => {
    client = postgres(url!, { prepare: false });
    db = drizzle(client, { schema });

    // Clear leftovers from any prior failed run, then insert one product per exclusion reason
    // plus a visible control.
    await db.delete(schema.products).where(inArray(schema.products.id, sentinels));
    await db.insert(schema.products).values([
      sentinel(id.control),
      sentinel(id.hidden, { hidden: true }),
      sentinel(id.inactive, { active: false }),
      sentinel(id.elsewhere, { collection: 'elsewhere' })
    ]);

    // Ensure the real hidden collection exists so the invariant is exercised against actual
    // catalogue data, not just sentinels. Idempotent upsert — like `seed-facets.test.ts`, this
    // converges the shared database to the intended seed state rather than owning the rows, so
    // they are deliberately NOT removed in afterAll.
    for (const row of ELSEWHERE_SEED) {
      await db
        .insert(schema.products)
        .values(row)
        .onConflictDoUpdate({ target: schema.products.id, set: { collection: row.collection } });
    }
  });

  afterAll(async () => {
    // Only the sentinels are ours to remove.
    await db.delete(schema.products).where(inArray(schema.products.id, sentinels));
    await client.end();
  });

  // The route load only ever reads `url`; the rest of the SvelteKit event is unused here.
  const loadAt = (path: string) =>
    load({ url: new URL(`http://localhost${path}`) } as unknown as Parameters<typeof load>[0]);

  // Every product the core predicate excludes: wrong collection, inactive, or hidden.
  const selectNotForSale = () =>
    db
      .select()
      .from(schema.products)
      .where(
        or(
          ne(schema.products.collection, 'core'),
          eq(schema.products.active, false),
          eq(schema.products.hidden, true)
        )
      );

  // '/' is today's storefront; the others guard the shapes this route grows into — a server-side
  // search query, and the department filter.
  for (const path of ['/', '/?q=alpenglow', '/?department=womens']) {
    it(`serves nothing hidden, inactive or non-core at ${path}`, async () => {
      const notForSale = await selectNotForSale();
      const payload = JSON.stringify(await loadAt(path));

      // Positive control: prove the payload actually carries products, so the absence assertions
      // below cannot pass vacuously on an empty or broken load.
      expect(
        payload.includes(JSON.stringify(id.control)),
        `The storefront returned no products at ${path}, so this test proves nothing. ` +
          'Check the route load and the database connection.'
      ).toBe(true);

      const leaked = notForSale.filter((p) => payload.includes(JSON.stringify(p.id)));

      const report = [
        '',
        `SECURITY — the storefront leaked ${leaked.length} product(s) that are NOT FOR SALE at ${path}:`,
        '',
        ...leaked.map(
          (p) =>
            `    "${p.name}"  (id=${p.id}, collection=${p.collection}, ` +
            `hidden=${p.hidden}, active=${p.active})`
        ),
        '',
        '  These products are deliberately kept off the storefront. Serving them publishes',
        '  unreleased names and prices to every shopper, and cannot be recalled.',
        '',
        '  Something fetched products without the core filter',
        '  (collection = core AND active AND NOT hidden) from selectCoreProducts',
        '  in src/lib/server/db/select.ts.',
        '',
        '  See standards/no-hidden-products-in-search.md.',
        ''
      ].join('\n');

      expect(
        leaked.map((p) => p.name),
        report
      ).toEqual([]);
    });
  }

  it('excludes every hidden, inactive and non-core sentinel while keeping the control', async () => {
    // Names the three exclusion reasons individually, so a regression says WHICH rule broke
    // rather than only that something leaked.
    const visible = await db
      .select({ id: schema.products.id })
      .from(schema.products)
      .where(
        and(
          eq(schema.products.collection, 'core'),
          eq(schema.products.active, true),
          eq(schema.products.hidden, false),
          inArray(schema.products.id, sentinels)
        )
      );

    expect(visible.map((r) => r.id)).toEqual([id.control]);
  });
});
