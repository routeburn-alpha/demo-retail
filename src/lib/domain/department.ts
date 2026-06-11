/**
 * Department / gender dimension for the catalogue. `Department` is the value stored on each product;
 * `DepartmentFilter` is what a shopper can pick in the UI ("All" = no filter). A department filter is
 * inclusive of unisex gear — picking Women's shows women's apparel *and* the gender-neutral gear.
 * Pure (no I/O) so it is unit-testable and usable from both the data layer and the route.
 */
export const DEPARTMENTS = ['womens', 'mens', 'unisex'] as const;
export type Department = (typeof DEPARTMENTS)[number];

export const DEPARTMENT_FILTERS = ['womens', 'mens'] as const;
export type DepartmentFilter = (typeof DEPARTMENT_FILTERS)[number];

/** Validate a raw `?department=` value; returns null for "All" / anything unrecognised. */
export function parseDepartmentFilter(value: string | null | undefined): DepartmentFilter | null {
  return value === 'womens' || value === 'mens' ? value : null;
}

/** Which product departments are visible under a filter (always includes `unisex`). */
export function departmentsFor(filter: DepartmentFilter): Department[] {
  return filter === 'womens' ? ['womens', 'unisex'] : ['mens', 'unisex'];
}
