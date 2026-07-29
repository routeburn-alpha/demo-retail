import { describe, it, expect } from 'vitest';
import { toProduct, toFacetOrder, toCategoryFacetOrderRows } from './map';
import type { ProductRow, CategoryFacetOrderRow } from './schema';

const row: ProductRow = {
  id: 'shell-001',
  slug: 'storm-cirrus-shell',
  name: 'Storm Cirrus Shell',
  category: 'shell jacket',
  priceCents: 32000,
  salePriceCents: null,
  description: 'Three-layer waterproof shell.',
  imageUrl: '/products/shell-001.jpg',
  type: 'clothing',
  department: 'mens',
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
      imageUrl: '/products/shell-001.jpg',
      type: 'clothing'
    });
  });

  it('passes the product type through to the domain Product', () => {
    expect(toProduct(row).type).toBe('clothing');
    expect(toProduct({ ...row, type: 'equipment' }).type).toBe('equipment');
  });

  it('does not leak DB-only fields onto the storefront Product', () => {
    const keys = Object.keys(toProduct(row));
    expect(keys).not.toContain('hidden');
    expect(keys).not.toContain('active');
    expect(keys).not.toContain('collection');
    expect(keys).not.toContain('priceCents');
    expect(keys).not.toContain('salePriceCents');
  });

  it('computes salePrice and discountPct when salePriceCents is set', () => {
    const saleRow = { ...row, salePriceCents: 25600 }; // $256 on a $320 item = 20% off
    const product = toProduct(saleRow);
    expect(product.salePrice).toBe(256);
    expect(product.discountPct).toBe(20);
  });

  it('omits salePrice and discountPct when salePriceCents is null', () => {
    const product = toProduct({ ...row, salePriceCents: null });
    expect(product.salePrice).toBeUndefined();
    expect(product.discountPct).toBeUndefined();
  });
});

const facetRow: CategoryFacetOrderRow = {
  id: 1,
  categorySlug: 'tents',
  facetKey: 'season',
  displayOrder: 2,
  createdAt: new Date('2026-01-01T00:00:00Z')
};

describe('toFacetOrder', () => {
  it('keeps only the domain fields', () => {
    expect(toFacetOrder(facetRow)).toEqual({ facetKey: 'season', displayOrder: 2 });
  });

  it('does not leak persistence-only fields (id, categorySlug, createdAt)', () => {
    const keys = Object.keys(toFacetOrder(facetRow));
    expect(keys).not.toContain('id');
    expect(keys).not.toContain('categorySlug');
    expect(keys).not.toContain('createdAt');
  });
});

describe('toCategoryFacetOrderRows', () => {
  it('expands a config into one insert row per facet, stamping the category', () => {
    expect(
      toCategoryFacetOrderRows({
        categorySlug: 'tents',
        facetOrders: [
          { facetKey: 'season', displayOrder: 1 },
          { facetKey: 'capacity', displayOrder: 2 }
        ]
      })
    ).toEqual([
      { categorySlug: 'tents', facetKey: 'season', displayOrder: 1 },
      { categorySlug: 'tents', facetKey: 'capacity', displayOrder: 2 }
    ]);
  });

  it('maps an empty config to no rows', () => {
    expect(toCategoryFacetOrderRows({ categorySlug: 'tents', facetOrders: [] })).toEqual([]);
  });
});
