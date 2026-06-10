/**
 * Domain types for per-category facet ordering (idea: browse #1).
 *
 * These are the storefront-facing shapes the facet-ordering port speaks — kept
 * free of any persistence detail (no Drizzle row types, no DB ids). The data
 * layer maps `category_facet_orders` / `default_facet_orders` rows onto these
 * in `map.ts`; routes and search logic only ever see these.
 */

/** One facet placed at a position in an ordering. */
export interface FacetOrder {
  facetKey: string;
  displayOrder: number;
}

/** The full ordered set of facets configured for a single category. */
export interface CategoryFacetConfig {
  categorySlug: string;
  facetOrders: FacetOrder[];
}
