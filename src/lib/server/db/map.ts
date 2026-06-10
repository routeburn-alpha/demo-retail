import type { ProductRow } from './schema';
import type { Product } from '$lib/storefront/search';

/**
 * Map a DB row to the storefront `Product` shape (price in whole dollars).
 * Pure — no DB or env dependency, so it is unit-testable in isolation.
 */
export function toProduct(row: ProductRow): Product {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    price: row.priceCents / 100,
    description: row.description,
    imageUrl: row.imageUrl
  };
}
