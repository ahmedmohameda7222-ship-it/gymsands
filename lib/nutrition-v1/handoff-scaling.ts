/** Measured overflow is a client-input error, never an unknown nutrient. */
export class NutritionHandoffScaleOverflowError extends Error {
  readonly code = "nutrition_request_invalid" as const;
  readonly status = 400 as const;
  readonly publicMessage = "Serving quantity exceeds the numeric range for the selected nutrition.";

  constructor() {
    super("Serving quantity exceeds the numeric range for the selected nutrition.");
    this.name = "NutritionHandoffScaleOverflowError";
  }
}

/** Preserve null only when originally unknown; do not JSON-encode Infinity as null. */
export function scaleFiniteHandoffNutritionFact(
  value: number | null,
  quantity: number,
  roundToThousandth = false,
): number | null {
  if (value === null) return null;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error("Handoff source nutrition is not a finite non-negative number.");
  }
  if (typeof quantity !== "number" || !Number.isFinite(quantity) || quantity <= 0) {
    throw new Error("Handoff serving quantity must be a positive finite number.");
  }
  const scaled = value * quantity;
  if (!Number.isFinite(scaled)) throw new NutritionHandoffScaleOverflowError();
  if (!roundToThousandth) return scaled;
  const roundedThousandths = scaled * 1000;
  // At very large finite values, rounding to 0.001 changes no representable
  // digits; never overflow the intermediate multiplier merely to round it.
  return Number.isFinite(roundedThousandths)
    ? Math.round(roundedThousandths) / 1000
    : scaled;
}
