import { and, asc, eq } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import * as schema from './schema';
import type { NewCategoryFacetOrderRow } from './schema';

type Database = PostgresJsDatabase<typeof schema>;

/**
 * Query builder for the visible Tarn & Trail catalogue: core collection,
 * active, not hidden. Takes the db/transaction as a parameter so it can run
 * against a test connection without pulling in SvelteKit's `$env`.
 */
export function selectCoreProducts(database: Database) {
  const { products } = schema;
  return database
    .select()
    .from(products)
    .where(
      and(eq(products.collection, 'core'), eq(products.active, true), eq(products.hidden, false))
    )
    .orderBy(asc(products.createdAt));
}

/** Facet ordering configured for one category, lowest displayOrder first. */
export function selectCategoryFacetOrders(database: Database, categorySlug: string) {
  const { categoryFacetOrders } = schema;
  return database
    .select()
    .from(categoryFacetOrders)
    .where(eq(categoryFacetOrders.categorySlug, categorySlug))
    .orderBy(asc(categoryFacetOrders.displayOrder));
}

/** The fallback facet ordering for categories with no explicit configuration. */
export function selectDefaultFacetOrders(database: Database) {
  const { defaultFacetOrders } = schema;
  return database.select().from(defaultFacetOrders).orderBy(asc(defaultFacetOrders.displayOrder));
}

/** Remove every facet-order row for a category (the clear half of a replace). */
export function deleteCategoryFacetOrders(database: Database, categorySlug: string) {
  const { categoryFacetOrders } = schema;
  return database
    .delete(categoryFacetOrders)
    .where(eq(categoryFacetOrders.categorySlug, categorySlug));
}

/** Bulk-insert facet-order rows; a no-op when there are none. */
export function insertCategoryFacetOrders(database: Database, rows: NewCategoryFacetOrderRow[]) {
  if (rows.length === 0) return Promise.resolve();
  return database.insert(schema.categoryFacetOrders).values(rows);
}
