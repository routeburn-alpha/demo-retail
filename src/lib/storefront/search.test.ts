import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { editDistance, orderFacets, search, type Product, type Synonyms } from './search';
import type { FacetOrder } from '$lib/domain/facets';

// Pure logic over the REAL static catalogue/synonyms (read from disk, same source the seed uses).
// No DB, no fetch, no mocks — allowed per ARCHITECTURE §4.1.
const realCatalog: Product[] = JSON.parse(readFileSync('static/catalog.json', 'utf-8'));
const realSynonyms: Synonyms = JSON.parse(readFileSync('static/synonyms.json', 'utf-8'));
const isWomens = (p: Product) => /women'?s/i.test(p.name);

describe("women's clothing line", () => {
  it('the catalogue carries at least 6 women\'s clothing products', () => {
    expect(realCatalog.filter(isWomens).length).toBeGreaterThanOrEqual(6);
  });

  it('searching "womens" surfaces the women\'s line via synonyms', () => {
    const results = search('womens', realCatalog, realSynonyms);
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

// Pure unit tests — editDistance and fuzzy search have no I/O.
describe('fuzzy search (typo tolerance)', () => {
  it('editDistance returns 0 for identical strings', () => {
    expect(editDistance('jacket', 'jacket')).toBe(0);
  });

  it('editDistance("jakcet", "jacket") is ≤ 2 (transposition typo)', () => {
    expect(editDistance('jakcet', 'jacket')).toBeLessThanOrEqual(2);
  });

  it('editDistance("wterproof", "waterproof") is ≤ 2 (missing letter typo)', () => {
    expect(editDistance('wterproof', 'waterproof')).toBeLessThanOrEqual(2);
  });

  it('editDistance rejects large differences (> 2) — "xyz" vs "waterproof"', () => {
    expect(editDistance('xyz', 'waterproof')).toBeGreaterThan(2);
  });

  it('fuzzy search: "jakcet" matches products with "jacket" in name/category', () => {
    const results = search('jakcet', realCatalog, realSynonyms);
    expect(results.length).toBeGreaterThan(0);
    expect(results.some((p) => /jacket/i.test(p.name + ' ' + p.category))).toBe(true);
  });

  it('fuzzy search: "wterproof jakcet" matches a waterproof jacket product', () => {
    const results = search('wterproof jakcet', realCatalog, realSynonyms);
    expect(results.length).toBeGreaterThan(0);
    expect(
      results.some((p) =>
        /waterproof/i.test(p.name + ' ' + p.description) &&
        /jacket/i.test(p.name + ' ' + p.category)
      )
    ).toBe(true);
  });

  it('fuzzy search does not match short tokens with distant targets — "xyz" returns no results', () => {
    const results = search('xyz', realCatalog, realSynonyms);
    expect(results.length).toBe(0);
  });
});
