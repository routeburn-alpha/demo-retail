import type { PageServerLoad } from './$types';
import type { Synonyms } from '$lib/storefront/search';
import { listCoreProducts } from '$lib/server/db/queries';
import { loadFacetOrdering } from '$lib/server/facet-ordering';
import { parseDepartmentFilter } from '$lib/domain/department';

export const load: PageServerLoad = async ({ url, fetch }) => {
  const department = parseDepartmentFilter(url.searchParams.get('department'));
  const [catalog, synonymsRes, facetOrdering] = await Promise.all([
    listCoreProducts(department ?? undefined),
    fetch('/synonyms.json'),
    loadFacetOrdering(url)
  ]);
  const synonyms = (await synonymsRes.json()) as Synonyms;
  return { catalog, synonyms, department, ...facetOrdering };
};
