import type { FacetOrder } from '$lib/domain/facets';
import {
  getFacetOrderForCategory,
  getDefaultFacetOrder,
  updateCategoryFacetOrder
} from '$lib/server/db/queries';
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

/**
 * Validate an admin-submitted ordering and persist it for a category (replace semantics, via the
 * `updateCategoryFacetOrder` port). `facetKeys` is the desired order; `displayOrder` is the position.
 * Throws `Error` with a human-readable message on invalid input — the form action maps it to a 400.
 */
export async function saveFacetOrder(categorySlug: string, facetKeys: string[]): Promise<void> {
  const slug = categorySlug.trim();
  if (!slug) throw new Error('A category is required.');

  const keys = facetKeys.map((k) => k.trim());
  if (keys.length === 0 || keys.some((k) => !k)) {
    throw new Error('A facet ordering must list at least one (non-blank) facet.');
  }
  if (new Set(keys).size !== keys.length) {
    throw new Error('A facet may not appear more than once in the ordering.');
  }

  await updateCategoryFacetOrder({
    categorySlug: slug,
    facetOrders: keys.map((facetKey, index) => ({ facetKey, displayOrder: index + 1 }))
  });
}
