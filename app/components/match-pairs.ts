/* ==========================================================================
   The arithmetic of a matching answer

   Split from match-response.tsx so it can be tested without a browser. The
   stored shape is unchanged from the dropdowns this replaces — an object of
   left key to right key — because the marker already compares it as a set of
   pairs, sorted by key and with blanks dropped.
   ========================================================================== */

export type MatchOption = { id: string; label: string };

/** Options arrive prefixed, which is how the author's two columns are kept
    apart in one flat list. The stored answer uses the bare keys. */
export function stripSide(id: string): string {
  return id.replace(/^(left|right):/, "");
}

export function leftOptions(options: MatchOption[]): MatchOption[] {
  return options.filter((option) => option.id.startsWith("left:"));
}

export function rightOptions(options: MatchOption[]): MatchOption[] {
  return options.filter((option) => option.id.startsWith("right:"));
}

/** The left key currently holding this right key, if any. */
export function ownerOf(
  matches: Record<string, string>,
  rightKey: string,
): string | undefined {
  return Object.keys(matches).find((key) => matches[key] === rightKey);
}

/**
 * Join a left item to a right one.
 *
 * A right item belongs to exactly one left item, so linking one that is
 * already taken moves it rather than letting two rows claim the same answer —
 * which the dropdowns allowed, and which no matching question ever means.
 */
export function linkPair(
  matches: Record<string, string>,
  leftKey: string,
  rightKey: string,
): Record<string, string> {
  const next: Record<string, string> = {};
  for (const [key, value] of Object.entries(matches)) {
    if (key === leftKey || value === rightKey) continue;
    next[key] = value;
  }
  next[leftKey] = rightKey;
  return next;
}

/** Break the pair a left item holds. */
export function unlink(
  matches: Record<string, string>,
  leftKey: string,
): Record<string, string> {
  const next = { ...matches };
  delete next[leftKey];
  return next;
}

/**
 * Which pair number a left item is, for the colour and badge.
 *
 * Numbered by the author's own left-hand order rather than by when the learner
 * made the link, so the badge on a row does not change as they work — a mark
 * moving around while you are thinking is its own small distraction.
 */
export function pairNumber(leftKey: string, options: MatchOption[]): number {
  return (
    leftOptions(options).findIndex(
      (option) => stripSide(option.id) === leftKey,
    ) + 1
  );
}

/** Drop anything the question no longer holds, as an author can edit between
    a learner starting and resuming. */
export function normaliseMatches(
  value: unknown,
  options: MatchOption[],
): Record<string, string> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return {};
  }
  const lefts = new Set(leftOptions(options).map((o) => stripSide(o.id)));
  const rights = new Set(rightOptions(options).map((o) => stripSide(o.id)));
  const taken = new Set<string>();
  const next: Record<string, string> = {};

  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    const match = String(raw ?? "");
    if (!lefts.has(key) || !rights.has(match) || taken.has(match)) continue;
    taken.add(match);
    next[key] = match;
  }
  return next;
}
