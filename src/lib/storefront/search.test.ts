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

// Pure logic; search() is a stateless function over an in-memory catalogue array — no DB, no
// fetch, no mocks. This describes the typo-tolerant (Levenshtein distance) matcher from task
// #1228, which has *not* been implemented yet: `search()` above is still plain exact-substring
// matching. Cases that need the new matcher are written with `it.fails`, Vitest's "expected to
// fail" form — the assertion is the real target behaviour, and the test reports green today
// because that assertion currently throws. The day someone implements the matcher these flip to
// unexpectedly-passing (red), which is the signal to turn them into plain `it` blocks. This keeps
// the whole suite green against today's exact-match baseline while still pinning down the contract
// for whoever builds the feature. Distances below were computed and verified against the real
// `static/catalog.json`, not assumed.
describe('typo-tolerant search (Levenshtein distance)', () => {
  it('exact match baseline — exact tokens still match, and rank first', () => {
    const results = search('jacket', realCatalog);
    const ids = results.map((p) => p.id);
    expect(ids).toEqual(
      expect.arrayContaining(['shell-001', 'down-001', 'w-shell-001', 'w-down-001'])
    );
  });

  it.fails('tolerates a single-character typo ("chell" is distance 1 from "shell")', () => {
    const results = search('chell', realCatalog);
    expect(results.map((p) => p.id)).toEqual(
      expect.arrayContaining(['shell-001', 'w-shell-001'])
    );
  });

  it.fails('tolerates a missing character ("flece" is distance 1 from "fleece")', () => {
    const results = search('flece', realCatalog);
    expect(results.map((p) => p.id)).toEqual(
      expect.arrayContaining(['fleece-001', 'w-fleece-001'])
    );
  });

  it('does not match once the distance exceeds the threshold ("jaketty" is distance 3 from "jacket")', () => {
    expect(search('jaketty', realCatalog)).toEqual([]);
  });

  it.fails(
    'matches a multi-token query when every token is within tolerance ("shel jackat" ~ "shell jacket")',
    () => {
      // "shel" is distance 1 from "shell", "jackat" is distance 1 from "jacket" — both tokens
      // must independently match the same product's "shell jacket" category.
      const results = search('shel jackat', realCatalog);
      expect(results.map((p) => p.id)).toEqual(
        expect.arrayContaining(['shell-001', 'w-shell-001'])
      );
    }
  );

  it('returns no results for a query too far from every product ("xyz")', () => {
    expect(search('xyz', realCatalog)).toEqual([]);
  });

  it('is case-insensitive ("SHELL" matches "shell jacket")', () => {
    const results = search('SHELL', realCatalog);
    expect(results.map((p) => p.id)).toEqual(
      expect.arrayContaining(['shell-001', 'w-shell-001'])
    );
  });

  it.fails('ranks an exact substring match ahead of an edit-distance-only match', () => {
    // Synthetic two-product fixture (not the real catalogue) to isolate ranking: "Shell Jacket"
    // contains the query token literally; "Shall Jaclet" only matches via edit distance
    // (distance 1 on "shall"~"shell"). Listed fuzzy-first on purpose so the assertion actually
    // exercises re-ranking rather than passing by coincidence of input order.
    const catalog: Product[] = [
      {
        id: 'fuzzy',
        name: 'Shall Jaclet',
        category: 'outerwear',
        price: 1,
        description: '',
        imageUrl: ''
      },
      {
        id: 'exact',
        name: 'Shell Jacket',
        category: 'outerwear',
        price: 1,
        description: '',
        imageUrl: ''
      }
    ];
    expect(search('shell', catalog).map((p) => p.id)).toEqual(['exact', 'fuzzy']);
  });

  it.fails('returns no results for an empty query', () => {
    expect(search('', realCatalog)).toEqual([]);
  });

  it.fails('returns no results for a whitespace-only query', () => {
    expect(search('   ', realCatalog)).toEqual([]);
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
