import type { ProductRow, CategoryFacetOrderRow, DefaultFacetOrderRow } from './schema';
import type { NewCategoryFacetOrderRow } from './schema';
import type { Product } from '$lib/storefront/search';
import type { FacetOrder, CategoryFacetConfig } from '$lib/domain/facets';

/**
 * Map a DB row to the storefront `Product` shape (price in whole dollars).
 * Pure — no DB or env dependency, so it is unit-testable in isolation.
 */
export function toProduct(row: ProductRow): Product {
  const product: Product = {
    id: row.id,
    name: row.name,
    category: row.category,
    type: row.type,
    price: row.priceCents / 100,
    description: row.description,
    imageUrl: row.imageUrl
  };
  if (row.salePriceCents != null) {
    product.salePrice = row.salePriceCents / 100;
    product.discountPct = Math.round((1 - row.salePriceCents / row.priceCents) * 100);
  }
  return product;
}

/**
 * Map a facet-order row (category-specific or default) to the domain `FacetOrder`,
 * dropping persistence-only fields (id, category_slug, created_at). Pure.
 */
export function toFacetOrder(row: CategoryFacetOrderRow | DefaultFacetOrderRow): FacetOrder {
  return {
    facetKey: row.facetKey,
    displayOrder: row.displayOrder
  };
}

/**
 * Expand a category facet config into the insert rows the adapter persists.
 * Pure — the inverse boundary to `toFacetOrder` (ARCHITECTURE §2.3).
 */
export function toCategoryFacetOrderRows(config: CategoryFacetConfig): NewCategoryFacetOrderRow[] {
  return config.facetOrders.map((facetOrder) => ({
    categorySlug: config.categorySlug,
    facetKey: facetOrder.facetKey,
    displayOrder: facetOrder.displayOrder
  }));
}
