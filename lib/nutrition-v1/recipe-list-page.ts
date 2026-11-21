/**
 * A global bounded query for published Recipe versions may contain only
 * one frequently revised Recipe. Resolve the missing roots individually
 * only when the global result has actually reached its cap.
 */
export function recipeVersionBackfillIds(
  rootIds: readonly string[],
  rows: readonly { recipe_id: string }[],
  cap: number,
): string[] {
  if (!Number.isSafeInteger(cap) || cap < 1) {
    throw new Error("Recipe version result cap must be positive.");
  }
  if (rows.length < cap) return [];
  const covered = new Set(rows.map((row) => row.recipe_id));
  return [...new Set(rootIds)].filter((id) => !covered.has(id));
}
