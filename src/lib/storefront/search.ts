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

export function applySynonyms(
  query: string,
  synonyms: Synonyms
): { phrases: string[]; composed: string } {
  const lower = query.toLowerCase().trim();
  if (!lower) return { phrases: [], composed: lower };

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
  return { phrases: [...phrases], composed: rewritten };
}

export function search(query: string, catalog: Product[], synonyms: Synonyms): Product[] {
  const trimmed = query.trim();
  if (!trimmed) return catalog;

  const lower = trimmed.toLowerCase();
  const { phrases, composed } = applySynonyms(trimmed, synonyms);
  // Synonym phrases are all phrases except the original query.
  // The composed phrase (full rewrite of all tokens) scores higher than individual expansions.
  const synonymPhrases = phrases.filter((p) => p !== lower);

  const tokensMatch = (tokens: string[], haystack: string): boolean =>
    tokens.every((token) => haystack.includes(token));

  const scored = new Map<string, { product: Product; score: number }>();

  const exactTokens = lower.split(/\s+/).filter(Boolean);
  const composedTokens = composed.split(/\s+/).filter(Boolean);

  for (const product of catalog) {
    const haystack = `${product.name} ${product.category}`.toLowerCase();

    if (tokensMatch(exactTokens, haystack)) {
      scored.set(product.id, { product, score: 100 });
      continue;
    }

    // Composed phrase (all tokens rewritten) scores 95; individual expansions score 90.
    if (composed !== lower && tokensMatch(composedTokens, haystack)) {
      scored.set(product.id, { product, score: 95 });
      continue;
    }

    for (const phrase of synonymPhrases) {
      if (phrase === composed) continue; // already handled above
      const tokens = phrase.split(/\s+/).filter(Boolean);
      if (tokensMatch(tokens, haystack)) {
        scored.set(product.id, { product, score: 90 });
        break;
      }
    }
  }

  // Fuzzy stage: only when fewer than 3 results from exact + synonym stages.
  if (scored.size < 3) {
    for (const product of catalog) {
      if (scored.has(product.id)) continue;

      const nameTokens = `${product.name} ${product.category}`
        .toLowerCase()
        .split(/\s+/)
        .filter(Boolean);

      let bestScore = 0;
      for (const qToken of exactTokens) {
        const maxDistance = Math.floor(qToken.length / 3);
        for (const nToken of nameTokens) {
          const dist = levenshtein(qToken, nToken);
          if (dist <= maxDistance) {
            const fuzzyScore = 80 - dist * 10;
            if (fuzzyScore > bestScore) bestScore = fuzzyScore;
          }
        }
      }

      if (bestScore > 0) {
        scored.set(product.id, { product, score: bestScore });
      }
    }
  }

  if (scored.size > 0) {
    return [...scored.values()]
      .sort((a, b) => b.score - a.score)
      .map((entry) => entry.product);
  }

  // Final fallback: description-based match (backward compatibility).
  return catalog.filter((p) => {
    const haystack = `${p.name} ${p.category} ${p.description}`.toLowerCase();
    return phrases.some((phrase) => {
      const tokens = phrase.split(/\s+/).filter(Boolean);
      return tokens.every((token) => haystack.includes(token));
    });
  });
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
