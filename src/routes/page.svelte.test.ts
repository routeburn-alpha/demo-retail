import { describe, it, expect } from 'vitest';
import { render } from 'vitest-browser-svelte';
import StorefrontPage from './+page.svelte';
import type { Product, Synonyms } from '$lib/storefront/search';
import { POPULAR_QUERIES } from '$lib/storefront/popular-queries';

const catalog: Product[] = [
  {
    id: 'tr-001',
    name: 'Cascade Trail Runner',
    category: 'trail runner',
    price: 145,
    description: 'cushioned mixed terrain',
    imageUrl: 'https://example.com/tr-001.jpg'
  },
  {
    id: 'shell-001',
    name: 'Storm Cirrus Shell',
    category: 'shell jacket',
    price: 320,
    description: 'three layer waterproof',
    imageUrl: 'https://example.com/shell-001.jpg'
  },
  {
    id: 'pack-001',
    name: 'Tarn 38L Backpack',
    category: 'backpack',
    price: 220,
    description: 'touring pack with hipbelt pockets',
    imageUrl: 'https://example.com/pack-001.jpg'
  },
  {
    id: 'gloves-001',
    name: 'Windproof Liner Gloves',
    category: 'gloves',
    price: 55,
    description: 'pair under a shell mitt for cold belays',
    imageUrl: 'https://example.com/gloves-001.jpg'
  }
];

const synonyms: Synonyms = {
  trainers: ['trail runner'],
  runners: ['trail runner'],
  rucksack: ['backpack']
};

const saleProduct: Product = {
  id: 'shell-001',
  name: 'Storm Cirrus Shell',
  category: 'shell jacket',
  price: 320,
  salePrice: 256,
  discountPct: 20,
  description: 'three layer waterproof',
  imageUrl: 'https://example.com/shell-001.jpg'
};

const data = { catalog, synonyms, category: null, facetOrder: [], defaultFacetOrder: [] };

describe('Routeburn storefront', () => {
  it('the brand renders as "ROUTEBURN" in the header', async () => {
    const screen = render(StorefrontPage, { data });
    await expect.element(screen.getByRole('link', { name: 'ROUTEBURN' })).toBeVisible();
  });

  it('the hero tagline reads "Chase the ridgeline"', async () => {
    const screen = render(StorefrontPage, { data });
    await expect.element(screen.getByText('Chase the ridgeline')).toBeVisible();
  });

  it('the hero banner has a Routeburn trail backdrop image', async () => {
    const screen = render(StorefrontPage, { data });
    await expect.element(screen.getByTestId('hero-backdrop')).toBeInTheDocument();
  });

  it('typing "trainers" returns trail-runner products via synonym substitution', async () => {
    const screen = render(StorefrontPage, { data });
    await screen.getByLabelText('Search').fill('trainers');
    await expect.element(screen.getByText('Cascade Trail Runner')).toBeVisible();
  });

  it('typing a nonsense query shows the popular-query pills with the right labels', async () => {
    const screen = render(StorefrontPage, { data });
    await screen.getByLabelText('Search').fill('xyzpdq');
    await expect.element(screen.getByTestId('zero-results')).toBeVisible();
    for (const label of POPULAR_QUERIES) {
      await expect.element(screen.getByRole('button', { name: label })).toBeVisible();
    }
  });

  it('clicking a pill re-runs the search with that text', async () => {
    const screen = render(StorefrontPage, { data });
    await screen.getByLabelText('Search').fill('xyzpdq');
    await screen.getByRole('button', { name: 'trail runners' }).click();
    await expect.element(screen.getByText('Cascade Trail Runner')).toBeVisible();
  });

  it('multi-synonym query: "rucksack trainers" returns BOTH backpack AND trail runner', async () => {
    const screen = render(StorefrontPage, { data });
    await screen.getByLabelText('Search').fill('rucksack trainers');
    await expect.element(screen.getByText('Tarn 38L Backpack')).toBeVisible();
    await expect.element(screen.getByText('Cascade Trail Runner')).toBeVisible();
  });

  it('keyword precision: "shell" matches the shell jacket but NOT the gloves whose description mentions "shell mitt"', async () => {
    const screen = render(StorefrontPage, { data });
    await screen.getByLabelText('Search').fill('shell');
    await expect.element(screen.getByText('Storm Cirrus Shell')).toBeVisible();
    await expect.element(screen.getByText('Windproof Liner Gloves')).not.toBeInTheDocument();
  });

  it('case-insensitive: typing "TRAINERS" returns trail-runner products', async () => {
    const screen = render(StorefrontPage, { data });
    await screen.getByLabelText('Search').fill('TRAINERS');
    await expect.element(screen.getByText('Cascade Trail Runner')).toBeVisible();
  });

  it('result-count label trims surrounding whitespace from the displayed query', async () => {
    const screen = render(StorefrontPage, { data });
    await screen.getByLabelText('Search').fill('  trainers  ');
    await expect.element(screen.getByText(/for "trainers"/i)).toBeVisible();
  });

  it('sale badge shows strikethrough original price, sale price, and discount percent', async () => {
    const catalogWithSale = catalog.map((p) => (p.id === 'shell-001' ? saleProduct : p));
    const screen = render(StorefrontPage, { data: { ...data, catalog: catalogWithSale } });
    // strikethrough original price
    await expect.element(screen.getByTestId('original-price')).toBeVisible();
    // sale price
    await expect.element(screen.getByTestId('sale-price')).toBeVisible();
    // discount badge
    await expect.element(screen.getByTestId('discount-badge')).toBeVisible();
    await expect.element(screen.getByTestId('discount-badge')).toHaveTextContent('-20%');
  });

  it('search input is larger: has py-3 and text-base classes for improved visibility', async () => {
    const screen = render(StorefrontPage, { data });
    const input = screen.getByLabelText('Search');
    await expect.element(input).toHaveClass('py-3');
    await expect.element(input).toHaveClass('text-base');
  });

  it('page root container has a light pink background', async () => {
    const screen = render(StorefrontPage, { data });
    const pageRoot = screen.getByTestId('page-root');
    await expect.element(pageRoot).toHaveStyle(`background-color: rgb(255, 182, 217)`);
  });

  it('zero-results shows exactly 5 suggestion pills with data-testid="suggestion-pill"', async () => {
    const screen = render(StorefrontPage, { data });
    await screen.getByLabelText('Search').fill('xyzzy-not-a-product');
    await expect.element(screen.getByTestId('zero-results')).toBeVisible();
    const pills = screen.getByTestId('suggestion-pill').elements();
    expect(pills).toHaveLength(5);
    const labels = ['rain jacket', 'trail runners', 'sleeping bag', 'down vest', 'merino base layer'];
    pills.forEach((el, i) => expect(el.textContent?.trim()).toBe(labels[i]));
  });
});
