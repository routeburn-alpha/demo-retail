import { describe, it, expect } from 'vitest';
import { parseDepartmentFilter, departmentsFor } from './department';

// Pure unit test — these helpers have no I/O (ARCHITECTURE §4.1). No DB, no mocks.

describe('parseDepartmentFilter', () => {
  it('accepts the two valid filter values', () => {
    expect(parseDepartmentFilter('womens')).toBe('womens');
    expect(parseDepartmentFilter('mens')).toBe('mens');
  });

  it('treats null / unknown / "unisex" as no filter (All)', () => {
    expect(parseDepartmentFilter(null)).toBeNull();
    expect(parseDepartmentFilter(undefined)).toBeNull();
    expect(parseDepartmentFilter('')).toBeNull();
    expect(parseDepartmentFilter('kids')).toBeNull();
    // 'unisex' is a product attribute, not a shopper-pickable filter
    expect(parseDepartmentFilter('unisex')).toBeNull();
  });
});

describe('departmentsFor', () => {
  it('includes unisex gear alongside the chosen department', () => {
    expect(departmentsFor('womens')).toEqual(['womens', 'unisex']);
    expect(departmentsFor('mens')).toEqual(['mens', 'unisex']);
  });
});
