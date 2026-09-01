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

/**
 * Compute the Levenshtein edit distance between two strings.
 * Used to implement typo-tolerant fuzzy matching in search.
 */
function editDistance(a: string, b: string): number {
  const dp: number[][] = Array(a.length + 1)
    .fill(null)
    .map(() => Array(b.length + 1).fill(0));

  for (let i = 0; i <= a.length; i++) dp[i][0] = i;
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;

  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
      }
    }
  }
  return dp[a.length][b.length];
}

/**
 * Check if a query token matches any token in the haystack with fuzzy tolerance.
 * Tokens ≤5 chars allow distance ≤2; longer tokens allow distance ≤3.
 */
function fuzzyTokenMatch(queryToken: string, haystackTokens: string[]): boolean {
  const threshold = queryToken.length <= 5 ? 2 : 3;
  return haystackTokens.some((haystackToken) => editDistance(queryToken, haystackToken) <= threshold);
}

/**
 * Fuzzy search with typo tolerance: a product matches when every whitespace-separated query token
 * has a fuzzy match (edit distance within threshold) in its name or category tokens.
 * Uses Levenshtein edit distance: ≤2 for tokens up to 5 chars, ≤3 for longer.
 */
export function search(query: string, catalog: Product[]): Product[] {
  const trimmed = query.trim();
  if (!trimmed) return catalog;

  const queryTokens = trimmed.toLowerCase().split(/\s+/).filter(Boolean);
  return catalog.filter((product) => {
    const haystackText = `${product.name} ${product.category}`.toLowerCase();
    const haystackTokens = haystackText.split(/\s+/).filter(Boolean);
    return queryTokens.every((queryToken) => fuzzyTokenMatch(queryToken, haystackTokens));
  });
}
