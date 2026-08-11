import type { FacetOrder } from '$lib/domain/facets';

export type Product = {
  id: string;
  name: string;
  category: string;
  price: number;
  salePrice?: number;
  discountPct?: number;
  description: string;
  imageUrl: string;
};

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

/** Iterative Levenshtein distance between two strings. */
function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[] = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const temp = dp[j];
      dp[j] = a[i - 1] === b[j - 1] ? prev : 1 + Math.min(prev, dp[j], dp[j - 1]);
      prev = temp;
    }
  }
  return dp[n];
}

/**
 * Fuzzy token-based search: a product matches when every whitespace-separated query token
 * fuzzy-matches (Levenshtein distance ≤ 2) at least one whitespace-separated token in the
 * product's name or category (case-insensitive). Handles hyphenated words (e.g. "gore-tex")
 * as single tokens so "goretex" matches with distance 1.
 */
export function search(query: string, catalog: Product[]): Product[] {
  const trimmed = query.trim();
  if (!trimmed) return catalog;

  const queryTokens = trimmed.toLowerCase().split(/\s+/).filter(Boolean);
  return catalog.filter((product) => {
    const productTokens = `${product.name} ${product.category}`.toLowerCase().split(/\s+/);
    return queryTokens.every((qt) =>
      productTokens.some((pt) => levenshtein(qt, pt) <= 2)
    );
  });
}
