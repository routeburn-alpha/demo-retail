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
 * Levenshtein edit distance between two strings — the minimum number of single-character
 * insertions, deletions or substitutions to turn `a` into `b`. Pure, no I/O.
 */
function levenshtein(a: string, b: string): number {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const dp: number[][] = Array.from({ length: rows }, () => new Array<number>(cols).fill(0));
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
 * The maximum edit distance a query token of this length is allowed to be from a product token
 * for a fuzzy match. Scales with length so a handful of typos in a long word stay tolerated while
 * short tokens — where a 1-edit window would match almost anything — get none: they fall back to
 * exact/substring matching only.
 */
function fuzzyThreshold(tokenLength: number): number {
  if (tokenLength >= 7) return 2;
  if (tokenLength >= 4) return 1;
  return 0;
}

/**
 * Whether `token` matches somewhere in `haystack`: either as a substring (the original exact
 * behaviour, unchanged) or, for tokens of 4+ characters, within a bounded Levenshtein distance of
 * one of `haystackTokens`. Reports which kind of match it was so callers can rank exact above fuzzy.
 */
function matchToken(
  token: string,
  haystack: string,
  haystackTokens: string[]
): 'exact' | 'fuzzy' | 'none' {
  if (haystack.includes(token)) return 'exact';

  const threshold = fuzzyThreshold(token.length);
  if (threshold === 0) return 'none';

  const fuzzy = haystackTokens.some((word) => levenshtein(token, word) <= threshold);
  return fuzzy ? 'fuzzy' : 'none';
}

/**
 * Search: a product matches when every whitespace-separated query token is found in its name or
 * category (case-insensitive), either as a substring (exact) or, for tokens of 4+ characters,
 * within a bounded Levenshtein edit distance of a whole product token (fuzzy — 1 edit for 4-6
 * characters, 2 edits for 7+). Exact matches rank before fuzzy ones; within each group, catalogue
 * order is preserved. No synonym expansion.
 */
export function search(query: string, catalog: Product[]): Product[] {
  const trimmed = query.trim();
  if (!trimmed) return catalog;

  const tokens = trimmed.toLowerCase().split(/\s+/).filter(Boolean);

  const ranked: { product: Product; fuzzy: boolean }[] = [];
  for (const product of catalog) {
    const haystack = `${product.name} ${product.category}`.toLowerCase();
    const haystackTokens = haystack.split(/\s+/).filter(Boolean);

    let usedFuzzy = false;
    let matchesAll = true;
    for (const token of tokens) {
      const kind = matchToken(token, haystack, haystackTokens);
      if (kind === 'none') {
        matchesAll = false;
        break;
      }
      if (kind === 'fuzzy') usedFuzzy = true;
    }
    if (matchesAll) ranked.push({ product, fuzzy: usedFuzzy });
  }

  // Stable partition: exact-only matches first, fuzzy-assisted matches after, each preserving
  // catalogue order within its group.
  return [...ranked.filter((r) => !r.fuzzy), ...ranked.filter((r) => r.fuzzy)].map(
    (r) => r.product
  );
}
