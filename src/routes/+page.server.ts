import type { PageServerLoad } from './$types';
import type { Synonyms } from '$lib/storefront/search';
import { listCoreProducts } from '$lib/server/db/queries';
import { loadFacetOrdering } from '$lib/server/facet-ordering';

export const load: PageServerLoad = async ({ url, fetch }) => {
  const [catalog, synonymsRes, facetOrdering] = await Promise.all([
    listCoreProducts(),
    fetch('/synonyms.json'),
    loadFacetOrdering(url)
  ]);
  const synonyms = (await synonymsRes.json()) as Synonyms;
  return { catalog, synonyms, ...facetOrdering };
};
