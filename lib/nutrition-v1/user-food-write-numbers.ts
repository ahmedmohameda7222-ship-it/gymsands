/** Numeric custom Food facts must be explicitly measured JSON numbers. */
export function requireNonNegativeFoodNumber(value: unknown, label: string): number {
  // Number(null), Number(false) and Number("") would invent a measured zero.
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error(`${label} must be a non-negative number.`);
  }
  return value;
}

/** Nullable serving-basis quantities must never be inferred from booleans or strings. */
export function optionalPositiveFoodNumber(value: unknown, label: string): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be greater than zero.`);
  }
  return value;
}
