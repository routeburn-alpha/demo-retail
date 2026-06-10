import type { PageServerLoad } from './$types';
import type { Synonyms } from '$lib/storefront/search';
import { listCoreProducts } from '$lib/server/db/queries';

export const load: PageServerLoad = async ({ fetch }) => {
  const [catalog, synonymsRes] = await Promise.all([
    listCoreProducts(),
    fetch('/synonyms.json')
  ]);
  const synonyms = (await synonymsRes.json()) as Synonyms;
  return { catalog, synonyms };
};
