/**
 * Fractional indexing helpers.
 *
 * Every task carries a float `orderIndex`. Moving a card only needs a new
 * index strictly between its two new neighbours, so a reorder touches a single
 * row. Floats run out of precision after ~50 halvings of the same gap, so
 * `needsRebalance` lets callers re-space a column when that happens.
 */

export const ORDER_STEP = 1000;
export const MIN_GAP = 1e-6;

/** New index between `prevIndex` (above) and `nextIndex` (below). Either may be null (edge of list). */
export function calculateOrderIndex(
  prevIndex: number | null | undefined,
  nextIndex: number | null | undefined,
): number {
  const hasPrev = typeof prevIndex === "number";
  const hasNext = typeof nextIndex === "number";

  if (!hasPrev && !hasNext) return ORDER_STEP; // empty column
  if (hasPrev && !hasNext) return prevIndex + ORDER_STEP; // append to bottom
  if (!hasPrev && hasNext) return nextIndex - ORDER_STEP; // prepend to top (never shrinks the gap)
  return (prevIndex! + nextIndex!) / 2;
}

/** True when the gap between neighbours is too small to split again safely. */
export function needsRebalance(
  prevIndex: number | null | undefined,
  nextIndex: number | null | undefined,
): boolean {
  if (typeof prevIndex !== "number" || typeof nextIndex !== "number") return false;
  return Math.abs(nextIndex - prevIndex) < MIN_GAP;
}

/** Evenly re-space `count` items: 1000, 2000, 3000, ... */
export function rebalancedIndexes(count: number): number[] {
  return Array.from({ length: count }, (_, i) => (i + 1) * ORDER_STEP);
}
