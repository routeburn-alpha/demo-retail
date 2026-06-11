/**
 * Category-detection logic for the browse/search-discovery context (idea browse #1). Pure — no I/O.
 *
 * Category context can come from several signals; consumers compose them, e.g.
 *   detectCategory(url) ?? categoryFromProducts(results)
 * (an explicit `?category=` URL param wins; otherwise infer from the current product listing). The
 * resolved slug feeds facet-ordering selection via the page-load port.
 */

/** Canonical slug for a `products.category` value (e.g. "Shell Jacket" → "shell-jacket"). */
export function slugifyCategory(category: string): string {
  return category
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * The category named explicitly in the request URL (`?category=`), trimmed + lowercased, or `null`
 * when absent/blank. The minimal detection signal — highest priority. The param is already expected
 * to be a slug, so it is not re-slugified (that would mangle namespaced values like `__test__…`).
 */
export function detectCategory(url: URL): string | null {
  const slug = url.searchParams.get('category')?.trim().toLowerCase();
  return slug ? slug : null;
}

/**
 * Infer the category from a product listing (e.g. the current search results): the dominant
 * (most frequent) category, slugified. Ties are broken by first appearance — the listing order is
 * meaningful (top results first). Returns `null` for an empty listing.
 */
export function categoryFromProducts(
  products: ReadonlyArray<{ category: string }>
): string | null {
  const counts = new Map<string, number>();
  for (const { category } of products) {
    const slug = slugifyCategory(category);
    if (slug) counts.set(slug, (counts.get(slug) ?? 0) + 1);
  }
  let best: string | null = null;
  let bestCount = 0;
  for (const [slug, count] of counts) {
    if (count > bestCount) {
      best = slug;
      bestCount = count;
    }
  }
  return best;
}
