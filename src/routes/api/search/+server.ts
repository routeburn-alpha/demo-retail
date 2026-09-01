import { json, type RequestEvent } from '@sveltejs/kit';
import { listCoreProducts } from '$lib/server/db/queries';
import { search } from '$lib/storefront/search';
import { parseDepartmentFilter } from '$lib/domain/department';
import type { Product } from '$lib/domain/product';

/**
 * Server-side fuzzy search endpoint.
 * GET /api/search?q=<query>&department=<dept>
 *
 * Returns filtered Product[] from the core catalogue using the server-side search algorithm.
 * Handles empty queries by returning an empty array.
 */
export async function GET({ url }: RequestEvent): Promise<Response> {
  const query = url.searchParams.get('q') ?? '';
  const department = parseDepartmentFilter(url.searchParams.get('department'));

  // Empty query returns empty results
  if (!query.trim()) {
    return json([]);
  }

  // Fetch the core catalogue for the given department
  const catalog = await listCoreProducts(department ?? undefined);

  // Run the pure search algorithm server-side
  const results: Product[] = search(query, catalog);

  return json(results);
}
