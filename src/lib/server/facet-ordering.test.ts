import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { updateCategoryFacetOrder } from '$lib/server/db/queries';
import { loadFacetOrdering } from './facet-ordering';

// Integration test against the real (dev) database. Skips when DATABASE_URL is
// absent (ARCHITECTURE §4.3). Seeds + cleans its own per-run category namespace.
const url = process.env.DATABASE_URL;
const suite = url ? describe : describe.skip;

const slug = `__test__${randomUUID().slice(0, 8)}-cat`;
const at = (path: string) => new URL(`http://localhost${path}`);

suite('loadFacetOrdering (integration)', () => {
  beforeAll(async () => {
    await updateCategoryFacetOrder({
      categorySlug: slug,
      facetOrders: [
        { facetKey: 'capacity', displayOrder: 2 },
        { facetKey: 'season', displayOrder: 1 }
      ]
    });
  });

  afterAll(async () => {
    await updateCategoryFacetOrder({ categorySlug: slug, facetOrders: [] });
  });

  it('loads the detected category ordering by displayOrder', async () => {
    const result = await loadFacetOrdering(at(`/?category=${slug}`));
    expect(result.category).toBe(slug);
    expect(result.facetOrder).toEqual([
      { facetKey: 'season', displayOrder: 1 },
      { facetKey: 'capacity', displayOrder: 2 }
    ]);
    expect(Array.isArray(result.defaultFacetOrder)).toBe(true);
  });

  it('returns no category ordering when no category is in the URL', async () => {
    const result = await loadFacetOrdering(at('/'));
    expect(result.category).toBeNull();
    expect(result.facetOrder).toEqual([]);
    expect(Array.isArray(result.defaultFacetOrder)).toBe(true);
  });
});
