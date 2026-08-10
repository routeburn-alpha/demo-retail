/**
 * Levenshtein edit distance between two strings.
 * Pure — no I/O. O(m*n) time, O(n) space.
 */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const curr = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    prev = curr;
  }
  return prev[b.length];
}

/**
 * Returns true when the edit distance between `query` and `target` is within
 * the proportional threshold `Math.max(1, query.length / 3)`.
 * Catches common typos (e.g. "jcket" → "jacket") while avoiding over-matching on short tokens.
 */
export function fuzzyMatch(query: string, target: string): boolean {
  const threshold = Math.max(1, Math.floor(query.length / 3));
  return levenshtein(query, target) <= threshold;
}
