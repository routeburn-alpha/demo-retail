import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { orderFacets, search } from './search';
import type { Product } from '$lib/domain/product';
import type { FacetOrder } from '$lib/domain/facets';

// Pure logic over the REAL static catalogue (read from disk, same source the seed uses).
// No DB, no fetch, no mocks — allowed per ARCHITECTURE §4.1 (the search matcher has no I/O).
const realCatalog: Product[] = JSON.parse(readFileSync('static/catalog.json', 'utf-8'));
const isWomens = (p: Product) => /women'?s/i.test(p.name);

describe('exact search', () => {
  it('matches every product whose name or category contains all query tokens', () => {
    const results = search('jacket', realCatalog);
    expect(results.length).toBeGreaterThan(0);
    expect(
      results.every((p) => `${p.name} ${p.category}`.toLowerCase().includes('jacket'))
    ).toBe(true);
  });

  it('does not expand synonyms', () => {
    // "pants" has no catalogue word within fuzzy range either (nearest real tokens are
    // several edits away) — only a removed synonym dictionary used to map it onto leggings.
    expect(search('pants', realCatalog)).toEqual([]);
  });
});

// Fuzzy token matching: see `fuzzyThreshold` in search.ts for the exact edit-distance budget
// per token length. These are pure unit tests — `search()` has no I/O, so no real service
// is required (ARCHITECTURE §4.1 / the no-mocks standard's pure-logic exception).
describe('fuzzy token matching', () => {
  it('"shel jaket" (misspelled "shell jacket") surfaces the shell jacket products', () => {
    // "shel" already hits exactly (it's a substring of "shell"); "jaket" is a 1-edit typo of
    // "jacket" and only matches through the fuzzy fallback.
    const results = search('shel jaket', realCatalog);
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((p) => p.category === 'shell jacket')).toBe(true);
  });

  it('ranks an exact match ahead of a fuzzy-only match, preserving catalogue order within each group', () => {
    const miniCatalog: Product[] = [
      { id: 'fuzzy-1', name: 'Desert Tant', category: 'tant', price: 1, description: '', imageUrl: '' },
      { id: 'exact-1', name: 'Alpine Tent', category: 'tent', price: 1, description: '', imageUrl: '' },
      { id: 'exact-2', name: 'Canyon Tent', category: 'tent', price: 1, description: '', imageUrl: '' },
      { id: 'fuzzy-2', name: 'Ridge Tend', category: 'tend', price: 1, description: '', imageUrl: '' }
    ];
    // "tent" matches exact-1/exact-2 by substring and fuzzy-1/fuzzy-2 only by 1-edit distance.
    // Exact hits must lead, and each group must keep its original catalogue order.
    expect(search('tent', miniCatalog).map((p) => p.id)).toEqual([
      'exact-1',
      'exact-2',
      'fuzzy-1',
      'fuzzy-2'
    ]);
  });

  it('does not fuzzy-match a short (<=3 char) token', () => {
    // "bat" is a 1-edit typo of "bag" (as in "sleeping bag"), but tokens of 3 chars or fewer
    // require an exact substring hit, so the fuzzy fallback never kicks in for it.
    expect(search('bat', realCatalog)).toEqual([]);
  });

  it('returns no results for a query with no close match, exact or fuzzy', () => {
    expect(search('xyzzyx', realCatalog)).toEqual([]);
  });
});

describe("women's clothing line", () => {
  it('the catalogue carries at least 6 women\'s clothing products', () => {
    expect(realCatalog.filter(isWomens).length).toBeGreaterThanOrEqual(6);
  });

  it('searching the literal "women\'s" surfaces only the women\'s line', () => {
    const results = search("women's", realCatalog);
    expect(results.length).toBeGreaterThan(0);
    expect(results.every(isWomens)).toBe(true);
  });
});

// Pure unit test — orderFacets has no I/O (it receives the ordering config as input),
// so a unit test is allowed per ARCHITECTURE §4.1. No DB, no mocks.

const tentOrder: FacetOrder[] = [
  { facetKey: 'season', displayOrder: 1 },
  { facetKey: 'capacity', displayOrder: 2 }
];

const defaultOrder: FacetOrder[] = [
  { facetKey: 'price', displayOrder: 1 },
  { facetKey: 'rating', displayOrder: 2 }
];

describe('orderFacets', () => {
  it('orders available facets by the category displayOrder', () => {
    // available given out of order on purpose
    expect(orderFacets(['capacity', 'season'], tentOrder, defaultOrder)).toEqual([
      'season',
      'capacity'
    ]);
  });

  it('appends facets not in the config after the configured ones, in original order', () => {
    expect(orderFacets(['weight', 'capacity', 'season'], tentOrder, defaultOrder)).toEqual([
      'season',
      'capacity',
      'weight'
    ]);
  });

  it('falls back to the default order when the category has no config', () => {
    expect(orderFacets(['rating', 'price'], [], defaultOrder)).toEqual(['price', 'rating']);
  });

  it('lets the category order win over the default order', () => {
    const overlap: FacetOrder[] = [{ facetKey: 'price', displayOrder: 1 }];
    // category puts price first even though default also ranks rating
    expect(orderFacets(['rating', 'price'], overlap, defaultOrder)).toEqual(['price', 'rating']);
  });

  it('puts a category facet ahead of a default-only facet even if its displayOrder is larger', () => {
    const cat: FacetOrder[] = [{ facetKey: 'capacity', displayOrder: 5 }];
    const def: FacetOrder[] = [{ facetKey: 'price', displayOrder: 1 }];
    expect(orderFacets(['price', 'capacity'], cat, def)).toEqual(['capacity', 'price']);
  });

  it('only returns facets that are available (never invents configured-but-absent ones)', () => {
    expect(orderFacets(['season'], tentOrder, defaultOrder)).toEqual(['season']);
  });

  it('returns an empty array when nothing is available', () => {
    expect(orderFacets([], tentOrder, defaultOrder)).toEqual([]);
  });
});
