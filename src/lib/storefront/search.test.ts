import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { orderFacets, search, fuzzySearch } from './search';
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

// Pure unit test — fuzzySearch has no I/O (it receives the catalogue as input), so a unit test is
// allowed per ARCHITECTURE §4.1 / the no-mocks standard's pure-logic exception. No DB, no mocks.

const makeProduct = (overrides: Partial<Product> & Pick<Product, 'id' | 'name' | 'category'>) => ({
  price: 100,
  description: '',
  imageUrl: '',
  ...overrides
});

describe('fuzzySearch', () => {
  it('matches typo\'d tokens: "shel jaket" surfaces the shell jacket products', () => {
    const results = fuzzySearch('shel jaket', realCatalog);
    const names = results.map((p) => p.name);
    expect(names).toContain('Storm Cirrus Shell');
    expect(names).toContain("Aurora Women's 3L Shell");
    expect(
      results.every((p) => `${p.name} ${p.category}`.toLowerCase().includes('shell'))
    ).toBe(true);
  });

  it('does not fuzzy-match tokens under 4 characters', () => {
    // "cat" is a one-edit typo of "cap", but 3-char tokens get no fuzzy tolerance.
    const catalog = [makeProduct({ id: 'p1', name: 'Trail Cap', category: 'headwear' })];
    expect(fuzzySearch('cat', catalog)).toEqual([]);
  });

  it('ranks an exact/substring match above a fuzzy-only match for the same query', () => {
    const fuzzyOnly = makeProduct({ id: 'p1', name: 'Trail Jaket', category: 'outerwear' });
    const exact = makeProduct({ id: 'p2', name: 'Trail Jacket', category: 'outerwear' });
    // Fuzzy-only product listed first in the input catalog on purpose: ranking, not
    // input order, must put the exact match first.
    const results = fuzzySearch('jacket', [fuzzyOnly, exact]);
    expect(results.map((p) => p.id)).toEqual(['p2', 'p1']);
  });

  it('returns no results for a query that matches nothing, even fuzzily', () => {
    expect(fuzzySearch('zzqqxx', realCatalog)).toEqual([]);
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
