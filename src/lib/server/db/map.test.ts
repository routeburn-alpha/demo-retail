import { describe, it, expect } from 'vitest';
import { toProduct } from './map';
import type { ProductRow } from './schema';

const row: ProductRow = {
  id: 'shell-001',
  slug: 'storm-cirrus-shell',
  name: 'Storm Cirrus Shell',
  category: 'shell jacket',
  priceCents: 32000,
  description: 'Three-layer waterproof shell.',
  imageUrl: '/products/shell-001.jpg',
  collection: 'core',
  hidden: false,
  active: true,
  createdAt: new Date('2026-01-01T00:00:00Z')
};

describe('toProduct', () => {
  it('converts price_cents to a whole-dollar price', () => {
    expect(toProduct(row).price).toBe(320);
  });

  it('converts non-round cents to fractional dollars', () => {
    expect(toProduct({ ...row, priceCents: 4250 }).price).toBe(42.5);
  });

  it('maps every storefront field from the row', () => {
    expect(toProduct(row)).toEqual({
      id: 'shell-001',
      name: 'Storm Cirrus Shell',
      category: 'shell jacket',
      price: 320,
      description: 'Three-layer waterproof shell.',
      imageUrl: '/products/shell-001.jpg'
    });
  });

  it('does not leak DB-only fields onto the storefront Product', () => {
    const keys = Object.keys(toProduct(row));
    expect(keys).not.toContain('hidden');
    expect(keys).not.toContain('active');
    expect(keys).not.toContain('collection');
    expect(keys).not.toContain('priceCents');
  });
});
