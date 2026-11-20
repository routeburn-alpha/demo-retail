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

// A query token shorter than this skips fuzzy matching: below that length an edit-distance-1
// match is too likely to be a coincidence rather than a typo (e.g. "bag" fuzzy-matching "bar").
const FUZZY_MIN_TOKEN_LENGTH = 4;
// Single-character edit (insertion, deletion or substitution) — covers a dropped letter
// ("shel" for "shell") or a simple typo ("jaket" for "jacket").
const FUZZY_MAX_EDITS = 1;

/** True when `a` can be turned into `b` with at most `maxEdits` single-character edits. */
function withinEditDistance(a: string, b: string, maxEdits: number): boolean {
  if (Math.abs(a.length - b.length) > maxEdits) return false;

  const prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      row[j] =
        a[i - 1] === b[j - 1]
          ? prev[j - 1]
          : 1 + Math.min(prev[j - 1], prev[j], row[j - 1]);
    }
    prev.splice(0, prev.length, ...row);
  }
  return prev[b.length] <= maxEdits;
}

// A token that is a catalogue word plus/minus a trailing "s" (or vice versa) is a plural, not a
// typo — excluding it keeps this a typo-tolerance step rather than a reintroduction of synonym
// expansion (e.g. "womens" must not fuzzy-match "women").
function isTrivialPlural(a: string, b: string): boolean {
  return a === `${b}s` || b === `${a}s`;
}

/** Whether `token` fuzzy-matches one of the catalogue words pulled from a product's name/category. */
function fuzzyTokenMatch(token: string, haystackWords: string[]): boolean {
  if (token.length < FUZZY_MIN_TOKEN_LENGTH) return false;
  return haystackWords.some(
    (word) => !isTrivialPlural(token, word) && withinEditDistance(token, word, FUZZY_MAX_EDITS)
  );
}

/**
 * Search a catalogue by name/category, exact matches ranked first, with a typo-tolerant fallback.
 *
 * A product is an exact match when every whitespace-separated query token is a substring of its
 * name or category (case-insensitive) — this ranking and result set is unchanged from before.
 *
 * A product that isn't an exact match can still match when every token that didn't appear as a
 * substring instead fuzzy-matches one of the catalogue's name/category words within a small
 * edit-distance bound (dropped letters, simple typos); those fuzzy-only results are appended
 * after the exact ones. No synonym expansion. This only filters/reorders the `catalog` it is
 * given — it never widens it, so the hidden-products invariant in `selectCoreProducts` is
 * unaffected by this step.
 */
export function search(query: string, catalog: Product[]): Product[] {
  const trimmed = query.trim();
  if (!trimmed) return catalog;

  const tokens = trimmed.toLowerCase().split(/\s+/).filter(Boolean);

  const exact: Product[] = [];
  const fuzzyOnly: Product[] = [];
  for (const product of catalog) {
    const haystack = `${product.name} ${product.category}`.toLowerCase();
    if (tokens.every((token) => haystack.includes(token))) {
      exact.push(product);
      continue;
    }
    const haystackWords = haystack.split(/\W+/).filter(Boolean);
    if (tokens.every((token) => haystack.includes(token) || fuzzyTokenMatch(token, haystackWords))) {
      fuzzyOnly.push(product);
    }
  }
  return [...exact, ...fuzzyOnly];
}
