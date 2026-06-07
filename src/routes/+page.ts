import type { PageLoad } from './$types';
import type { Product, Synonyms } from '$lib/storefront/search';

export const prerender = true;

export const load: PageLoad = async ({ fetch }) => {
  const [catalogRes, synonymsRes] = await Promise.all([
    fetch('/catalog.json'),
    fetch('/synonyms.json')
  ]);
  const catalog = (await catalogRes.json()) as Product[];
  const synonyms = (await synonymsRes.json()) as Synonyms;
  return { catalog, synonyms };
};
