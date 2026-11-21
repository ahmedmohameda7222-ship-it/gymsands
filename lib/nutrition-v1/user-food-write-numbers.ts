/** Safe client-side error classification for invalid custom Food input. */
export class InvalidNutritionFoodInputError extends Error {
  readonly status = 400 as const;
  readonly code = "nutrition_request_invalid" as const;

  constructor(message: string) {
    super(message);
    this.name = "InvalidNutritionFoodInputError";
  }
}

/** Numeric custom Food facts must be explicitly measured JSON numbers. */
export function requireNonNegativeFoodNumber(value: unknown, label: string): number {
  // Number(null), Number(false) and Number("") would invent a measured zero.
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new InvalidNutritionFoodInputError(`${label} must be a non-negative number.`);
  }
  return value;
}

/** Nullable serving-basis quantities must never be inferred from booleans or strings. */
export function optionalPositiveFoodNumber(value: unknown, label: string): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new InvalidNutritionFoodInputError(`${label} must be greater than zero.`);
  }
  return value;
}
