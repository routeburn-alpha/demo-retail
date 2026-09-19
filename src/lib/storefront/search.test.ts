import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { isFuzzyMatch, levenshteinDistance, orderFacets, search } from './search';
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

// Pure unit tests — levenshteinDistance/isFuzzyMatch have no I/O, allowed per
// standards/no-mocks.md (search.ts is named there as the example of no-I/O logic).

describe('levenshteinDistance', () => {
  it('counts a single substitution', () => {
    expect(levenshteinDistance('jaket', 'jacket')).toBe(1);
  });

  it('counts a single insertion', () => {
    expect(levenshteinDistance('shel', 'shell')).toBe(1);
  });

  it('counts a single deletion', () => {
    expect(levenshteinDistance('fleese', 'fleece')).toBe(1);
  });

  it('returns the full edit distance for unrelated strings', () => {
    expect(levenshteinDistance('xyz', 'abc')).toBe(3);
  });
});

describe('isFuzzyMatch', () => {
  it('matches a token within the default distance threshold', () => {
    expect(isFuzzyMatch('jaket', 'jacket')).toBe(true);
  });

  it('does not match a token that exceeds the default distance threshold', () => {
    expect(isFuzzyMatch('jaket', 'shell')).toBe(false);
  });
});
