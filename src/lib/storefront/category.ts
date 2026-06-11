/**
 * Detect the current browse category from the request URL.
 *
 * Today the storefront is a single `/` page, so the category context comes from the `?category=`
 * query param. Returns the slug (trimmed + lowercased to match the slugified-`products.category`
 * convention the facet seed uses) or `null` when absent/blank. Pure — no I/O.
 *
 * This is the seam browse #7 (category detection) extends: richer detection (product context,
 * active filters) can land behind this same signature without touching the page-load wiring.
 */
export function detectCategory(url: URL): string | null {
  const raw = url.searchParams.get('category');
  const slug = raw?.trim().toLowerCase();
  return slug ? slug : null;
}
