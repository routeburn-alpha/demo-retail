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
 * Levenshtein edit distance between two strings (single-character insert, delete, substitute).
 * Pure, no I/O — used below to let a typo'd query token still match a catalogue word.
 */
function levenshteinDistance(a: string, b: string): number {
  const prevRow = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) prevRow[j] = j;

  for (let i = 1; i <= a.length; i++) {
    let diagonal = prevRow[0];
    prevRow[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const temp = prevRow[j];
      prevRow[j] =
        a[i - 1] === b[j - 1] ? diagonal : 1 + Math.min(diagonal, prevRow[j], prevRow[j - 1]);
      diagonal = temp;
    }
  }
  return prevRow[b.length];
}

/**
 * How many edits a query token of this length may be away from a catalogue word and still count
 * as a match. Very short tokens (3 characters or fewer) get no fuzzy tolerance at all, so an
 * unrelated short token does not accidentally land within one edit of a real word; the allowance
 * then grows with length, since a longer word has more room for a single typo to hide in.
 */
function fuzzyThreshold(tokenLength: number): number {
  if (tokenLength <= 3) return 0;
  if (tokenLength <= 6) return 1;
  return 2;
}

/**
 * Basic exact search: a product matches when every whitespace-separated query token is a
 * substring of its name or category (case-insensitive), or — additively — within a
 * length-scaled Levenshtein distance of one of its words, so a typo'd token ("jaket") still
 * surfaces the word it meant ("jacket"). No synonym expansion — that richer matching is handled
 * elsewhere.
 */
export function search(query: string, catalog: Product[]): Product[] {
  const trimmed = query.trim();
  if (!trimmed) return catalog;

  const tokens = trimmed.toLowerCase().split(/\s+/).filter(Boolean);
  return catalog.filter((product) => {
    const haystack = `${product.name} ${product.category}`.toLowerCase();
    const haystackWords = haystack.split(/\s+/);
    return tokens.every((token) => {
      if (haystack.includes(token)) return true;
      const threshold = fuzzyThreshold(token.length);
      if (threshold === 0) return false;
      return haystackWords.some((word) => levenshteinDistance(token, word) <= threshold);
    });
  });
}
