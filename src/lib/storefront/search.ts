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

const FUZZY_MAX_DISTANCE = 1;

/**
 * Levenshtein edit distance (insertions, deletions, substitutions) between two strings.
 * Pure, no I/O — backs the single-character typo tolerance in {@link search}.
 */
function levenshteinDistance(a: string, b: string): number {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const dp: number[][] = Array.from({ length: rows }, () => new Array(cols).fill(0));

  for (let i = 0; i < rows; i++) dp[i][0] = i;
  for (let j = 0; j < cols; j++) dp[0][j] = j;

  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }

  return dp[rows - 1][cols - 1];
}

/**
 * Search: a product matches when every whitespace-separated query token is either a substring
 * of its name/category (exact), or within {@link FUZZY_MAX_DISTANCE} edits of one of its
 * name/category words (fuzzy — tolerates a single-character typo). The fuzzy fallback only
 * applies to queries of 2+ characters, so a 0-1 character query behaves exactly as before. No
 * synonym expansion — that richer matching is handled elsewhere. Exact matches (every token
 * found literally) rank ahead of matches that needed the fuzzy fallback.
 */
export function search(query: string, catalog: Product[]): Product[] {
  const trimmed = query.trim();
  if (!trimmed) return catalog;

  const tokens = trimmed.toLowerCase().split(/\s+/).filter(Boolean);
  const allowFuzzy = trimmed.length >= 2;

  const matches: { product: Product; fuzzy: boolean }[] = [];
  for (const product of catalog) {
    const haystack = `${product.name} ${product.category}`.toLowerCase();
    const words = haystack.split(/\s+/);
    let usedFuzzy = false;

    const matchesAllTokens = tokens.every((token) => {
      if (haystack.includes(token)) return true;
      if (!allowFuzzy) return false;
      const fuzzyHit = words.some(
        (word) => levenshteinDistance(token, word) <= FUZZY_MAX_DISTANCE
      );
      if (fuzzyHit) usedFuzzy = true;
      return fuzzyHit;
    });

    if (matchesAllTokens) matches.push({ product, fuzzy: usedFuzzy });
  }

  // Stable sort (guaranteed by spec since ES2019): exact-only matches first, ties keep catalog order.
  return matches.sort((a, b) => Number(a.fuzzy) - Number(b.fuzzy)).map((m) => m.product);
}
