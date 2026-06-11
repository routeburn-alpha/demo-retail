import type { FacetOrder } from '$lib/domain/facets';
import { getFacetOrderForCategory, getDefaultFacetOrder } from '$lib/server/db/queries';
import { detectCategory } from '$lib/storefront/category';

/**
 * Resolve the facet ordering for a request's category context: the detected category's own ordering
 * (empty when no category is detected) plus the default fallback. Lives in its own server module —
 * `+page.server.ts` may only export SvelteKit hooks — and is fetch-free so it can be integration-
 * tested directly against a real database without SvelteKit's load `fetch`.
 */
export async function loadFacetOrdering(url: URL): Promise<{
  category: string | null;
  facetOrder: FacetOrder[];
  defaultFacetOrder: FacetOrder[];
}> {
  const category = detectCategory(url);
  const [facetOrder, defaultFacetOrder] = await Promise.all([
    category ? getFacetOrderForCategory(category) : Promise.resolve<FacetOrder[]>([]),
    getDefaultFacetOrder()
  ]);
  return { category, facetOrder, defaultFacetOrder };
}
