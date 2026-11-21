/** Diary JSON nutrition is measured only when a finite nonnegative number is supplied. */
export function parseDiaryWriteNutritionFact(value: unknown): number | null | undefined {
  if (value === null || value === undefined) return null;
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : undefined;
}

/** A Diary plate item's quantity is a positive measured JSON number. */
export function parseDiaryWriteQuantity(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : null;
}

/** Rounded hydration milliliters must stay positive and safely integral. */
export function parseDiaryWaterAmountMl(value: unknown): number | null {
  const positive = parseDiaryWriteQuantity(value);
  if (positive === null) return null;
  const rounded = Math.round(positive);
  return Number.isSafeInteger(rounded) && rounded > 0 ? rounded : null;
}
