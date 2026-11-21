/** A Shopping quantity may be zero by explicit choice, never by blank text coercion. */
const NON_NEGATIVE_DECIMAL_INPUT = /^(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/;

export function parseShoppingWriteQuantity(value: string): number | null {
  const raw = value.trim();
  if (!NON_NEGATIVE_DECIMAL_INPUT.test(raw)) return null;
  const numeric = Number(raw);
  return Number.isFinite(numeric) && numeric >= 0 ? numeric : null;
}
