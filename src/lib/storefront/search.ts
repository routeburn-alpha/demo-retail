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
 * Levenshtein edit distance between two strings (single-character insert/delete/substitute).
 */
function levenshteinDistance(a: string, b: string): number {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const dp: number[][] = Array.from({ length: rows }, () => new Array<number>(cols).fill(0));
  for (let i = 0; i < rows; i++) dp[i][0] = i;
  for (let j = 0; j < cols; j++) dp[0][j] = j;
  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[rows - 1][cols - 1];
}

/**
 * Max edit distance tolerated for a query token of this length. Scales with length so short
 * tokens stay strict: a token of 3 characters or fewer must match exactly (distance 0), a
 * 4-6 character token tolerates a single edit, and a longer token tolerates two.
 */
function fuzzyThreshold(token: string): number {
  if (token.length <= 3) return 0;
  if (token.length <= 6) return 1;
  return 2;
}

/**
 * Search: a product matches when every whitespace-separated query token either is a substring
 * of its name or category (exact pass, case-insensitive), or — when there is no substring hit —
 * is within `fuzzyThreshold` edit distance of one of that product's name/category words (fuzzy
 * pass, typo tolerance). No synonym expansion — that richer matching is handled elsewhere.
 *
 * Exact matches always rank above fuzzy ones: a product where every token matched exactly comes
 * before a product where at least one token only matched by edit distance.
 */
export function search(query: string, catalog: Product[]): Product[] {
  const trimmed = query.trim();
  if (!trimmed) return catalog;

  const tokens = trimmed.toLowerCase().split(/\s+/).filter(Boolean);
  const exactMatches: Product[] = [];
  const fuzzyMatches: Product[] = [];

  for (const product of catalog) {
    const haystack = `${product.name} ${product.category}`.toLowerCase();
    let usedFuzzyMatch = false;
    let allTokensMatch = true;

    for (const token of tokens) {
      if (haystack.includes(token)) continue;

      const threshold = fuzzyThreshold(token);
      const haystackTokens = haystack.split(/\s+/).filter(Boolean);
      const hasFuzzyHit =
        threshold > 0 &&
        haystackTokens.some((haystackToken) => levenshteinDistance(token, haystackToken) <= threshold);

      if (!hasFuzzyHit) {
        allTokensMatch = false;
        break;
      }
      usedFuzzyMatch = true;
    }

    if (allTokensMatch) (usedFuzzyMatch ? fuzzyMatches : exactMatches).push(product);
  }

  return [...exactMatches, ...fuzzyMatches];
}
