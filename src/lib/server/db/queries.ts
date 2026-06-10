import { db } from './index';
import { toProduct, toFacetOrder, toCategoryFacetOrderRows } from './map';
import {
  selectCoreProducts,
  selectCategoryFacetOrders,
  selectDefaultFacetOrders,
  deleteCategoryFacetOrders,
  insertCategoryFacetOrders
} from './select';
import type { Product } from '$lib/storefront/search';
import type { FacetOrder, CategoryFacetConfig } from '$lib/domain/facets';

export { toProduct };

/** The visible Tarn & Trail catalogue: active, non-hidden, core collection. */
export async function listCoreProducts(): Promise<Product[]> {
  const rows = await selectCoreProducts(db);
  return rows.map(toProduct);
}

/** Ordered facets configured for a category (empty when none are configured). */
export async function getFacetOrderForCategory(categorySlug: string): Promise<FacetOrder[]> {
  const rows = await selectCategoryFacetOrders(db, categorySlug);
  return rows.map(toFacetOrder);
}

/** The fallback facet ordering used for categories with no explicit config. */
export async function getDefaultFacetOrder(): Promise<FacetOrder[]> {
  const rows = await selectDefaultFacetOrders(db);
  return rows.map(toFacetOrder);
}

/**
 * Replace a category's facet ordering with `config` in a single transaction:
 * clear the existing rows, then insert the new set. A facet absent from the
 * config is removed; the operation is idempotent.
 */
export async function updateCategoryFacetOrder(config: CategoryFacetConfig): Promise<void> {
  await db.transaction(async (tx) => {
    await deleteCategoryFacetOrders(tx, config.categorySlug);
    await insertCategoryFacetOrders(tx, toCategoryFacetOrderRows(config));
  });
}
