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

const data = { catalog, synonyms, category: null, facetOrder: [], defaultFacetOrder: [] };

describe('Routeburn storefront', () => {
  it('the brand renders as "ROUTEBURN" in the header', async () => {
    const screen = render(StorefrontPage, { data });
    await expect.element(screen.getByRole('link', { name: 'ROUTEBURN' })).toBeVisible();
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

  it('the hero section includes an expanded tagline', async () => {
    const screen = render(StorefrontPage, { data });
    await expect.element(screen.getByText(/Trails tested, customer approved./i)).toBeVisible();
  });
});
