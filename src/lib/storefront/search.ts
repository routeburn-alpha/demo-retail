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

/**
 * Compute the Levenshtein edit distance between two strings.
 */
function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  const row = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= n; j++) {
      const temp = row[j];
      row[j] = a[i - 1] === b[j - 1] ? prev : 1 + Math.min(prev, row[j], row[j - 1]);
      prev = temp;
    }
  }
  return row[n];
}

/**
 * Return the fuzzy-match tolerance for a token of the given length:
 * short tokens (≤2 chars) require an exact word match; medium tokens (3–4 chars)
 * allow one edit; longer tokens allow two edits.
 */
function tolerance(len: number): number {
  if (len <= 2) return 0;
  if (len <= 4) return 1;
  return 2;
}

/**
 * True when `token` fuzzy-matches any word in `haystack`. Falls back to an exact
 * substring check first so that partial-word queries (e.g. "jacket" inside "jacketed")
 * still work without a Levenshtein call.
 */
function fuzzyTokenMatch(token: string, haystack: string): boolean {
  if (haystack.includes(token)) return true;
  const tol = tolerance(token.length);
  if (tol === 0) return false;
  return haystack.split(/\s+/).some((word) => levenshtein(token, word) <= tol);
}

/**
 * Fuzzy search: a product matches when every whitespace-separated query token either
 * appears as an exact substring of the product name/category, or is within Levenshtein
 * distance ≤ 2 (scaled by token length) of a word in that text. This tolerates 1–2 char
 * typos, transpositions, and missing vowels while keeping the function pure (no I/O).
 */
export function search(query: string, catalog: Product[]): Product[] {
  const trimmed = query.trim();
  if (!trimmed) return catalog;

  const tokens = trimmed.toLowerCase().split(/\s+/).filter(Boolean);
  return catalog.filter((product) => {
    const haystack = `${product.name} ${product.category}`.toLowerCase();
    return tokens.every((token) => fuzzyTokenMatch(token, haystack));
  });
}
