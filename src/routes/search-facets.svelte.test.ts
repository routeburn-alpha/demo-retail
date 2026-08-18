import { describe, it, expect } from 'vitest';
import { render } from 'vitest-browser-svelte';
import StorefrontPage from './+page.svelte';
import type { Product } from '$lib/domain/product';
import type { FacetOrder } from '$lib/domain/facets';

// Real-Chromium component test (no mocks): render the real page with real `data`
// props and assert the facet bar renders the configured ordering + engagement.

const catalog: Product[] = [
  {
    id: 'tent-001',
    name: 'Skyline 2P Tent',
    category: 'tent',
    price: 410,
    description: 'two person three season',
    imageUrl: 'https://example.com/tent-001.jpg'
  }
];

type FacetData = { category?: string | null; facetOrder?: FacetOrder[]; defaultFacetOrder?: FacetOrder[] };
const data = (over: FacetData) => ({
  catalog,
  category: over.category ?? null,
  facetOrder: over.facetOrder ?? [],
  defaultFacetOrder: over.defaultFacetOrder ?? []
});

const DEFAULTS: FacetOrder[] = [
  { facetKey: 'price', displayOrder: 1 },
  { facetKey: 'rating', displayOrder: 2 },
  { facetKey: 'availability', displayOrder: 3 }
];

const chipKeys = (screen: ReturnType<typeof render>): (string | null)[] =>
  screen
    .getByTestId('facet-chip')
    .elements()
    .map((el) => el.getAttribute('data-facet'));

describe('facet ordering UI', () => {
  it('renders the category facets first, then default-only facets, in displayOrder', async () => {
    const screen = render(StorefrontPage, {
      data: data({
        category: 'tent',
        facetOrder: [
          { facetKey: 'season', displayOrder: 1 },
          { facetKey: 'capacity', displayOrder: 2 }
        ],
        defaultFacetOrder: DEFAULTS
      })
    });
    await expect.element(screen.getByTestId('facet-bar')).toBeVisible();
    expect(chipKeys(screen)).toEqual(['season', 'capacity', 'price', 'rating', 'availability']);
  });

  it('falls back to the default ordering when no category is configured', async () => {
    const screen = render(StorefrontPage, { data: data({ defaultFacetOrder: DEFAULTS }) });
    expect(chipKeys(screen)).toEqual(['price', 'rating', 'availability']);
  });

  it('toggles a facet active when clicked (engagement)', async () => {
    const screen = render(StorefrontPage, {
      data: data({ defaultFacetOrder: [{ facetKey: 'price', displayOrder: 1 }] })
    });
    const chip = screen.getByTestId('facet-chip');
    await expect.element(chip).toHaveAttribute('aria-pressed', 'false');
    await chip.click();
    await expect.element(chip).toHaveAttribute('aria-pressed', 'true');
  });
});
