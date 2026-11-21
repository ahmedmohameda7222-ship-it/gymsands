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
