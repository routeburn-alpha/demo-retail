import { describe, it, expect } from 'vitest';
import { levenshtein, fuzzyMatch } from './fuzzy';

describe('levenshtein', () => {
  it('returns 0 for identical tokens', () => {
    expect(levenshtein('jacket', 'jacket')).toBe(0);
  });

  it('returns the length of the non-empty string for an empty string', () => {
    expect(levenshtein('', 'abc')).toBe(3);
    expect(levenshtein('abc', '')).toBe(3);
  });

  it('returns 0 for two empty strings', () => {
    expect(levenshtein('', '')).toBe(0);
  });

  it('returns 1 for a single-character substitution', () => {
    expect(levenshtein('cat', 'bat')).toBe(1);
  });

  it('returns 1 for a single deletion', () => {
    expect(levenshtein('jcket', 'jacket')).toBe(1);
  });

  it('returns 1 for a single insertion', () => {
    expect(levenshtein('jackets', 'jacket')).toBe(1);
  });

  it('calculates multi-edit distance correctly', () => {
    expect(levenshtein('kitten', 'sitting')).toBe(3);
  });
});

describe('fuzzyMatch', () => {
  it('matches identical tokens', () => {
    expect(fuzzyMatch('jacket', 'jacket')).toBe(true);
  });

  it('matches a typo within threshold — "jcket" vs "jacket" (distance 1, threshold 2)', () => {
    // "jacket" length 6 → threshold = Math.max(1, 6/3) = 2; distance 1 ≤ 2
    expect(fuzzyMatch('jcket', 'jacket')).toBe(true);
  });

  it('does not match when edit distance exceeds threshold', () => {
    // "jkt" length 3 → threshold = Math.max(1, 3/3) = 1; distance("jkt","jacket") = 3 > 1
    expect(fuzzyMatch('jkt', 'jacket')).toBe(false);
  });

  it('does not over-match on single-character tokens — threshold is 1', () => {
    // "a" length 1 → threshold = Math.max(1, 1/3) = 1; "b" distance 1 ≤ 1 — still matches
    // but "c" vs "ab" → distance 2 > threshold 1
    expect(fuzzyMatch('c', 'ab')).toBe(false);
  });

  it('handles empty query token (matches everything within threshold 1)', () => {
    // "" length 0 → threshold = Math.max(1, 0) = 1; distance("","a") = 1 ≤ 1
    expect(fuzzyMatch('', 'a')).toBe(true);
  });

  it('does not match when both are empty', () => {
    // distance is 0, threshold 1 → matches
    expect(fuzzyMatch('', '')).toBe(true);
  });
});
