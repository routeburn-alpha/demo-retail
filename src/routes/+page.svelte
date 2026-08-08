<script lang="ts">
  import { search, orderFacets, type Product } from '$lib/storefront/search';
  import { POPULAR_QUERIES } from '$lib/storefront/popular-queries';
  import type { FacetOrder } from '$lib/domain/facets';
  import type { DepartmentFilter } from '$lib/domain/department';

  let {
    data
  }: {
    data: {
      catalog: Product[];
      category: string | null;
      facetOrder: FacetOrder[];
      defaultFacetOrder: FacetOrder[];
      department?: DepartmentFilter | null;
    };
  } = $props();

  // Department filter (server-side, URL-driven). "All" = no `?department=` param.
  const departmentNav = $derived([
    { label: 'All', href: '/', active: !data.department },
    { label: "Women's", href: '/?department=womens', active: data.department === 'womens' },
    { label: "Men's", href: '/?department=mens', active: data.department === 'mens' }
  ]);

  let query = $state('');
  let results = $derived(search(query, data.catalog));

  // Facets to show = the union of the category + default configs, ordered by the
  // category's ordering (default as fallback) via the shared pure helper.
  const availableFacets = $derived([
    ...new Set([...data.facetOrder, ...data.defaultFacetOrder].map((f) => f.facetKey))
  ]);
  const orderedFacets = $derived(
    orderFacets(availableFacets, data.facetOrder, data.defaultFacetOrder)
  );

  let activeFacets = $state(new Set<string>());
  function toggleFacet(key: string) {
    const next = new Set(activeFacets);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    activeFacets = next;
  }

  const formatPrice = (n: number) => `$${n.toFixed(0)}`;
  const facetLabel = (key: string) =>
    key
      .split('-')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');

  function setQuery(next: string) {
    query = next;
  }
</script>

