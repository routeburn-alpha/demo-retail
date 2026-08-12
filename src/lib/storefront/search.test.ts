import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { orderFacets, search, type Product } from './search';
import type { FacetOrder } from '$lib/domain/facets';

// Pure logic over the REAL static catalogue (read from disk, same source the seed uses).
// No DB, no fetch, no mocks — allowed per ARCHITECTURE §4.1 (the search matcher has no I/O).
const realCatalog: Product[] = JSON.parse(readFileSync('static/catalog.json', 'utf-8'));
const isWomens = (p: Product) => /women'?s/i.test(p.name);
const isJacket = (p: Product) => /jacket/i.test(`${p.name} ${p.category}`);

describe('exact search', () => {
  it('matches every product whose name or category contains all query tokens', () => {
    const results = search('jacket', realCatalog);
    expect(results.length).toBeGreaterThan(0);
    expect(results.every(isJacket)).toBe(true);
  });
});

describe('fuzzy search (typo tolerance)', () => {
  it('matches a 1-character typo: "jaket" surfaces jacket products', () => {
    const results = search('jaket', realCatalog);
    expect(results.length).toBeGreaterThan(0);
    expect(results.every(isJacket)).toBe(true);
  });

  it('matches an abbreviation within edit distance 2: "jckt" surfaces jacket products', () => {
    const results = search('jckt', realCatalog);
    expect(results.length).toBeGreaterThan(0);
    expect(results.every(isJacket)).toBe(true);
  });

  it('fuzzy-matches apostrophe variants: "womens" surfaces the women\'s line', () => {
    const results = search('womens', realCatalog);
    expect(results.length).toBeGreaterThan(0);
    expect(results.every(isWomens)).toBe(true);
  });

  it('still requires all tokens to match (conjunctive AND)', () => {
    // "jaket" fuzzy-matches jackets; "down" exact-matches down jackets only
    const results = search('jaket down', realCatalog);
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((p) => isJacket(p) && /down/i.test(`${p.name} ${p.category}`))).toBe(
      true
    );
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

describe('acceptance criteria — spec-driven fuzzy matching', () => {
  // Minimal synthetic catalog for the goretex test (real catalog has no Gore-Tex products).
  const syntheticCatalog: Product[] = [
    {
      id: 'gore-001',
      name: 'Gore-Tex Rain Jacket',
      category: 'rain jacket',
      price: 400,
      description: '',
      imageUrl: ''
    },
    ...realCatalog
  ];

  it('"goretex rain jckt" finds gore-tex rain jackets', () => {
    const results = search('goretex rain jckt', syntheticCatalog);
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((p) => /gore.?tex/i.test(p.name) && /rain/i.test(`${p.name} ${p.category}`))).toBe(true);
  });

  it('"shell jckt" finds shell jackets', () => {
    const results = search('shell jckt', realCatalog);
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((p) => /shell/i.test(`${p.name} ${p.category}`))).toBe(true);
  });

  it('"fleese" (typo) finds fleece items', () => {
    const results = search('fleese', realCatalog);
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((p) => /fleece/i.test(`${p.name} ${p.category}`))).toBe(true);
  });

  it('"x" does not match shell products (no false positives for single-char tokens)', () => {
    const shellIds = new Set(
      realCatalog.filter((p) => /shell/i.test(`${p.name} ${p.category}`)).map((p) => p.id)
    );
    const results = search('x', realCatalog);
    expect(results.some((p) => shellIds.has(p.id))).toBe(false);
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
