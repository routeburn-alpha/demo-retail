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

  it('does not expand synonyms (no semantic mapping between unrelated words)', () => {
    // "coat" is a real synonym for jacket but shares no characters at low edit distance with
    // "jacket" or "shell" — only a semantic synonym layer (not implemented) would surface it.
    expect(search('coat', realCatalog)).toEqual([]);
  });
});

// Fuzzy/typo-tolerance tests — still pure logic over the real catalogue (no I/O, no network,
// deterministic): search() is a synchronous function over an in-memory array, so it is exercised
// directly rather than through a running dev server or a DB.
describe('fuzzy search (typo tolerance)', () => {
  it('tolerates a one-character typo in every token ("shel jaket" -> shell jacket)', () => {
    const results = search('shel jaket', realCatalog);
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((p) => p.category === 'shell jacket')).toBe(true);
  });

  it('matches a single-token typo ("shel" -> shell)', () => {
    const results = search('shel', realCatalog);
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((p) => p.category === 'shell jacket')).toBe(true);
  });

  it('matches a single-token typo ("jackt" -> jacket)', () => {
    const results = search('jackt', realCatalog);
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((p) => p.category.includes('jacket'))).toBe(true);
  });

  it('does not match a query with edits beyond the fuzzy threshold ("xxshell")', () => {
    // Two insertions at the start of "shell" — outside the tolerated edit distance.
    expect(search('xxshell', realCatalog)).toEqual([]);
  });

  it('ranks exact matches ahead of fuzzy matches', () => {
    // The real catalogue has no two products where the same query is an exact hit for one and a
    // one-edit-away fuzzy hit for another, so this isolates the ranking guarantee with a minimal
    // hand-built fixture instead of static/catalog.json — still pure, still no I/O.
    const base: Omit<Product, 'id' | 'name' | 'category'> = {
      price: 100,
      description: 'fixture product',
      imageUrl: '/products/fixture.jpg'
    };
    const fixture: Product[] = [
      { ...base, id: 'fuzzy-1', name: 'Ridge Jacke', category: 'outerwear' }, // typo of "jacket"
      { ...base, id: 'exact-1', name: 'Summit Jacket', category: 'outerwear' } // literal "jacket"
    ];
    expect(search('jacket', fixture).map((p) => p.id)).toEqual(['exact-1', 'fuzzy-1']);
  });

  it('treats an empty query as before (returns the full catalogue, no fuzzy fallback)', () => {
    expect(search('', realCatalog)).toEqual(realCatalog);
  });

  it('treats a query under 2 characters as before (plain exact substring match, no fuzzy fallback)', () => {
    const results = search('a', realCatalog);
    const expectedUnderOldBehavior = realCatalog.filter((p) =>
      `${p.name} ${p.category}`.toLowerCase().includes('a')
    );
    expect(results).toEqual(expectedUnderOldBehavior);
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
