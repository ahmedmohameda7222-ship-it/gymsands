import type { NutritionFacts } from "./contracts";

const nutrientKeys = ["calories", "protein_g", "carbs_g", "fat_g", "fiber_g"] as const;

type NutrientKey = (typeof nutrientKeys)[number];

function validateKnownNutritionValue(value: number | null, field: NutrientKey) {
  if (value === null) return null;
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${field} must be a finite non-negative number or null.`);
  }
  return value;
}

export function sumNutritionFacts(values: NutritionFacts[]): NutritionFacts {
  const result = {} as NutritionFacts;

  for (const key of nutrientKeys) {
    let total = 0;
    let unknown = false;

    for (const value of values) {
      const nutrient = validateKnownNutritionValue(value[key], key);
      if (nutrient === null) {
        unknown = true;
        continue;
      }
      total += nutrient;
    }

    result[key] = unknown ? null : total;
  }

  return result;
}

export function scaleNutritionFacts(value: NutritionFacts, scale: number): NutritionFacts {
  if (!Number.isFinite(scale) || scale < 0) {
    throw new Error("Nutrition scale must be a finite non-negative number.");
  }

  return Object.fromEntries(
    nutrientKeys.map((key) => {
      const nutrient = validateKnownNutritionValue(value[key], key);
      return [key, nutrient === null ? null : nutrient * scale];
    }),
  ) as NutritionFacts;
}

export function hasCompleteNutrition(value: NutritionFacts) {
  return (["calories", "protein_g", "carbs_g", "fat_g"] as const).every(
    (key) => validateKnownNutritionValue(value[key], key) !== null,
  );
}
