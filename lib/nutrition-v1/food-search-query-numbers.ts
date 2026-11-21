/** Objective Food Library filter amounts: measured nonnegative decimal text. */
const NON_NEGATIVE_DECIMAL_QUERY = /^(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/;

export function parseNonNegativeFoodSearchQueryAmount(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (!NON_NEGATIVE_DECIMAL_QUERY.test(text)) return null;
  const amount = Number(text);
  return Number.isFinite(amount) && amount >= 0 ? amount : null;
}
