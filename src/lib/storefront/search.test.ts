import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { orderFacets, search, levenshteinDistance, fuzzyMatch } from './search';
import type { Product } from '$lib/domain/product';
import type { FacetOrder } from '$lib/domain/facets';

// Pure logic over the REAL static catalogue (read from disk, same source the seed uses).
// No DB, no fetch, no mocks — allowed per ARCHITECTURE §4.1 (the search matcher has no I/O).
const realCatalog: Product[] = JSON.parse(readFileSync('static/catalog.json', 'utf-8'));
const isWomens = (p: Product) => /women'?s/i.test(p.name);

describe('levenshteinDistance', () => {
  it('returns 1 for "shel" vs "shell" (one insertion)', () => {
    expect(levenshteinDistance('shel', 'shell')).toBe(1);
  });

  it('returns 1 for "jackt" vs "jacket" (one insertion)', () => {
    expect(levenshteinDistance('jackt', 'jacket')).toBe(1);
  });

  it('returns 3+ for "xyz" vs "shell" (3+ edits)', () => {
    expect(levenshteinDistance('xyz', 'shell')).toBeGreaterThanOrEqual(3);
  });
});

describe('fuzzyMatch', () => {
  it('returns true when token "shel" matches "shell jacket" with threshold 2', () => {
    expect(fuzzyMatch('shel', 'shell jacket', 2)).toBe(true);
  });

  it('returns false when token "xyz" does not match "shell jacket" with threshold 2', () => {
    expect(fuzzyMatch('xyz', 'shell jacket', 2)).toBe(false);
  });
});

describe('fuzzy search', () => {
  it('returns Shell Jacket product when searching "shel jaket"', () => {
    const results = search('shel jaket', realCatalog);
    expect(results.length).toBeGreaterThan(0);
    const hasShellJacket = results.some((p) =>
      /shell/i.test(`${p.name} ${p.category}`) && /jacket/i.test(`${p.name} ${p.category}`)
    );
    expect(hasShellJacket).toBe(true);
  });

  it('returns Shell Jacket product when searching exact "shell jacket"', () => {
    const results = search('shell jacket', realCatalog);
    expect(results.length).toBeGreaterThan(0);
    const hasShellJacket = results.some((p) =>
      /shell/i.test(`${p.name} ${p.category}`) && /jacket/i.test(`${p.name} ${p.category}`)
    );
    expect(hasShellJacket).toBe(true);
  });

  it('returns Shell Jacket and related products when searching "sh"', () => {
    const results = search('sh', realCatalog);
    expect(results.length).toBeGreaterThan(0);
    const hasShell = results.some((p) =>
      /shell/i.test(`${p.name} ${p.category}`)
    );
    expect(hasShell).toBe(true);
  });

  it('returns empty array when searching "xyz"', () => {
    expect(search('xyz', realCatalog)).toEqual([]);
  });

  it('returns Shell Jacket when searching case-insensitive "SHEL JAKET"', () => {
    const results = search('SHEL JAKET', realCatalog);
    expect(results.length).toBeGreaterThan(0);
    const hasShellJacket = results.some((p) =>
      /shell/i.test(`${p.name} ${p.category}`) && /jacket/i.test(`${p.name} ${p.category}`)
    );
    expect(hasShellJacket).toBe(true);
  });
});

describe('exact search', () => {
  it('matches every product whose name or category contains all query tokens', () => {
    const results = search('jacket', realCatalog);
    expect(results.length).toBeGreaterThan(0);
    expect(
      results.every((p) => `${p.name} ${p.category}`.toLowerCase().includes('jacket'))
    ).toBe(true);
  });

  it('tolerates typos with fuzzy matching (threshold 2)', () => {
    // "jaket" is a one-character typo of "jacket"; fuzzy matching should surface it.
    const results = search('jaket', realCatalog);
    expect(results.length).toBeGreaterThan(0);
    const hasJacket = results.some((p) =>
      /jacket/i.test(`${p.name} ${p.category}`)
    );
    expect(hasJacket).toBe(true);
  });

  it('fuzzy matches "womens" to "women\'s" with 1 edit distance', () => {
    // "womens" (6 chars) to "women's" (7 chars) is 1 insertion (apostrophe), within threshold 2.
    // This matches products with women's in the name or category.
    const results = search('womens', realCatalog);
    expect(results.length).toBeGreaterThan(0);
    const allWomens = results.every((p) => /women['']?s/i.test(`${p.name} ${p.category}`));
    expect(allWomens).toBe(true);
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
