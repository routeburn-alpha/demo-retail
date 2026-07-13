/**
 * Move the item at index `from` to index `to`, returning a new array. A no-op copy is returned when
 * either index is out of range or `from === to`. Pure — used by the admin facet drag-and-drop.
 */
export function reorder<T>(list: readonly T[], from: number, to: number): T[] {
  const next = [...list];
  if (
    from === to ||
    from < 0 ||
    to < 0 ||
    from >= list.length ||
    to >= list.length
  ) {
    return next;
  }
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}
