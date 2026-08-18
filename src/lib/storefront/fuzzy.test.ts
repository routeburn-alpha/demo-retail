import { describe, it, expect } from 'vitest';
import { levenshteinDistance, fuzzySearch } from './fuzzy';
import type { Product } from '$lib/domain/product';

// Pure unit tests — levenshteinDistance and fuzzySearch have no I/O.
// Allowed per ARCHITECTURE §4.1 (pure logic, no DB, no fetch, no mocks).

describe('levenshteinDistance', () => {
  it('returns 0 for identical strings', () => {
    expect(levenshteinDistance('jacket', 'jacket')).toBe(0);
  });

  it('returns the length of b when a is empty', () => {
    expect(levenshteinDistance('', 'abc')).toBe(3);
  });

  it('returns the length of a when b is empty', () => {
    expect(levenshteinDistance('abc', '')).toBe(3);
  });

  it('returns 0 for two empty strings', () => {
    expect(levenshteinDistance('', '')).toBe(0);
  });

  it('counts a single substitution', () => {
    expect(levenshteinDistance('cat', 'bat')).toBe(1);
  });

  it('counts a single insertion', () => {
    expect(levenshteinDistance('cat', 'cats')).toBe(1);
  });

  it('counts a single deletion', () => {
    expect(levenshteinDistance('cats', 'cat')).toBe(1);
  });

  it('handles a one-character typo in a longer word', () => {
    // "jaket" vs "jacket": one insertion needed
    expect(levenshteinDistance('jaket', 'jacket')).toBe(1);
  });

  it('returns max distance for completely different strings of equal length', () => {
    expect(levenshteinDistance('abc', 'xyz')).toBe(3);
  });

  it('is case-sensitive (callers must normalise)', () => {
    expect(levenshteinDistance('Jacket', 'jacket')).toBe(1);
  });
});

const makeProduct = (id: string, name: string, category = 'gear'): Product => ({
  id,
  name,
  category,
  price: 100,
  description: '',
  imageUrl: ''
});

const catalog: Product[] = [
  makeProduct('1', 'Rain Jacket'),
  makeProduct('2', 'Running Shoes'),
  makeProduct('3', 'Wool Beanie'),
  makeProduct('4', 'Hiking Boots'),
  makeProduct('5', 'Fleece Vest')
];

describe('fuzzySearch', () => {
  it('returns an exact match within the results', () => {
    const results = fuzzySearch('jacket', catalog, 2);
    const names = results.map((p) => p.name);
    expect(names).toContain('Rain Jacket');
  });

  it('returns a one-typo match within threshold', () => {
    // "jaket" is one edit away from "jacket"
    const results = fuzzySearch('jaket', catalog, 1);
    const names = results.map((p) => p.name);
    expect(names).toContain('Rain Jacket');
  });

  it('excludes products whose closest word distance exceeds threshold', () => {
    // threshold 0 means only exact matches; "jaket" should not match "jacket"
    const results = fuzzySearch('jaket', catalog, 0);
    const names = results.map((p) => p.name);
    expect(names).not.toContain('Rain Jacket');
  });

  it('returns empty array when nothing is within threshold', () => {
    const results = fuzzySearch('zzzzz', catalog, 1);
    expect(results).toEqual([]);
  });

  it('returns empty array for an empty catalog', () => {
    expect(fuzzySearch('jacket', [], 2)).toEqual([]);
  });

  it('returns the full catalog when query is empty', () => {
    expect(fuzzySearch('', catalog, 2)).toEqual(catalog);
  });

  it('ranks exact-match products before near-match products', () => {
    // "shoes" matches "Running Shoes" exactly; "shes" is farther away
    const results = fuzzySearch('shoes', catalog, 3);
    const names = results.map((p) => p.name);
    const exactIdx = names.indexOf('Running Shoes');
    expect(exactIdx).toBeGreaterThanOrEqual(0);
    // Every result before the exact match must itself be an exact match
    for (let i = 0; i < exactIdx; i++) {
      expect(names[i].toLowerCase()).toContain('shoes');
    }
  });

  it('ranks closer matches before farther ones', () => {
    const small: Product[] = [
      makeProduct('a', 'Hiking Boots'),  // "hikng" → distance 1 from "hiking"
      makeProduct('b', 'Wool Beanie')    // "hikng" → farther from all words
    ];
    const results = fuzzySearch('hikng', small, 2);
    expect(results[0].name).toBe('Hiking Boots');
  });
});
