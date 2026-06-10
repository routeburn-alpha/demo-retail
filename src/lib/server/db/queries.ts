import { db } from './index';
import { toProduct } from './map';
import { selectCoreProducts } from './select';
import type { Product } from '$lib/storefront/search';

export { toProduct };

/** The visible Tarn & Trail catalogue: active, non-hidden, core collection. */
export async function listCoreProducts(): Promise<Product[]> {
  const rows = await selectCoreProducts(db);
  return rows.map(toProduct);
}
