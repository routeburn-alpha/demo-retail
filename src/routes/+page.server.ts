import type { PageServerLoad } from './$types';
import { listCoreProducts } from '$lib/server/db/queries';
import { loadFacetOrdering } from '$lib/server/facet-ordering';
import { parseDepartmentFilter } from '$lib/domain/department';

export const load: PageServerLoad = async ({ url }) => {
  const department = parseDepartmentFilter(url.searchParams.get('department'));
  const [catalog, facetOrdering] = await Promise.all([
    listCoreProducts(department ?? undefined),
    loadFacetOrdering(url)
  ]);
  return { catalog, department, ...facetOrdering };
};
