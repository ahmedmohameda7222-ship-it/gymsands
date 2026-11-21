/** A Food or Recipe handoff quantity is a measured positive JSON number. */
export function parsePositiveHandoffQuantity(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : null;
}
