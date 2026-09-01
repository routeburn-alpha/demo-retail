import type { FacetOrder } from '$lib/domain/facets';
import type { Product } from '$lib/domain/product';

/**
 * Compute Levenshtein distance between two strings.
 * Pure logic with no I/O.
 */
function levenshteinDistance(a: string, b: string): number {
  const aLower = a.toLowerCase();
  const bLower = b.toLowerCase();
  const matrix: number[][] = [];

  for (let i = 0; i <= bLower.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= aLower.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= bLower.length; i++) {
    for (let j = 1; j <= aLower.length; j++) {
      const cost = bLower[i - 1] === aLower[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i][j - 1] + 1, // insertion
        matrix[i - 1][j] + 1, // deletion
        matrix[i - 1][j - 1] + cost // substitution
      );
    }
  }

  return matrix[bLower.length][aLower.length];
}

/**
 * Fuzzy search: matches products where every query token fuzzy-matches a token in
 * the product name or category within a Levenshtein distance threshold.
 * Pure logic with no I/O — allowed per ARCHITECTURE §4.1.
 */
export function fuzzyMatch(
  query: string,
  catalog: Product[],
  options: { maxDistance?: number } = {}
): Product[] {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const maxDistance = options.maxDistance ?? 0;
  const queryTokens = trimmed.toLowerCase().split(/\s+/).filter(Boolean);

  return catalog.filter((product) => {
    const haystack = `${product.name} ${product.category}`.toLowerCase();
    const haystackTokens = haystack.split(/\s+/).filter(Boolean);

    // Every query token must match at least one haystack token within maxDistance
    return queryTokens.every((queryToken) =>
      haystackTokens.some((haystackToken) => levenshteinDistance(queryToken, haystackToken) <= maxDistance)
    );
  });
}

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
 * Basic exact search: a product matches when every whitespace-separated query token is a
 * substring of its name or category (case-insensitive). No typo tolerance and no synonym
 * expansion — that richer matching is handled elsewhere.
 */
export function search(query: string, catalog: Product[]): Product[] {
  const trimmed = query.trim();
  if (!trimmed) return catalog;

  const tokens = trimmed.toLowerCase().split(/\s+/).filter(Boolean);
  return catalog.filter((product) => {
    const haystack = `${product.name} ${product.category}`.toLowerCase();
    return tokens.every((token) => haystack.includes(token));
  });
}
