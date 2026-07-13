import { describe, it, expect } from 'vitest';
import { render } from 'vitest-browser-svelte';
import AdminFacetsPage from './+page.svelte';

// Real-Chromium component test (no mocks). Drag-and-drop is exercised by dispatching the native
// drag events on the row elements — deterministic, so the test is reliable (no drag physics).

const data = {
  categories: ['down-jacket', 'hiking-boot', 'shell-jacket', 'tent'],
  selected: 'tent',
  facets: ['season', 'capacity', 'price', 'rating', 'availability']
};

const rowKeys = (screen: ReturnType<typeof render>): (string | null)[] =>
  screen
    .getByTestId('facet-row')
    .elements()
    .map((el) => el.getAttribute('data-facet'));

describe('facet admin UI', () => {
  it('lists the selected category facets as rows in order', async () => {
    const screen = render(AdminFacetsPage, { data });
    expect(rowKeys(screen)).toEqual(['season', 'capacity', 'price', 'rating', 'availability']);
  });

  it('reorders rows when one is dragged onto another', async () => {
    const screen = render(AdminFacetsPage, { data });
    const rows = screen.getByTestId('facet-row').elements();
    // drag "capacity" (index 1) onto "season" (index 0)
    rows[1].dispatchEvent(new DragEvent('dragstart', { bubbles: true }));
    rows[0].dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true }));
    rows[0].dispatchEvent(new DragEvent('drop', { bubbles: true }));
    // poll: Svelte flushes the $state-driven DOM update asynchronously
    await expect.poll(() => rowKeys(screen)).toEqual([
      'capacity',
      'season',
      'price',
      'rating',
      'availability'
    ]);
  });

  it('keeps the hidden order input in sync with the displayed order', async () => {
    const screen = render(AdminFacetsPage, { data });
    const rows = screen.getByTestId('facet-row').elements();
    rows[1].dispatchEvent(new DragEvent('dragstart', { bubbles: true }));
    rows[0].dispatchEvent(new DragEvent('drop', { bubbles: true }));
    await expect
      .poll(() => (screen.getByTestId('order-input').element() as HTMLInputElement).value)
      .toBe('capacity,season,price,rating,availability');
  });
});
