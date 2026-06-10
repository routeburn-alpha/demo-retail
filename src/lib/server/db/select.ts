import { and, asc, eq } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import * as schema from './schema';

/**
 * Query builder for the visible Tarn & Trail catalogue: core collection,
 * active, not hidden. Takes the db/transaction as a parameter so it can run
 * against a test connection without pulling in SvelteKit's `$env`.
 */
export function selectCoreProducts(database: PostgresJsDatabase<typeof schema>) {
  const { products } = schema;
  return database
    .select()
    .from(products)
    .where(
      and(eq(products.collection, 'core'), eq(products.active, true), eq(products.hidden, false))
    )
    .orderBy(asc(products.createdAt));
}
