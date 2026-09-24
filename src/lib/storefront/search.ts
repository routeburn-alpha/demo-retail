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

// Below this length a fuzzy match produces more noise than signal (e.g. "a" would fuzzy-match
// almost any word), so short tokens require an exact substring hit.
const MIN_FUZZY_TOKEN_LENGTH = 3;

/**
 * Levenshtein edit distance between `a` and `b`, bailing out (returning `false`) as soon as
 * every value in the current DP row exceeds `limit` — the "prefix-fuzzy" optimization that makes
 * this cheaper than a full Levenshtein computation for the common case (most word/token pairs
 * diverge immediately and bail after the first row).
 */
function isWithinEditDistance(a: string, b: string, limit: number): boolean {
  if (Math.abs(a.length - b.length) > limit) return false;

  let previousRow = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const currentRow = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const value = Math.min(
        previousRow[j] + 1, // deletion
        currentRow[j - 1] + 1, // insertion
        previousRow[j - 1] + cost // substitution
      );
      currentRow.push(value);
      rowMin = Math.min(rowMin, value);
    }
    if (rowMin > limit) return false;
    previousRow = currentRow;
  }
  return previousRow[b.length] <= limit;
}

/** Does `token` fuzzy-match any individual word in `haystack` within a length-scaled tolerance? */
function fuzzyMatchesToken(token: string, haystack: string): boolean {
  if (token.length < MIN_FUZZY_TOKEN_LENGTH) return false;
  const maxDistance = token.length <= 4 ? 1 : 2;
  const words = haystack.split(/[^a-z0-9]+/).filter(Boolean);
  return words.some((word) => isWithinEditDistance(token, word, maxDistance));
}

/**
 * Typo-tolerant search: a product matches when every whitespace-separated query token is either
 * an exact substring of its name + category (case-insensitive, the fast path), or — failing
 * that — a prefix-fuzzy match (edit distance ≤ 1 for short tokens, ≤ 2 for longer ones) against
 * one of its words. No synonym expansion — that richer matching is handled elsewhere.
 */
export function search(query: string, catalog: Product[]): Product[] {
  const trimmed = query.trim();
  if (!trimmed) return catalog;

  const tokens = trimmed.toLowerCase().split(/\s+/).filter(Boolean);
  return catalog.filter((product) => {
    const haystack = `${product.name} ${product.category}`.toLowerCase();
    return tokens.every((token) => haystack.includes(token) || fuzzyMatchesToken(token, haystack));
  });
}
