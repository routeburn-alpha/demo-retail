import type { FacetOrder } from '$lib/domain/facets';
import type { Product } from '$lib/domain/product';

/**
 * Order the facets available for the current results by a category's configured ordering,
 * falling back to the default ordering. Pure (no I/O) — the caller (`+page.server.ts`) loads
 * `categoryOrder` / `defaultOrder` via the facet-ordering port and passes them in.
 *
 * Rules: the category's facets come first in `displayOrder`, then any default-only facets in their
 * `displayOrder` (so a category facet always precedes a default-only one, regardless of the numeric
 * order value); facets configured in neither keep their original relative order at the end; only
 * facets present in `available` are returned (a configured-but-absent facet is never invented).
 */
export function orderFacets(
  available: string[],
  categoryOrder: FacetOrder[],
  defaultOrder: FacetOrder[] = []
): string[] {
  const rank = new Map<string, number>();
  const byDisplayOrder = (a: FacetOrder, b: FacetOrder) => a.displayOrder - b.displayOrder;
  // Category config first (wins overlaps), then the default config fills in the rest.
  for (const config of [categoryOrder, defaultOrder]) {
    for (const { facetKey } of [...config].sort(byDisplayOrder)) {
      if (!rank.has(facetKey)) rank.set(facetKey, rank.size);
    }
  }
  return available
    .map((facetKey, index) => ({ facetKey, index, r: rank.get(facetKey) ?? Infinity }))
    .sort((a, b) => a.r - b.r || a.index - b.index)
    .map((entry) => entry.facetKey);
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  // Use two-row rolling array for memory efficiency.
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  let curr = new Array<number>(n + 1);
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      curr[j] =
        a[i - 1] === b[j - 1]
          ? prev[j - 1]
          : 1 + Math.min(prev[j], curr[j - 1], prev[j - 1]);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n];
}

const FUZZY_THRESHOLD = 2;

/**
 * Fuzzy search: a product matches when every query token is within `FUZZY_THRESHOLD` edit
 * distance of at least one whitespace-delimited word in its name or category.
 */
export function fuzzySearch(query: string, catalog: Product[]): Product[] {
  const trimmed = query.trim();
  if (!trimmed) return catalog;

  const tokens = trimmed.toLowerCase().split(/\s+/).filter(Boolean);
  return catalog.filter((product) => {
    const words = `${product.name} ${product.category}`.toLowerCase().split(/\s+/).filter(Boolean);
    return tokens.every((token) => words.some((word) => levenshtein(token, word) <= FUZZY_THRESHOLD));
  });
}

/**
 * Search the catalog for products matching the query. Exact token-substring matching runs first;
 * when exact results are ≤ 3, fuzzy matching fills in additional results (appended after exact
 * matches to preserve exact-match-first ranking).
 */
export function search(query: string, catalog: Product[]): Product[] {
  const trimmed = query.trim();
  if (!trimmed) return catalog;

  const tokens = trimmed.toLowerCase().split(/\s+/).filter(Boolean);
  const exactResults = catalog.filter((product) => {
    const haystack = `${product.name} ${product.category}`.toLowerCase();
    return tokens.every((token) => haystack.includes(token));
  });

  if (exactResults.length > 3) return exactResults;

  // Fuzzy fallback: append fuzzy-only matches after the exact matches.
  const fuzzyResults = fuzzySearch(query, catalog);
  const exactIds = new Set(exactResults.map((p) => p.id));
  const additionalFuzzy = fuzzyResults.filter((p) => !exactIds.has(p.id));
  return [...exactResults, ...additionalFuzzy];
}
