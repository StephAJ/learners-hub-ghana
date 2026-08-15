/* ==========================================================================
   The arithmetic of an ordering answer

   Split out of reorder-response.tsx so it can be tested without a browser:
   the drag needs pointer events, but what the drag computes is two pure
   functions, and both are places an ordering question could quietly mark
   wrong.
   ========================================================================== */

export type ReorderOption = { id: string; label: string };

/** Move one item from `from` to `to`, keeping every other item's order. */
export function reorder(order: string[], from: number, to: number): string[] {
  const next = [...order];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

/**
 * The learner's order, repaired against the options the paper actually holds.
 *
 * A stored answer can disagree with the question. An author can edit an
 * ordering question between a learner starting and resuming; an attempt from
 * before this component existed carries the shape the old dropdowns wrote,
 * which allowed both blank positions and the same item chosen twice. Anything
 * unrecognised or repeated is dropped and anything missing is appended, so the
 * list always shows every option exactly once whatever it was handed.
 */
export function normaliseOrder(
  value: unknown,
  options: ReorderOption[],
): string[] {
  const known = new Set(options.map((option) => option.id));
  const seen = new Set<string>();
  const order: string[] = [];

  if (Array.isArray(value)) {
    for (const entry of value) {
      const id = String(entry);
      if (!known.has(id) || seen.has(id)) continue;
      seen.add(id);
      order.push(id);
    }
  }

  for (const option of options) {
    if (!seen.has(option.id)) order.push(option.id);
  }

  return order;
}
