import { describe, it, expect } from 'vitest';
import { detectCategory } from './category';

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
