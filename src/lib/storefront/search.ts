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
 * Edit distance between two strings (case-sensitive — callers normalize case beforehand).
 * Classic Wagner–Fischer dynamic program, O(a.length * b.length), two rolling rows.
 */
export function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  let curr = new Array<number>(b.length + 1);

  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        prev[j] + 1, // deletion
        curr[j - 1] + 1, // insertion
        prev[j - 1] + cost // substitution
      );
    }
    [prev, curr] = [curr, prev];
  }
  return prev[b.length];
}

/**
 * Does `token` fuzzy-match some substring of `text` within `maxDistance` edits? Case-insensitive.
 * An exact substring match always counts (distance 0). Otherwise `text` is split into words
 * (matching typos within a single word, rather than against arbitrary spans that straddle word
 * boundaries — "jaket" should not fuzz-match "...cket sto..." inside an unrelated product name)
 * and the token is checked against each word within the edit-distance threshold.
 */
export function tokenMatches(token: string, text: string, maxDistance: number): boolean {
  const needle = token.toLowerCase();
  const haystack = text.toLowerCase();
  if (haystack.includes(needle)) return true;
  if (maxDistance <= 0) return false;

  const words = haystack.match(/[a-z0-9']+/g) ?? [];
  return words.some((word) => levenshteinDistance(needle, word) <= maxDistance);
}

// Single-character tokens are too ambiguous to fuzz (almost anything is one edit away);
// short tokens (<=3 chars) tolerate one typo, longer tokens tolerate two.
function maxDistanceFor(token: string): number {
  if (token.length <= 1) return 0;
  return token.length <= 3 ? 1 : 2;
}

/**
 * Typo-tolerant search: a product matches when every whitespace-separated query token
 * fuzzy-matches (via Levenshtein distance) its name or category, case-insensitive. Exact
 * matches are preserved and prioritized ahead of fuzzy-only matches.
 */
export function search(query: string, catalog: Product[]): Product[] {
  const trimmed = query.trim();
  if (!trimmed) return catalog;

  const tokens = trimmed.toLowerCase().split(/\s+/).filter(Boolean);
  const exact: Product[] = [];
  const fuzzy: Product[] = [];

  for (const product of catalog) {
    const haystack = `${product.name} ${product.category}`.toLowerCase();
    if (tokens.every((token) => haystack.includes(token))) {
      exact.push(product);
    } else if (tokens.every((token) => tokenMatches(token, haystack, maxDistanceFor(token)))) {
      fuzzy.push(product);
    }
  }

  return [...exact, ...fuzzy];
}
