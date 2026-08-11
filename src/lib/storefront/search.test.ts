import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { orderFacets, search, type Product } from './search';
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
});

describe('fuzzy search', () => {
  // Synthetic mini-catalog for algorithm-level assertions (no I/O — pure unit test).
  const mini: Product[] = [
    {
      id: '1',
      name: 'Trail Jacket',
      category: 'shell jacket',
      price: 200,
      description: '',
      imageUrl: ''
    },
    {
      id: '2',
      name: 'Gore-Tex Hardshell',
      category: 'shell jacket',
      price: 350,
      description: '',
      imageUrl: ''
    },
    {
      id: '3',
      name: 'Fleece Pullover',
      category: 'midlayer',
      price: 120,
      description: '',
      imageUrl: ''
    }
  ];

  it('matches a 2-edit typo: "jckt" matches products with "jacket"', () => {
    const results = search('jckt', mini);
    expect(results.map((p) => p.id)).toContain('1');
  });

  it('matches across a hyphen: "goretex" matches "Gore-Tex"', () => {
    const results = search('goretex', mini);
    expect(results.map((p) => p.id)).toContain('2');
  });

  it('does not match when edit distance exceeds 2', () => {
    // "fleec" is 1 edit from "fleece", but "pullovr" is 2 edits from "pullover" — both fine.
    // "xxxxxx" has no close match anywhere.
    expect(search('xxxxxx', mini)).toEqual([]);
  });

  it('tolerates a 1-edit typo against the real catalogue: "jaket" matches jacket products', () => {
    const results = search('jaket', realCatalog);
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((p) => /jacket/i.test(`${p.name} ${p.category}`))).toBe(true);
  });

  it('"womens" (1 edit from "women\'s") surfaces the women\'s line', () => {
    const results = search('womens', realCatalog);
    expect(results.length).toBeGreaterThan(0);
    expect(results.every(isWomens)).toBe(true);
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
