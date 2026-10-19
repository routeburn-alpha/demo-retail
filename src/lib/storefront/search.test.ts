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

  it('exact-match baseline queries are unchanged by fuzzy matching', () => {
    // Every token here is a literal substring of some product, so fuzzy matching never kicks
    // in — same result set as before the fuzzy matcher was added.
    expect(search('tent', realCatalog)).toEqual(
      realCatalog.filter((p) => `${p.name} ${p.category}`.toLowerCase().includes('tent'))
    );
    expect(search("women's", realCatalog).every(isWomens)).toBe(true);
  });
});

// Fuzzy token matching: a query token of 4+ characters also matches a product token within a
// bounded Levenshtein edit distance (1 edit for 4-6 chars, 2 edits for 7+). Pure logic, no I/O —
// same realCatalog fixture and synthetic in-memory fixtures below, no DB/fetch involved.
function makeProduct(name: string, category: string): Product {
  return { id: name, name, category, price: 1, description: '', imageUrl: '' };
}

describe('fuzzy token matching', () => {
  it('"shel jaket" (two one-letter typos) surfaces the Storm Cirrus Shell jacket', () => {
    const results = search('shel jaket', realCatalog);
    expect(results.some((p) => p.name === 'Storm Cirrus Shell')).toBe(true);
  });

  it('a single-letter typo in a 4-6 character token still matches ("jaket" vs "jacket")', () => {
    const results = search('jaket', realCatalog);
    expect(results.length).toBeGreaterThan(0);
  });

  it('short tokens (<4 chars) get exact/substring matching only, never fuzzy', () => {
    const catalog = [makeProduct('Trail Cap', 'headwear'), makeProduct('Trail Cab', 'headwear')];
    // "cap" is a literal substring of "Trail Cap" only; "Trail Cab" is one edit away but its
    // length (3) is below the fuzzy floor, so it must not surface.
    expect(search('cap', catalog).map((p) => p.name)).toEqual(['Trail Cap']);
  });

  it('exact hits rank before fuzzy hits, regardless of catalogue order', () => {
    // "Typo Only" precedes "Exact Match" in the catalogue, but only matches "jacket" fuzzily
    // (its category is "jaket"), so it must still rank after the exact match.
    const catalog = [makeProduct('Typo Only', 'jaket'), makeProduct('Exact Match', 'jacket')];
    expect(search('jacket', catalog).map((p) => p.name)).toEqual(['Exact Match', 'Typo Only']);
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
