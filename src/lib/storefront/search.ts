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

/**
 * Damerau-Levenshtein edit distance (insertion, deletion, substitution, adjacent transposition)
 * between two strings. Pure — no I/O.
 */
function damerauLevenshteinDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const distances: number[][] = Array.from({ length: a.length + 1 }, () =>
    new Array(b.length + 1).fill(0)
  );
  for (let i = 0; i <= a.length; i++) distances[i][0] = i;
  for (let j = 0; j <= b.length; j++) distances[0][j] = j;

  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      distances[i][j] = Math.min(
        distances[i - 1][j] + 1, // deletion
        distances[i][j - 1] + 1, // insertion
        distances[i - 1][j - 1] + cost // substitution
      );
      const isTransposition = i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1];
      if (isTransposition) {
        distances[i][j] = Math.min(distances[i][j], distances[i - 2][j - 2] + 1);
      }
    }
  }
  return distances[a.length][b.length];
}

/**
 * Edit-distance budget for a query token, scaled by its length: no fuzzy matching under 4
 * characters (too easy to collide with an unrelated word), 1 edit for 4-6 characters, 2 edits
 * for 7+.
 */
function fuzzyBudget(tokenLength: number): number {
  if (tokenLength < 4) return 0;
  if (tokenLength <= 6) return 1;
  return 2;
}

/** How a single query token matched a single product token, for ranking purposes. */
type TokenMatchKind = 'substring' | 'fuzzy' | null;

function matchToken(queryToken: string, productToken: string): TokenMatchKind {
  if (productToken.includes(queryToken) || queryToken.includes(productToken)) return 'substring';

  const budget = fuzzyBudget(queryToken.length);
  if (budget === 0) return null;

  return damerauLevenshteinDistance(queryToken, productToken) <= budget ? 'fuzzy' : null;
}

function productWords(product: Product): string[] {
  return `${product.name} ${product.category}`.toLowerCase().split(/\s+/).filter(Boolean);
}

/**
 * Typo-tolerant search: like `search`, every whitespace-separated query token must match the
 * product (name or category), but a match may come from a per-word Damerau-Levenshtein distance
 * within a length-scaled threshold (see `fuzzyBudget`) rather than only a literal substring. So
 * "shel jaket" matches "Shell Jacket". Products matched entirely by substring rank above any
 * product that needed a fuzzy token match; within each tier, catalog order is preserved.
 *
 * Pure (no I/O) — operates only on the `catalog` array it is given, so it never widens what a
 * caller already has access to.
 */
export function fuzzySearch(query: string, catalog: Product[]): Product[] {
  const trimmed = query.trim();
  if (!trimmed) return catalog;

  const queryTokens = trimmed.toLowerCase().split(/\s+/).filter(Boolean);

  const substringMatches: Product[] = [];
  const fuzzyMatches: Product[] = [];

  for (const product of catalog) {
    const words = productWords(product);
    let usedFuzzy = false;
    let matchesAllTokens = true;

    for (const queryToken of queryTokens) {
      let bestKind: TokenMatchKind = null;
      for (const word of words) {
        const kind = matchToken(queryToken, word);
        if (kind === 'substring') {
          bestKind = 'substring';
          break;
        }
        if (kind === 'fuzzy') bestKind = 'fuzzy';
      }
      if (bestKind === null) {
        matchesAllTokens = false;
        break;
      }
      if (bestKind === 'fuzzy') usedFuzzy = true;
    }

    if (matchesAllTokens) (usedFuzzy ? fuzzyMatches : substringMatches).push(product);
  }

  return [...substringMatches, ...fuzzyMatches];
}
