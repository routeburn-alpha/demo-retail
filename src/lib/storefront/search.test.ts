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
    // "ladies" is a genuine synonym for "women's" but spelled nothing alike, so no
    // edit-distance tolerance should surface the women's line for it either.
    expect(search('ladies', realCatalog)).toEqual([]);
  });
});

describe('fuzzy search (edit-distance tolerant)', () => {
  const isShellJacket = (p: Product) => p.category === 'shell jacket';

  it('tolerates a missing/extra letter per token: "shel jaket" matches "shell jacket"', () => {
    const results = search('shel jaket', realCatalog);
    expect(results.length).toBeGreaterThan(0);
    expect(results.every(isShellJacket)).toBe(true);
  });

  it('tolerates a transposition: "sehll jacket" matches "shell jacket"', () => {
    const results = search('sehll jacket', realCatalog);
    expect(results.length).toBeGreaterThan(0);
    expect(results.every(isShellJacket)).toBe(true);
  });

  it('tolerates a missing character: "shell jacet" matches "shell jacket"', () => {
    const results = search('shell jacet', realCatalog);
    expect(results.length).toBeGreaterThan(0);
    expect(results.every(isShellJacket)).toBe(true);
  });

  it('still matches the exact spelling: "shell jacket"', () => {
    const results = search('shell jacket', realCatalog);
    expect(results.length).toBeGreaterThan(0);
    expect(results.every(isShellJacket)).toBe(true);
  });

  it('does not surface false positives for unrelated text', () => {
    expect(search('xyz', realCatalog)).toEqual([]);
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
