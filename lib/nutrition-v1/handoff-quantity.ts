/** A Food or Recipe handoff quantity is a measured positive JSON number. */
export function parsePositiveHandoffQuantity(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : null;
}

/** Only an omitted Recipe quantity has the historical default of one serving. */
export function parseRecipeHandoffQuantity(value: unknown): number | null {
  return parsePositiveHandoffQuantity(value === undefined ? 1 : value);
}

// URL query values use a decimal/exponent spelling, never JavaScript's
// hexadecimal, binary, octal or blank-to-zero Number() coercions.
const DECIMAL_QUERY_QUANTITY = /^(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/;

export function parsePositiveHandoffQueryQuantity(value: string | null): number | null {
  if (value === null) return null;
  const text = value.trim();
  if (!DECIMAL_QUERY_QUANTITY.test(text)) return null;
  return parsePositiveHandoffQuantity(Number(text));
}

/** An absent Recipe key defaults to 1; an explicitly blank key never does. */
export function parseRecipeHandoffQueryQuantity(value: string | null): number | null {
  return value === null ? 1 : parsePositiveHandoffQueryQuantity(value);
}
