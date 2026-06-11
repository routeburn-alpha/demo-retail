import { describe, it, expect } from 'vitest';
import { detectCategory, categoryFromProducts, slugifyCategory } from './category';

// Pure unit test — detectCategory reads the URL only, no I/O (§4.1).
const at = (path: string) => new URL(`http://localhost${path}`);

describe('detectCategory', () => {
  it('returns the category search param', () => {
    expect(detectCategory(at('/?category=tent'))).toBe('tent');
  });

  it('returns null when there is no category param', () => {
    expect(detectCategory(at('/'))).toBeNull();
  });

  it('returns null for a blank / whitespace-only category', () => {
    expect(detectCategory(at('/?category='))).toBeNull();
    expect(detectCategory(at('/?category=%20%20'))).toBeNull();
  });

  it('trims and lowercases so it matches the slugified-category convention', () => {
    expect(detectCategory(at('/?category=%20Shell-Jacket%20'))).toBe('shell-jacket');
  });
});

describe('slugifyCategory', () => {
  it('lowercases and hyphenates a product category', () => {
    expect(slugifyCategory('Shell Jacket')).toBe('shell-jacket');
  });

  it('trims and collapses non-alphanumeric runs', () => {
    expect(slugifyCategory('  Trail   Runner  ')).toBe('trail-runner');
  });
});

describe('categoryFromProducts', () => {
  const prods = (...categories: string[]) => categories.map((category) => ({ category }));

  it('returns null for an empty listing', () => {
    expect(categoryFromProducts([])).toBeNull();
  });

  it('returns the (slugified) category of a single-category listing', () => {
    expect(categoryFromProducts(prods('shell jacket', 'shell jacket'))).toBe('shell-jacket');
  });

  it('returns the dominant (most frequent) category', () => {
    expect(categoryFromProducts(prods('shell jacket', 'tent', 'tent'))).toBe('tent');
  });

  it('breaks ties by first appearance', () => {
    expect(categoryFromProducts(prods('Shell Jacket', 'tent'))).toBe('shell-jacket');
  });
});
