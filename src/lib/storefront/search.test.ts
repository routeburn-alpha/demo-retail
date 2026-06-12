import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { editDistance, orderFacets, search, type Product, type Synonyms } from './search';
import type { FacetOrder } from '$lib/domain/facets';

// Pure logic over the REAL static catalogue/synonyms (read from disk, same source the seed uses).
// No DB, no fetch, no mocks — allowed per ARCHITECTURE §4.1.
const realCatalog: Product[] = JSON.parse(readFileSync('static/catalog.json', 'utf-8'));
const realSynonyms: Synonyms = JSON.parse(readFileSync('static/synonyms.json', 'utf-8'));
const isWomens = (p: Product) => /women'?s/i.test(p.name);

// Pure unit tests for editDistance — no I/O, allowed per ARCHITECTURE §4.1 and no-mocks standard.
describe('editDistance', () => {
  it('returns 1 for a single insertion ("wter" → "water")', () => {
    expect(editDistance('wter', 'water')).toBe(1);
  });

  it('returns 1 for a single deletion ("bottl" → "bottle")', () => {
    expect(editDistance('bottl', 'bottle')).toBe(1);
  });

  it('returns 2 for a transposition ("teh" → "the") — standard Levenshtein', () => {
    expect(editDistance('teh', 'the')).toBe(2);
  });

  it('returns 0 for identical strings', () => {
    expect(editDistance('water', 'water')).toBe(0);
  });

  it('returns a large distance for completely different strings', () => {
    expect(editDistance('xyz', 'water')).toBeGreaterThan(2);
  });
});

// Pure unit test — fuzzy search over real catalog (read from disk, no DB, no fetch).
describe('fuzzy search', () => {
  it('a misspelled query ("wter") returns the water bottle product', () => {
    const results = search('wter', realCatalog, realSynonyms);
    expect(results.some((p) => p.id === 'bottle-001')).toBe(true);
  });

  it('a badly misspelled query ("xzqwrt") returns no results', () => {
    const results = search('xzqwrt', realCatalog, realSynonyms);
    expect(results.length).toBe(0);
  });
});

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
