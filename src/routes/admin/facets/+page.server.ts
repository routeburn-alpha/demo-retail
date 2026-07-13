import type { PageServerLoad, Actions } from './$types';
import { fail } from '@sveltejs/kit';
import {
  listCoreProducts,
  getFacetOrderForCategory,
  getDefaultFacetOrder
} from '$lib/server/db/queries';
import { orderFacets } from '$lib/storefront/search';
import { slugifyCategory, detectCategory } from '$lib/storefront/category';
import { saveFacetOrder } from '$lib/server/facet-ordering';

export const load: PageServerLoad = async ({ url }) => {
  const products = await listCoreProducts();
  const categories = [...new Set(products.map((p) => slugifyCategory(p.category)))].sort();
  const selected = detectCategory(url) ?? categories[0] ?? '';

  const [categoryOrder, defaultOrder] = await Promise.all([
    selected ? getFacetOrderForCategory(selected) : Promise.resolve([]),
    getDefaultFacetOrder()
  ]);
  // The facets shown = the category's effective ordering (its own config first, then the defaults),
  // i.e. exactly what the storefront renders for this category — the admin reorders that.
  const available = [...new Set([...categoryOrder, ...defaultOrder].map((f) => f.facetKey))];
  const facets = orderFacets(available, categoryOrder, defaultOrder);

  return { categories, selected, facets };
};

export const actions: Actions = {
  default: async ({ request }) => {
    const form = await request.formData();
    const category = String(form.get('category') ?? '');
    const order = String(form.get('order') ?? '')
      .split(',')
      .map((key) => key.trim())
      .filter(Boolean);

    try {
      await saveFacetOrder(category, order);
    } catch (error) {
      return fail(400, {
        message: error instanceof Error ? error.message : 'Could not save the facet ordering.'
      });
    }

    return { success: true, category: slugifyCategory(category) };
  }
};
