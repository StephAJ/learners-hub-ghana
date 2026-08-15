/* ==========================================================================
   The arithmetic of a sorting answer

   Split from group-response.tsx so it can be tested without a browser.

   The stored shape is a map of item to the group it was put in — the same
   shape a matching answer uses, which is why marking needed no new comparator:
   both are a set of pairs, compared key-sorted with blanks dropped.

   What differs from matching is the constraint. A matching answer is a
   bijection — one right-hand item to one left-hand item. A sorting answer is
   not: a group holds as many items as belong in it, and putting an item
   somewhere must never displace another item that is already there.
   ========================================================================== */

export type SortOption = { id: string; label: string };

export function stripSide(id: string): string {
  return id.replace(/^(left|right):/, "");
}

/** The things being sorted, authored as the left-hand column. */
export function itemOptions(options: SortOption[]): SortOption[] {
  return options.filter((option) => option.id.startsWith("left:"));
}

/** The groups they go into, authored as the right-hand column and already
    de-duplicated by the composer. */
export function groupOptions(options: SortOption[]): SortOption[] {
  return options.filter((option) => option.id.startsWith("right:"));
}

/**
 * Put an item in a group.
 *
 * Unlike linkPair in match-pairs.ts, nothing is taken from anyone: only this
 * item's own placement changes.
 */
export function placeItem(
  placed: Record<string, string>,
  itemKey: string,
  groupKey: string,
): Record<string, string> {
  return { ...placed, [itemKey]: groupKey };
}

/** Take an item back out of whatever group it is in. */
export function removeItem(
  placed: Record<string, string>,
  itemKey: string,
): Record<string, string> {
  const next = { ...placed };
  delete next[itemKey];
  return next;
}

/** The items sitting in one group, in the question's own item order. */
export function itemsIn(
  placed: Record<string, string>,
  groupKey: string,
  options: SortOption[],
): SortOption[] {
  return itemOptions(options).filter(
    (option) => placed[stripSide(option.id)] === groupKey,
  );
}

/** The items not yet placed anywhere, in the question's own order. */
export function unplaced(
  placed: Record<string, string>,
  options: SortOption[],
): SortOption[] {
  return itemOptions(options).filter(
    (option) => !placed[stripSide(option.id)],
  );
}

/**
 * Drop anything the question no longer holds.
 *
 * An author can edit a sorting question between a learner starting and
 * resuming — renaming a group, removing an item — and the stored answer then
 * refers to things that are gone. Those entries are dropped rather than
 * carried, so the screen and the answer always agree.
 */
export function normalisePlacements(
  value: unknown,
  options: SortOption[],
): Record<string, string> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return {};
  }
  const items = new Set(itemOptions(options).map((o) => stripSide(o.id)));
  const groups = new Set(groupOptions(options).map((o) => stripSide(o.id)));
  const next: Record<string, string> = {};

  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    const group = String(raw ?? "");
    if (!items.has(key) || !groups.has(group)) continue;
    next[key] = group;
  }
  return next;
}