<div data-testid="page-root" class="min-h-screen" style="background-color: #e8f5e9">
<header class="sticky top-0 z-10 border-b border-line bg-surface/95 backdrop-blur">
  <div class="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:gap-6 sm:px-6 sm:py-5">
    <a href="/" class="font-display whitespace-nowrap text-sm tracking-[0.15em] text-ink sm:text-xl sm:tracking-[0.3em]">ROUTEBURN</a>
    <div class="relative w-full max-w-md">
      <svg
        class="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-ink/60"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <circle cx="11" cy="11" r="7" />
        <path d="m21 21-4.3-4.3" />
      </svg>
      <input
        type="search"
        bind:value={query}
        aria-label="Search"
        placeholder="Search the catalogue…"
        class="w-full rounded-full border border-line bg-bg py-3 pl-10 pr-10 text-base text-ink placeholder:text-ink/55 focus:border-accent focus:outline-none"
      />
      {#if query.length > 0}
        <button
          type="button"
          aria-label="Clear search"
          onclick={() => setQuery('')}
          class="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full text-ink/60 hover:bg-line hover:text-ink"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="h-3.5 w-3.5">
            <path d="M18 6 6 18" /><path d="m6 6 12 12" />
          </svg>
        </button>
      {/if}
    </div>
  </div>
</header>

<nav aria-label="Department" class="border-b border-line bg-surface/60">
  <div class="mx-auto flex max-w-6xl items-center gap-1 px-4 py-2 text-sm sm:px-6">
    {#each departmentNav as item (item.href)}
      <a
        href={item.href}
        data-testid="department-link"
        data-active={item.active}
        aria-current={item.active ? 'page' : undefined}
        class="rounded-full px-3 py-1 transition {item.active
          ? 'bg-accent text-bg'
          : 'text-ink/70 hover:text-ink'}"
      >
        {item.label}
      </a>
    {/each}
  </div>
</nav>

{#if query.trim() === ''}
  <section class="relative isolate overflow-hidden border-b border-line bg-[#0f1a14]">
    <img
      src="/routeburn-hero.jpg"
      alt=""
      aria-hidden="true"
      data-testid="hero-backdrop"
      class="absolute inset-0 -z-10 h-full w-full object-cover object-center"
    />
    <!-- Brand-green wash multiplied over the photo: keeps the banner green while the trail shows through.
         Slight opacity lets more of the photo read through the multiply. -->
    <div
      aria-hidden="true"
      class="absolute inset-0 -z-10 opacity-[0.82] mix-blend-multiply"
      style="background: linear-gradient(135deg, #2f4a3a 0%, #1a2820 60%, #0f1a14 100%);"
    ></div>
    <!-- Left-side darken so the heading/subhead stay legible over the photo -->
    <div
      aria-hidden="true"
      class="absolute inset-0 -z-10"
      style="background: linear-gradient(90deg, rgba(15,26,20,0.7) 0%, rgba(15,26,20,0.25) 55%, rgba(15,26,20,0) 100%);"
    ></div>
    <div class="mx-auto max-w-6xl px-6 py-16 text-bg sm:py-20">
      <p class="mb-3 text-xs uppercase tracking-[0.3em] text-bg/80">Autumn 2026</p>
      <h1 class="font-display text-3xl leading-tight sm:text-4xl md:text-5xl">Find your peak</h1>
      <p class="mt-4 max-w-md text-sm text-bg/90">
        Built for the long way home
      </p>
    </div>
  </section>
{/if}

<main class="mx-auto max-w-6xl px-6 py-10">
  {#if orderedFacets.length > 0}
    <div data-testid="facet-bar" class="mb-8">
      <p class="mb-3 text-[10px] uppercase tracking-[0.2em] text-ink/70">Filters</p>
      <div class="flex flex-wrap gap-2">
        {#each orderedFacets as key (key)}
          <button
            type="button"
            data-testid="facet-chip"
            data-facet={key}
            aria-pressed={activeFacets.has(key)}
            onclick={() => toggleFacet(key)}
            class="rounded-full border px-4 py-1.5 text-sm transition {activeFacets.has(key)
              ? 'border-accent bg-accent text-bg'
              : 'border-line bg-surface text-ink hover:border-accent hover:text-accent'}"
          >
            {facetLabel(key)}
          </button>
        {/each}
      </div>
    </div>
  {/if}
  {#if query.trim() === ''}
    <div class="mb-6 flex items-baseline justify-between">
      <h2 class="font-display text-lg tracking-wide text-ink">The Catalogue</h2>
      <p class="text-xs uppercase tracking-widest text-ink/70">
        {data.catalog.length} items
      </p>
    </div>
    <div class="grid grid-cols-2 gap-x-5 gap-y-10 sm:grid-cols-3 lg:grid-cols-4">
      {#each data.catalog as product (product.id)}
        <article data-testid="product-card" class="group">
          <div class="relative aspect-[4/5] overflow-hidden rounded-sm bg-bg">
            <img
              src={product.imageUrl}
              alt={product.name}
              loading="lazy"
              class="h-full w-full object-cover transition duration-500 group-hover:scale-105"
            />
            <span aria-hidden="true" class="pointer-events-none absolute bottom-1.5 right-1.5 h-6 w-6 rounded-sm bg-bg/70 backdrop-blur-sm"></span>
          </div>
          <div class="mt-3">
            <p class="text-[10px] uppercase tracking-[0.2em] text-ink/70">{product.category}</p>
            <div class="mt-1 flex items-start justify-between gap-3">
              <h3 class="text-sm font-medium text-ink">{product.name}</h3>
              {#if product.salePrice != null && product.discountPct != null}
                <div class="flex flex-col items-end gap-0.5">
                  <s data-testid="original-price" class="text-xs text-ink/45">{formatPrice(product.price)}</s>
                  <span data-testid="sale-price" class="text-sm font-medium text-red-600">{formatPrice(product.salePrice)}</span>
                  <span data-testid="discount-badge" class="rounded bg-red-600 px-1 py-0.5 text-[10px] font-semibold text-white">-{product.discountPct}%</span>
                </div>
              {:else}
                <p class="text-sm text-ink/75">{formatPrice(product.price)}</p>
              {/if}
            </div>
          </div>
        </article>
      {/each}
    </div>
  {:else if results.length > 0}
    <p class="mb-6 text-sm text-ink/80">
      {results.length} {results.length === 1 ? 'result' : 'results'} for "{query.trim()}"
    </p>
    <div class="flex flex-wrap justify-start gap-x-5 gap-y-10" class:justify-center={results.length < 4}>
      {#each results as product (product.id)}
        <article
          data-testid="product-card"
          class="group w-[calc(50%-0.625rem)] sm:w-[calc(33.333%-0.834rem)] lg:w-[calc(25%-0.938rem)]"
        >
          <div class="relative aspect-[4/5] overflow-hidden rounded-sm bg-bg">
            <img
              src={product.imageUrl}
              alt={product.name}
              loading="lazy"
              class="h-full w-full object-cover transition duration-500 group-hover:scale-105"
            />
            <span aria-hidden="true" class="pointer-events-none absolute bottom-1.5 right-1.5 h-6 w-6 rounded-sm bg-bg/70 backdrop-blur-sm"></span>
          </div>
          <div class="mt-3">
            <p class="text-[10px] uppercase tracking-[0.2em] text-ink/70">{product.category}</p>
            <div class="mt-1 flex items-start justify-between gap-3">
              <h3 class="text-sm font-medium text-ink">{product.name}</h3>
              {#if product.salePrice != null && product.discountPct != null}
                <div class="flex flex-col items-end gap-0.5">
                  <s data-testid="original-price" class="text-xs text-ink/45">{formatPrice(product.price)}</s>
                  <span data-testid="sale-price" class="text-sm font-medium text-red-600">{formatPrice(product.salePrice)}</span>
                  <span data-testid="discount-badge" class="rounded bg-red-600 px-1 py-0.5 text-[10px] font-semibold text-white">-{product.discountPct}%</span>
                </div>
              {:else}
                <p class="text-sm text-ink/75">{formatPrice(product.price)}</p>
              {/if}
            </div>
          </div>
        </article>
      {/each}
    </div>
  {:else}
    <section data-testid="zero-results" class="py-20 text-center">
      <p class="font-display text-xl text-ink">Nothing for "{query.trim()}".</p>
      <p class="mt-2 text-sm text-ink/75">Popular right now:</p>
      <div class="mt-8 flex flex-wrap justify-center gap-3">
        {#each POPULAR_QUERIES as suggestion (suggestion)}
          <button
            type="button"
            data-testid="suggestion-pill"
            onclick={() => setQuery(suggestion)}
            class="rounded-full border border-line bg-surface px-5 py-2 text-sm text-ink transition hover:border-accent hover:text-accent"
          >
            {suggestion}
          </button>
        {/each}
      </div>
    </section>
  {/if}
</main>

<footer class="mt-16 border-t border-line bg-surface">
  <div class="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-6 py-8 text-xs text-ink/65">
    <span class="font-display tracking-[0.3em]">ROUTEBURN</span>
    <span>Outdoor gear for the country between the trailhead and the col.</span>
  </div>
</footer>
</div>
