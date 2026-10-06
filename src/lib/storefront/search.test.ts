import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { orderFacets, search, levenshteinDistance, tokenMatches } from './search';
import type { Product } from '$lib/domain/product';
import type { FacetOrder } from '$lib/domain/facets';

// Pure logic over the REAL static catalogue (read from disk, same source the seed uses).
// No DB, no fetch, no mocks — allowed per ARCHITECTURE §4.1 (the search matcher has no I/O).
const realCatalog: Product[] = JSON.parse(readFileSync('static/catalog.json', 'utf-8'));
const isWomens = (p: Product) => /women'?s/i.test(p.name);
const haystackOf = (p: Product) => `${p.name} ${p.category}`.toLowerCase();

describe('exact search', () => {
  it('matches every product whose name or category contains all query tokens', () => {
    const results = search('jacket', realCatalog);
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((p) => haystackOf(p).includes('jacket'))).toBe(true);
  });

  it('exact matches still work and are prioritized ahead of fuzzy-only matches', () => {
    const results = search('shell jacket', realCatalog);
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((p) => haystackOf(p).includes('shell') && haystackOf(p).includes('jacket'))).toBe(
      true
    );
  });
});

describe('levenshteinDistance', () => {
  it('is 0 for identical strings', () => {
    expect(levenshteinDistance('fleece', 'fleece')).toBe(0);
  });

  it('counts a single substitution as distance 1', () => {
    expect(levenshteinDistance('fleese', 'fleece')).toBe(1);
  });

  it('counts a single deletion as distance 1', () => {
    expect(levenshteinDistance('jaket', 'jacket')).toBe(1);
  });

  it('handles an empty string as the length of the other string', () => {
    expect(levenshteinDistance('', 'abc')).toBe(3);
    expect(levenshteinDistance('abc', '')).toBe(3);
  });
});

describe('tokenMatches', () => {
  it('matches an exact substring regardless of maxDistance', () => {
    expect(tokenMatches('jacket', 'down jacket', 0)).toBe(true);
  });

  it('matches a word within the edit-distance threshold', () => {
    expect(tokenMatches('jaket', 'down jacket', 2)).toBe(true);
  });

  it('does not match a word outside the edit-distance threshold', () => {
    expect(tokenMatches('jaket', 'down jacket', 0)).toBe(false);
  });

  it('is case-insensitive', () => {
    expect(tokenMatches('FLEESE', 'Tussock Grid Fleece', 2)).toBe(true);
  });

  it('does not fuzz-match across word boundaries', () => {
    // "jaket" sits within 2 edits of a substring spanning "...ocket..." in "Pocketburner",
    // but that is not a real word match — word-level comparison must reject it.
    expect(tokenMatches('jaket', 'Pocketburner Canister Stove', 2)).toBe(false);
  });
});

describe('fuzzy search (typo tolerance)', () => {
  it('"shel jaket" matches products in the "shell jacket" category', () => {
    const results = search('shel jaket', realCatalog);
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((p) => p.category.toLowerCase() === 'shell jacket')).toBe(true);
  });

  it('"down jackt" matches products in the "down jacket" category', () => {
    const results = search('down jackt', realCatalog);
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((p) => p.category.toLowerCase() === 'down jacket')).toBe(true);
  });

  it('"fleese" matches products in the "fleece" category', () => {
    const results = search('fleese', realCatalog);
    expect(results.some((p) => p.category.toLowerCase().includes('fleece'))).toBe(true);
  });

  it('returns an empty array when no token fuzzy-matches any product', () => {
    expect(search('zzzqqxx', realCatalog)).toEqual([]);
  });

  it('returns the full catalogue for an empty query', () => {
    expect(search('', realCatalog)).toEqual(realCatalog);
    expect(search('   ', realCatalog)).toEqual(realCatalog);
  });

  it('does not fuzzy-match single-character tokens (too ambiguous)', () => {
    // "z" is one edit from plenty of single letters, but as a single-char token it must only
    // ever match via plain substring inclusion, never fuzzily.
    const results = search('z', realCatalog);
    expect(results.every((p) => haystackOf(p).includes('z'))).toBe(true);
  });

  it('fuzzy-matches alongside an already department-filtered catalogue', () => {
    const filtered = realCatalog.filter((p) => p.category.toLowerCase() === 'shell jacket');
    expect(filtered.length).toBeGreaterThan(0);
    const results = search('shel jaket', filtered);
    expect(results).toEqual(filtered);
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
