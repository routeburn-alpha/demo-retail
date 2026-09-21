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

/** Levenshtein distance between two whole strings (insert/delete/substitute, cost 1 each). */
function levenshtein(a: string, b: string): number {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  let prevRow = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      const substitutionCost = a[i - 1] === b[j - 1] ? 0 : 1;
      row[j] = Math.min(prevRow[j] + 1, row[j - 1] + 1, prevRow[j - 1] + substitutionCost);
    }
    prevRow = row;
  }
  return prevRow[b.length];
}

/** Shorter tokens get less typo tolerance so a couple of stray letters don't match everything. */
function fuzzyTolerance(tokenLength: number): number {
  if (tokenLength <= 2) return 0;
  if (tokenLength <= 4) return 1;
  return 2;
}

/** Splits a haystack into words, keeping apostrophes (so "women's" stays one word). */
function words(text: string): string[] {
  return text.split(/[^a-z0-9']+/).filter(Boolean);
}

/**
 * Fuzzy search: a product matches when every whitespace-separated query token is within
 * edit-distance tolerance of some word in its name or category (case-insensitive). Tolerates
 * typos, transpositions, and missing/extra characters per token; exact matches still work since
 * they're distance 0. Word-level (rather than raw-substring) comparison keeps a short typo token
 * from cheaply aligning against an unrelated word elsewhere in the haystack.
 */
export function search(query: string, catalog: Product[]): Product[] {
  const trimmed = query.trim();
  if (!trimmed) return catalog;

  const tokens = trimmed.toLowerCase().split(/\s+/).filter(Boolean);
  return catalog.filter((product) => {
    const haystackWords = words(`${product.name} ${product.category}`.toLowerCase());
    return tokens.every((token) => {
      const tolerance = fuzzyTolerance(token.length);
      return haystackWords.some((word) => levenshtein(token, word) <= tolerance);
    });
  });
}
