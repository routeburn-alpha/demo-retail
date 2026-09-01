import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { orderFacets, search, fuzzyMatch } from './search';
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

  it('does not tolerate typos (fuzzy matching removed)', () => {
    // "jaket" is a one-character typo of "jacket"; exact matching surfaces nothing.
    expect(search('jaket', realCatalog)).toEqual([]);
  });

  it('does not expand synonyms (synonym matching removed)', () => {
    // "womens" (no apostrophe) is not a literal token in any name/category — only the
    // removed synonym layer used to surface the women's line for it.
    expect(search('womens', realCatalog)).toEqual([]);
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

// Pure unit test — fuzzyMatch has no I/O (receives inputs, computes Levenshtein distance),
// so unit tests are allowed per ARCHITECTURE §4.1. No DB, no mocks.

describe('fuzzy search matching', () => {
  it('performs exact token match as baseline', () => {
    const results = fuzzyMatch('jacket', realCatalog);
    expect(results.length).toBeGreaterThan(0);
    expect(results.some((p) => p.name.toLowerCase().includes('jacket'))).toBe(true);
  });

  it('tolerates typos within Levenshtein distance threshold', () => {
    // "shel" is distance 1 from "shell"; "jaket" is distance 1 from "jacket"
    const results = fuzzyMatch('shel jaket', realCatalog, { maxDistance: 1 });
    expect(results.length).toBeGreaterThan(0);
    // Should find products with "shell" and "jacket" despite typos
    expect(results.some((p) => p.name.toLowerCase().includes('shell') || p.name.toLowerCase().includes('jacket'))).toBe(true);
  });

  it('matches case-insensitive queries', () => {
    const results = fuzzyMatch('JACKET', realCatalog);
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((p) => `${p.name} ${p.category}`.toLowerCase().includes('jacket'))).toBe(true);
  });

  it('performs partial token matching within distance threshold', () => {
    // "jac" is distance 2 from "jacket"
    const results = fuzzyMatch('jac', realCatalog, { maxDistance: 2 });
    expect(results.length).toBeGreaterThan(0);
  });

  it('returns no matches when distance exceeds threshold', () => {
    // "xyz" is distance too far from common product tokens
    const results = fuzzyMatch('xyz', realCatalog, { maxDistance: 1 });
    expect(results).toEqual([]);
  });

  it('returns empty results for empty query', () => {
    const results = fuzzyMatch('', realCatalog);
    expect(results).toEqual([]);
  });

  it('requires all query tokens to match (AND logic)', () => {
    // Both "shell" and "jacket" should be present in matches
    const results = fuzzyMatch('shell jacket', realCatalog, { maxDistance: 0 });
    expect(
      results.every((p) => {
        const haystack = `${p.name} ${p.category}`.toLowerCase();
        return haystack.includes('shell') && haystack.includes('jacket');
      })
    ).toBe(true);
  });
});

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
