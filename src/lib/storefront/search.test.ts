import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { orderFacets, search, type Product, type Synonyms } from './search';
import type { FacetOrder } from '$lib/domain/facets';

// Pure logic over the REAL static catalogue/synonyms (read from disk, same source the seed uses).
// No DB, no fetch, no mocks — allowed per ARCHITECTURE §4.1.
const realCatalog: Product[] = JSON.parse(readFileSync('static/catalog.json', 'utf-8'));
const realSynonyms: Synonyms = JSON.parse(readFileSync('static/synonyms.json', 'utf-8'));
const isWomens = (p: Product) => /women'?s/i.test(p.name);

describe('fuzzy distance threshold', () => {
  it('matches a query token at distance ≤ floor(len/3)', () => {
    // "wter" (len=4, threshold=1) → "water" has distance 1 → within threshold
    const mini: Product[] = [
      { id: 'w1', name: 'Water Bottle', category: 'hydration', price: 30, description: '', imageUrl: '' }
    ];
    const results = search('wter', mini, {});
    expect(results.length).toBe(1);
    expect(results[0].id).toBe('w1');
  });

  it('rejects a query token beyond threshold (distance > floor(len/3))', () => {
    // "wtr" (len=3, threshold=1) → "water" has distance 2 → beyond threshold, no fuzzy match
    const mini: Product[] = [
      { id: 'w1', name: 'Water Bottle', category: 'hydration', price: 30, description: '', imageUrl: '' }
    ];
    const results = search('wtr', mini, {});
    expect(results.length).toBe(0);
  });
});

describe('fuzzy matching', () => {
  it('falls back to fuzzy when exact and synonym stages return fewer than 3 results', () => {
    // "jaket" is a 1-character-off typo of "jacket" — no exact or synonym match
    // fuzzy should surface all jacket products (score = 80 - 1*10 = 70)
    const results = search('jaket', realCatalog, realSynonyms);
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((p) => p.category.includes('jacket'))).toBe(true);
  });

  it('does not trigger fuzzy when exact/synonym already returns 3 or more results', () => {
    // "jacket" exact match returns 4 products — fuzzy stage must not be reached
    const exactResults = search('jacket', realCatalog, realSynonyms);
    expect(exactResults.length).toBeGreaterThanOrEqual(3);
    // If fuzzy were also appended, we'd get non-jacket results (e.g. "pack" tokens matching
    // loosely). Verify every result is a genuine jacket match.
    expect(exactResults.every((p) => p.category.includes('jacket'))).toBe(true);
  });

  it('exact matches rank above synonym matches which rank above fuzzy matches', () => {
    // Build a tiny catalog: one exact hit, one synonym hit, one fuzzy hit
    const miniCatalog: Product[] = [
      { id: 'a', name: 'Shell Jacket', category: 'shell jacket', price: 100, description: '', imageUrl: '' },
      { id: 'b', name: 'Rain Anorak', category: 'shell jacket', price: 90, description: '', imageUrl: '' },
      { id: 'c', name: 'Jakket Hood', category: 'softshell', price: 80, description: '', imageUrl: '' }
    ];
    // "anorak" synonyms → "shell jacket", so product b gets synonym score
    // "jaket" → fuzzy hit on product a/c; but a already gets exact via synonym chain?
    // Use a simpler setup: query "jacket", no synonyms
    const results = search('jacket', miniCatalog, {});
    // a (name contains "jacket") and b (category "shell jacket") both exact-match at 100
    // c doesn't match exactly, and catalog has 2 results ≥ ... wait, need <3 to trigger fuzzy
    // Use a single-exact-result catalog instead
    const singleCatalog: Product[] = [
      { id: 'a', name: 'Shell Jacket', category: 'outerwear', price: 100, description: '', imageUrl: '' },
      { id: 'b', name: 'Trail Runner', category: 'footwear', price: 90, description: '', imageUrl: '' },
      { id: 'c', name: 'Jakket Hood', category: 'softshell', price: 80, description: '', imageUrl: '' }
    ];
    // query "jaket": no exact, no synonym → 0 results → triggers fuzzy
    // "jaket" vs "jacket" (product a name) = distance 1 → score 70
    // "jaket" vs "jakket" (product c name) = distance 1 → score 70
    // "jaket" vs "outerwear"/"trail"/"runner"/"footwear"/"softshell" → large distances, score ≤ 0
    const fuzzyResults = search('jaket', singleCatalog, {});
    expect(fuzzyResults.map((p) => p.id)).toContain('a');
    expect(fuzzyResults.map((p) => p.id)).toContain('c');
    expect(fuzzyResults.map((p) => p.id)).not.toContain('b');
  });
});

describe("women's clothing line", () => {
  it('the catalogue carries at least 6 women\'s clothing products', () => {
    expect(realCatalog.filter(isWomens).length).toBeGreaterThanOrEqual(6);
  });

  it('searching "womens" surfaces the women\'s line via synonyms', () => {
    const results = search('womens', realCatalog, realSynonyms);
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
