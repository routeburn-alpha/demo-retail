import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { orderFacets, search, fuzzySearch } from './search';
import type { Product } from '$lib/domain/product';
import type { FacetOrder } from '$lib/domain/facets';

// Pure logic over the REAL static catalogue (read from disk, same source the seed uses).
// No DB, no fetch, no mocks — allowed per ARCHITECTURE §4.1 (the search matcher has no I/O).
const realCatalog: Product[] = JSON.parse(readFileSync('static/catalog.json', 'utf-8'));
const isWomens = (p: Product) => /women'?s/i.test(p.name);

// Minimal catalog for exact-before-fuzzy ordering tests.
const miniCatalog: Product[] = [
  { id: 'ex', name: 'Exact Product', category: 'exact match', price: 10, description: '', imageUrl: '' },
  { id: 'fz', name: 'Fuzzy Prodact', category: 'fuzzy only', price: 10, description: '', imageUrl: '' }
];

describe('exact search', () => {
  it('matches every product whose name or category contains all query tokens', () => {
    const results = search('jacket', realCatalog);
    expect(results.length).toBeGreaterThan(0);
    expect(
      results.every((p) => `${p.name} ${p.category}`.toLowerCase().includes('jacket'))
    ).toBe(true);
  });

  it('fuzzy matching surfaces women\'s products for "womens" (distance 1 from "women\'s")', () => {
    // "womens" is distance 1 from "women's" — fuzzy search closes the gap without a synonym layer.
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

describe('fuzzy search', () => {
  it('activates when exact results are empty — "jaket" returns jacket products', () => {
    // "jaket" is distance 1 from "jacket"; exact matching surfaces nothing, fuzzy takes over.
    const results = search('jaket', realCatalog);
    expect(results.length).toBeGreaterThan(0);
    expect(
      results.every((p) => `${p.name} ${p.category}`.toLowerCase().includes('jacket'))
    ).toBe(true);
  });

  it('returns exact matches before fuzzy-only results', () => {
    // "product" exactly matches id="ex" (name: "Exact Product").
    // "prodact" is distance 2 from "product" so id="fz" (name: "Fuzzy Prodact") is a fuzzy match.
    const results = search('product', miniCatalog);
    expect(results.map((p) => p.id)).toEqual(['ex', 'fz']);
  });

  it('"shel jaket" returns shell jacket products ranked before any other fuzzy matches', () => {
    // "shel" is distance 1 from "shell"; "jaket" is distance 1 from "jacket".
    // Shell jacket products match both tokens; other products fail at least one.
    const results = search('shel jaket', realCatalog);
    const shellJackets = results.filter((p) => p.category === 'shell jacket');
    expect(shellJackets.length).toBeGreaterThan(0);
    // Shell jacket products occupy the leading positions.
    const leading = results.slice(0, shellJackets.length);
    expect(leading.every((p) => p.category === 'shell jacket')).toBe(true);
  });

  it('matches at distance 2 — "jakt" finds jacket products', () => {
    // "jakt" requires two edits to become "jacket" (insert 'c', insert 'e').
    const results = search('jakt', realCatalog);
    expect(results.length).toBeGreaterThan(0);
    expect(
      results.every((p) => `${p.name} ${p.category}`.toLowerCase().includes('jacket'))
    ).toBe(true);
  });

  it('does not match at distance 3 — "jkt" finds nothing', () => {
    // "jkt" is distance 3 from "jacket" and ≥ 3 from every other catalog word.
    expect(search('jkt', realCatalog)).toEqual([]);
  });

  it('fuzzySearch directly returns all products fuzzy-matching a token', () => {
    const results = fuzzySearch('jaket', realCatalog);
    expect(results.length).toBeGreaterThan(0);
    expect(
      results.every((p) => `${p.name} ${p.category}`.toLowerCase().includes('jacket'))
    ).toBe(true);
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
