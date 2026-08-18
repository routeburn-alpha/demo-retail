import type { Product } from '$lib/domain/product';

/**
 * Compute the Levenshtein edit distance between two strings.
 * Pure function — no I/O.
 */
export function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  // Use two rows to keep memory O(min(m, n)).
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  const curr = new Array<number>(b.length + 1);

  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        curr[j - 1] + 1,       // insertion
        prev[j] + 1,           // deletion
        prev[j - 1] + cost     // substitution
      );
    }
    for (let k = 0; k <= b.length; k++) prev[k] = curr[k];
  }

  return prev[b.length];
}

/**
 * Fuzzy-search `products` for `query`.
 *
 * For each product, the minimum Levenshtein distance between any query token
 * and any word in the product's name or category is computed. Products whose
 * minimum distance exceeds `threshold` are excluded. The remaining results are
 * ranked by:
 *   1. Exact-match token count (descending) — more exact hits rank higher.
 *   2. Total minimum distance across all tokens (ascending) — closer overall
 *      ranks higher.
 *
 * Pure function — no I/O.
 */
export function fuzzySearch(query: string, products: Product[], threshold: number): Product[] {
  const trimmed = query.trim();
  if (!trimmed) return products;

  const tokens = trimmed.toLowerCase().split(/\s+/).filter(Boolean);

  type Scored = { product: Product; exactCount: number; totalDist: number };
  const scored: Scored[] = [];

  for (const product of products) {
    const words = `${product.name} ${product.category}`
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean);

    let exactCount = 0;
    let totalDist = 0;
    let withinThreshold = true;

    for (const token of tokens) {
      // Find the closest product word for this query token.
      let minDist = Infinity;
      for (const word of words) {
        const d = levenshteinDistance(token, word);
        if (d < minDist) minDist = d;
      }
      if (minDist > threshold) {
        withinThreshold = false;
        break;
      }
      if (minDist === 0) exactCount++;
      totalDist += minDist;
    }

    if (withinThreshold) {
      scored.push({ product, exactCount, totalDist });
    }
  }

  scored.sort((a, b) => b.exactCount - a.exactCount || a.totalDist - b.totalDist);
  return scored.map((s) => s.product);
}
