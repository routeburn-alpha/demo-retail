import type { FacetOrder } from '$lib/domain/facets';

export type Product = {
  id: string;
  name: string;
  category: string;
  price: number;
  description: string;
  imageUrl: string;
};

export type Synonyms = Record<string, string[]>;

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
 * Standard Levenshtein edit distance between two strings. Pure, no I/O.
 */
export function editDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[] = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const temp = dp[j];
      dp[j] = a[i - 1] === b[j - 1] ? prev : 1 + Math.min(prev, dp[j], dp[j - 1]);
      prev = temp;
    }
  }
  return dp[n];
}

export function applySynonyms(query: string, synonyms: Synonyms): string[] {
  const lower = query.toLowerCase().trim();
  if (!lower) return [];

  const phrases = new Set<string>([lower]);
  let rewritten = lower;
  for (const [key, expansions] of Object.entries(synonyms)) {
    const pattern = new RegExp(`\\b${escapeRegExp(key)}\\b`, 'g');
    if (pattern.test(lower)) {
      for (const exp of expansions) phrases.add(exp);
      rewritten = rewritten.replace(pattern, expansions.join(' '));
    }
  }
  phrases.add(rewritten);
  return [...phrases];
}

/** Max edit distance per token for fuzzy fallback matching. */
const FUZZY_MAX_DIST = 2;

/**
 * Returns true if `token` fuzzy-matches any whitespace-separated word in `text`
 * within `maxDist` edits. Only tries fuzzy when the token is long enough to avoid
 * false positives on short words (minimum 4 characters).
 */
function fuzzyTokenMatchesText(token: string, text: string, maxDist: number): boolean {
  if (token.length < 4) return false;
  return text.split(/\s+/).some((word) => editDistance(token, word) <= maxDist);
}

export function search(query: string, catalog: Product[], synonyms: Synonyms): Product[] {
  const trimmed = query.trim();
  if (!trimmed) return catalog;

  const phrases = applySynonyms(trimmed, synonyms);

  const productMatches = (p: Product, includeDescription: boolean): boolean => {
    const haystack = includeDescription
      ? `${p.name} ${p.category} ${p.description}`.toLowerCase()
      : `${p.name} ${p.category}`.toLowerCase();
    return phrases.some((phrase) => {
      const tokens = phrase.split(/\s+/).filter(Boolean);
      return tokens.every((token) => haystack.includes(token));
    });
  };

  const fuzzyMatches = (p: Product): boolean => {
    const haystack = `${p.name} ${p.category}`.toLowerCase();
    const tokens = trimmed.toLowerCase().split(/\s+/).filter(Boolean);
    return tokens.every((token) => fuzzyTokenMatchesText(token, haystack, FUZZY_MAX_DIST));
  };

  const strict = catalog.filter((p) => productMatches(p, false));
  if (strict.length > 0) return strict;
  const withDesc = catalog.filter((p) => productMatches(p, true));
  if (withDesc.length > 0) return withDesc;
  return catalog.filter(fuzzyMatches);
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
