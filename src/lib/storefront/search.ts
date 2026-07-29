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

/** Compute the Levenshtein edit distance between two strings. */
function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  const prev = Array.from({ length: n + 1 }, (_, j) => j);
  const curr = new Array<number>(n + 1);
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      curr[j] =
        a[i - 1] === b[j - 1]
          ? prev[j - 1]
          : 1 + Math.min(prev[j - 1], prev[j], curr[j - 1]);
    }
    prev.splice(0, n + 1, ...curr);
  }
  return prev[n];
}

/**
 * Return true if the query token matches the haystack string. A token matches when:
 * - it is an exact substring (case-insensitive), OR
 * - it is >= 3 characters and its Levenshtein distance to some individual word in the
 *   haystack is at most the absolute length difference between the two strings (allowing
 *   abbreviations like "jkt" → "jacket" and one-character typos like "jaket" → "jacket").
 */
function tokenMatches(token: string, haystack: string, haystackWords: string[]): boolean {
  if (haystack.includes(token)) return true;
  if (token.length < 3) return false;
  return haystackWords.some((w) => levenshtein(token, w) <= Math.abs(w.length - token.length));
}

/**
 * Fuzzy search: a product matches when every whitespace-separated query token is either an
 * exact substring of its name/category or fuzzy-matches a word in that text via Levenshtein
 * distance (see tokenMatches). Short tokens (< 3 chars) require an exact substring match.
 */
export function search(query: string, catalog: Product[]): Product[] {
  const trimmed = query.trim();
  if (!trimmed) return catalog;

  const tokens = trimmed.toLowerCase().split(/\s+/).filter(Boolean);
  return catalog.filter((product) => {
    const haystack = `${product.name} ${product.category}`.toLowerCase();
    const haystackWords = haystack.split(/\s+/).filter(Boolean);
    return tokens.every((token) => tokenMatches(token, haystack, haystackWords));
  });
}
