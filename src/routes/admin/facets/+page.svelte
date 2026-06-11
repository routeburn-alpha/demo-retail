<script lang="ts">
  import type { PageData, ActionData } from './$types';
  import { reorder } from '$lib/storefront/reorder';

  let { data, form = null }: { data: PageData; form?: ActionData } = $props();

  // The user's drag reordering, or null to show the server's ordering for this category. Held
  // separately so the displayed list (`facets`) stays derived from `data` — it resets when the load
  // sends a new ordering (navigating categories / after a save).
  let userOrder = $state<string[] | null>(null);
  const facets = $derived(userOrder ?? data.facets);
  let dragFrom = -1;

  function onDrop(to: number) {
    if (dragFrom >= 0) userOrder = reorder(facets, dragFrom, to);
    dragFrom = -1;
  }

  const facetLabel = (key: string) =>
    key
      .split('-')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
</script>

<main class="mx-auto max-w-2xl px-6 py-12">
  <h1 class="font-display text-2xl tracking-wide text-ink">Facet ordering — admin</h1>
  <p class="mt-1 text-sm text-muted">
    Set the order filters appear in for a category. Drag a row to reorder, then save.
  </p>

  <form method="GET" class="mt-8 flex items-center gap-3">
    <label for="category" class="text-sm text-ink">Category</label>
    <select
      id="category"
      name="category"
      value={data.selected}
      onchange={(e) => e.currentTarget.form?.requestSubmit()}
      class="rounded-md border border-line bg-bg px-3 py-1.5 text-sm text-ink focus:border-accent focus:outline-none"
    >
      {#each data.categories as category (category)}
        <option value={category}>{facetLabel(category)}</option>
      {/each}
    </select>
    <noscript>
      <button type="submit" class="rounded-full border border-line px-4 py-1.5 text-sm text-ink">Go</button>
    </noscript>
  </form>

  {#if form?.success}
    <p
      data-testid="save-success"
      class="mt-6 rounded-md border border-accent bg-surface px-4 py-2 text-sm text-accent"
    >
      Saved the facet order for {facetLabel(form.category)}.
    </p>
  {:else if form?.message}
    <p
      data-testid="save-error"
      class="mt-6 rounded-md border border-red-300 bg-red-50 px-4 py-2 text-sm text-red-700"
    >
      {form.message}
    </p>
  {/if}

  <form method="POST" class="mt-6">
    <input type="hidden" name="category" value={data.selected} />
    <input type="hidden" name="order" value={facets.join(',')} data-testid="order-input" />

    <ul class="space-y-2">
      {#each facets as key, i (key)}
        <li
          draggable="true"
          data-testid="facet-row"
          data-facet={key}
          ondragstart={() => (dragFrom = i)}
          ondragover={(e) => e.preventDefault()}
          ondrop={() => onDrop(i)}
          class="flex cursor-grab items-center gap-3 rounded-md border border-line bg-surface px-4 py-2.5 text-sm text-ink active:cursor-grabbing"
        >
          <span aria-hidden="true" class="text-line">☰</span>
          <span class="w-5 text-muted">{i + 1}</span>
          <span class="font-medium">{facetLabel(key)}</span>
        </li>
      {/each}
    </ul>

    <button
      type="submit"
      class="mt-6 rounded-full bg-accent px-6 py-2 text-sm text-bg transition hover:opacity-90"
    >
      Save order
    </button>
  </form>
</main>
