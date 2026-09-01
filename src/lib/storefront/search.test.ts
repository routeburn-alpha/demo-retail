import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { orderFacets, search } from './search';
import type { Product } from '$lib/domain/product';
import type { FacetOrder } from '$lib/domain/facets';

// Pure logic over the REAL static catalogue (read from disk, same source the seed uses).
// No DB, no fetch, no mocks — allowed per ARCHITECTURE §4.1 (the search matcher has no I/O).
const realCatalog: Product[] = JSON.parse(readFileSync('static/catalog.json', 'utf-8'));
const isWomens = (p: Product) => /women'?s/i.test(p.name);

describe('fuzzy search with typo tolerance', () => {
  it('matches products with exact query tokens', () => {
    const results = search('jacket', realCatalog);
    expect(results.length).toBeGreaterThan(0);
    expect(results.some((p) => p.name.toLowerCase().includes('jacket'))).toBe(true);
  });

  it('tolerates single-character typos in short tokens (≤5 chars)', () => {
    // "jaket" is a one-character typo of "jacket"; fuzzy matching should surface results.
    const results = search('jaket', realCatalog);
    expect(results.length).toBeGreaterThan(0);
    expect(results.some((p) => p.category.toLowerCase().includes('jacket'))).toBe(true);
  });

  it('tolerates typos in multi-token queries where all tokens match', () => {
    // "shel" (one typo) + "jaket" (one typo) should match "shell jacket"
    const results = search('shel jaket', realCatalog);
    expect(results.length).toBeGreaterThan(0);
    expect(results.some((p) => /shell.*jacket/i.test(`${p.name} ${p.category}`))).toBe(true);
  });

  it('is case-insensitive', () => {
    const lowerResults = search('shell', realCatalog);
    const upperResults = search('SHELL', realCatalog);
    expect(lowerResults).toEqual(upperResults);
  });

  it('requires all query tokens to match (all must have edit distance ≤ threshold)', () => {
    // "jacket" exists, but "xyz" does not and has no close match
    const results = search('jacket xyz', realCatalog);
    expect(results.length).toEqual(0);
  });

  it('returns all products when query is empty or whitespace-only', () => {
    expect(search('', realCatalog)).toEqual(realCatalog);
    expect(search('   ', realCatalog)).toEqual(realCatalog);
  });

  it('does not match when edit distance exceeds threshold for short tokens', () => {
    // "xyz" is too far from any word in the catalog
    const results = search('xyz', realCatalog);
    expect(results.length).toEqual(0);
  });

  it('handles product names and categories (both are searched)', () => {
    // "fleece" is a category; should match fleece products
    const results = search('fleece', realCatalog);
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((p) => `${p.name} ${p.category}`.toLowerCase().includes('fleece') || 
      p.name.toLowerCase().match(/flees/) ||
      p.category.toLowerCase().match(/flees/)
    )).toBe(true);
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
