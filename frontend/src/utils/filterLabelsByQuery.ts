export function filterByNameQuery<T extends { name: string }>(
  items: T[],
  query: string,
  alwaysIncludeNames?: Set<string>,
): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return items;
  return items.filter(
    (item) => item.name.toLowerCase().includes(q) || alwaysIncludeNames?.has(item.name),
  );
}

export function filterTagsByQuery<T extends { id: number; name: string }>(
  items: T[],
  query: string,
  alwaysIncludeIds?: Set<number>,
): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return items;
  return items.filter(
    (item) => item.name.toLowerCase().includes(q) || alwaysIncludeIds?.has(item.id),
  );
}
