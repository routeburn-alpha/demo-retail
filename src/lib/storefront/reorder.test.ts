import { describe, it, expect } from 'vitest';
import { reorder } from './reorder';

// Pure unit test — reorder is a plain array transform, no I/O (§4.1).

describe('reorder', () => {
  it('moves an item down to a later position', () => {
    expect(reorder(['a', 'b', 'c', 'd'], 0, 2)).toEqual(['b', 'c', 'a', 'd']);
  });

  it('moves an item up to an earlier position', () => {
    expect(reorder(['a', 'b', 'c', 'd'], 2, 0)).toEqual(['c', 'a', 'b', 'd']);
  });

  it('is a no-op when from === to', () => {
    expect(reorder(['a', 'b', 'c'], 1, 1)).toEqual(['a', 'b', 'c']);
  });

  it('returns an unchanged copy on out-of-range indices', () => {
    const input = ['a', 'b', 'c'];
    expect(reorder(input, -1, 1)).toEqual(['a', 'b', 'c']);
    expect(reorder(input, 1, 9)).toEqual(['a', 'b', 'c']);
  });

  it('does not mutate the input list', () => {
    const input = ['a', 'b', 'c'];
    reorder(input, 0, 2);
    expect(input).toEqual(['a', 'b', 'c']);
  });
});
