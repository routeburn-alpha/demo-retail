/**
 * The domain `Product` — the storefront-facing shape of a catalogue item.
 *
 * Kept free of persistence detail: no Drizzle row types, no DB-only columns
 * (`hidden`, `active`, `collection`), and price in whole dollars rather than
 * cents. The data layer maps `products` rows onto this in `map.ts`; routes,
 * search logic and any future feature module only ever see this.
 *
 * Lives here rather than in a feature module so the data layer does not have to
 * import from one (ARCHITECTURE.md §2 — the layered data architecture).
 */
export type Product = {
  id: string;
  name: string;
  category: string;
  price: number;
  salePrice?: number;
  discountPct?: number;
  description: string;
  imageUrl: string;
};
